// PWA 版本更新管理器 —— 统一接管 Service Worker 注册与更新流程。
//
// 三种更新方式（用户偏好持久化在 useStore.updateMode）：
// - auto：后台静默增量下载（断点续传由 Workbox 预缓存天然提供：
//   install 逐文件先 cacheMatch，已缓存的跳过；中断后重试只补缺失文件），
//   会话内不打扰；下次进入页面时由 activateWaitingBeforeBoot 在 React
//   挂载前无感激活并重载，用户看到的是一次正常加载。
//   （历史教训：曾在 pagehide 瞬间发 SKIP_WAITING，新 SW 激活与刷新导航
//   并发，旧 SW 返回的旧 HTML 引用的资源已被清理 → 黑屏）
// - manual：弹交互式 toast（更新/忽略/X），点「更新」走模拟进度条 →
//   10s 倒计时 → SKIP_WAITING + reload；点「忽略」把版本号写入 IDB
//   永久跳过该版本；点 X 仅本会话静默，下次进入页面再提示。
// - off：不周期检查更新，也不提示。
//
// 设置页「检查更新」按钮走 checkForUpdates()：用户显式意图，绕过 off
// 模式与周期间隔限制，无论当前模式发现新版本都弹交互式 toast。
//
// 版本标识：onNeedRefresh 不携带版本号，取 sw.js 文本做 FNV-1a 哈希
// 作为 versionId（sw.js 内含 precache revision，每次构建必变）。
// fetch 失败时 versionId 为 null → 跳过忽略匹配，照常提示（宁可多提示不可漏）。
import { registerSW } from "virtual:pwa-register";
import { toastStore } from "./toast";
import { idbGet, idbSet } from "./idb";
import { useStore } from "../store/useStore";
import type { UpdateMode } from "../store/useStore";
import { t } from "../i18n";

// 忽略版本记录的 IDB key（只存最近一次被忽略的 versionId）
const IGNORED_KEY = "signaltv-ignored-update";
// 周期检查间隔：60 分钟
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// tab 从后台切回可见时的最小检查间隔：5 分钟
const VISIBLE_CHECK_GAP_MS = 5 * 60 * 1000;
// 模拟下载进度总时长（onNeedRefresh 时资源实际已被 SW 预缓存完毕）
const PROGRESS_DURATION_MS = 1500;
// 下载完成后自动刷新的倒计时秒数
const RELOAD_COUNTDOWN_S = 10;
// SKIP_WAITING 后等待 controllerchange 的兜底超时
const RELOAD_FALLBACK_MS = 3000;
// 等待 zustand persist rehydrate 的兜底超时（IDB 异常时不至于永久卡住）
const HYDRATION_TIMEOUT_MS = 3000;
// 启动期无感激活：等待 controllerchange 的兜底超时（超时同样重载，
// 详见 activateWaitingBeforeBoot —— SKIP_WAITING 发出后绝不继续跑旧版）
const BOOT_ACTIVATE_TIMEOUT_MS = 2000;
// 启动期自动重载的防循环护栏 key（sessionStorage）
const RELOAD_GUARD_KEY = "signaltv-update-reloading";
// 网络恢复（online 事件）后的最小补查间隔：1 分钟
const ONLINE_CHECK_GAP_MS = 60 * 1000;
// SW 安装失败（如下载中断）后的单次重试延迟：60s
const INSTALL_RETRY_DELAY_MS = 60 * 1000;

// ── 模块级状态 ──
let registration: ServiceWorkerRegistration | null = null;
let swScriptUrl: string | null = null;
let updateAvailable = false; // onNeedRefresh 已触发（存在 waiting SW）
let versionId: string | null = null; // 当前 waiting SW 的版本哈希
let promptedVersionId: string | null = null; // 本会话最近一次弹过 toast 的版本
let toastId: string | null = null; // 更新 toast 的 id（null = 未展示）
let dismissedThisSession = false; // 用户点 X：本会话不再弹同版本
let downloading = false; // 已点「更新」，进度/倒计时流程中（防重入）
let reloading = false; // 已触发整页重载（防重入）
let retryScheduled = false; // 安装失败后的单次重试已排期
let checking = false; // checkForUpdates 进行中（防重入）
let explicitCheck = false; // 用户显式「检查更新」触发的下载中，完成后强制弹 toast
let lastCheckAt = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function clearFlowTimers(): void {
  if (progressTimer !== null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// FNV-1a 32 位哈希：0 依赖，对 sw.js 全文计算，构建产物变化即哈希变化
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// 取 sw.js 文本算版本哈希；失败返回 null（离线/网络异常时不阻断提示流程）
async function computeVersionId(): Promise<string | null> {
  if (!swScriptUrl) return null;
  try {
    const res = await fetch(swScriptUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return fnv1a(await res.text());
  } catch {
    return null;
  }
}

// 等待离开首屏加载页：Loader 可见期间不弹更新 toast（会盖在加载日志上），
// 等应用进入稳定态（加载完成 loaded，或失败进入错误屏）后再展示
function waitForAppReady(): Promise<void> {
  const settled = () => {
    const s = useStore.getState();
    return s.loaded || s.error !== null;
  };
  if (settled()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useStore.subscribe(() => {
      if (!settled()) return;
      unsub();
      resolve();
    });
  });
}

// 等待 persist rehydrate 完成：SW 的 waiting 事件可能早于 IDB 中
// updateMode 偏好就绪，直接读 store 会拿到默认值而非用户偏好
function waitForHydration(): Promise<void> {
  if (useStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsub();
      resolve();
    }, HYDRATION_TIMEOUT_MS);
    const unsub = useStore.persist.onFinishHydration(() => {
      clearTimeout(timeout);
      unsub();
      resolve();
    });
  });
}

// ── auto 模式：启动期无感激活（渲染前完成，用户只看到一次正常加载） ──

// 渲染前读取持久化的 updateMode（此时 persist 尚未 rehydrate，
// 不能读 store 默认值；与 useStore 的 getInitial* 同模式的原始解析）
async function getBootUpdateMode(): Promise<UpdateMode> {
  try {
    const raw = await idbGet("signaltv-iptv");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: { updateMode?: UpdateMode };
      };
      const m = parsed.state?.updateMode;
      if (m === "manual" || m === "off") return m;
    }
  } catch {
    // 解析失败按默认 auto 处理
  }
  return "auto";
}

/**
 * 启动期无感激活：main.tsx bootstrap 在 React 挂载前 await。
 * auto 模式且存在上个会话装好的 waiting SW 时（waiting 仅在全部资源
 * 预缓存完成后才会出现，天然保证「没下载完不替换」），发 SKIP_WAITING
 * 并在 controllerchange（新 SW 确认接管）后整页重载 —— 此时页面仅有
 * index.html 主题底色，重载表现为一次正常加载，无旧版闪现/黑屏。
 * 一旦发出 SKIP_WAITING，Promise 永不 resolve、必定重载：激活指令无法
 * 撤回，若超时后继续挂载旧版，新 SW 随后激活会清理旧预缓存
 *（cleanupOutdatedCaches）并接管页面（clientsClaim），旧版懒加载 chunk
 * 拉取即失败（曾表现为「播放器加载失败」等各式错误）。
 */
export async function activateWaitingBeforeBoot(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // 防循环护栏：上一次加载刚完成自动激活重载 → 本次直接正常启动
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
      return;
    }
  } catch {
    // sessionStorage 不可用（隐私模式）→ 无护栏则不做启动期激活，避免重载循环
    return;
  }
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.getRegistration();
  } catch {
    return;
  }
  const waiting = reg?.waiting;
  if (!waiting) return;
  if ((await getBootUpdateMode()) !== "auto") return;
  await new Promise<void>(() => {
    // 故意永不 resolve：任一路径都会重载，阻止 bootstrap 继续挂载旧版
    let done = false;
    const reload = () => {
      if (done) return;
      done = true;
      window.location.reload();
    };
    // 正常路径：新 SW 确认接管后重载，进入完整新版本
    navigator.serviceWorker.addEventListener("controllerchange", reload, {
      once: true,
    });
    // 防循环护栏先于 SKIP_WAITING 写入：任一路径的重载都受护栏保护
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    } catch {
      // 护栏写入失败也照常激活重载（前面已确认 sessionStorage 可读）
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
    // 兜底：激活超时同样重载 —— 激活确实卡死时重载后仍由旧 SW 控制、
    // 照常进旧版（护栏已消费不会循环）；激活稍慢完成则重载即进新版
    setTimeout(reload, BOOT_ACTIVATE_TIMEOUT_MS);
  });
}

// ── manual 模式：更新 toast 流程 ──

// 程序性关闭 toast（模式切换/忽略），不设置会话关闭标记
function dismissToast(): void {
  clearFlowTimers();
  downloading = false;
  if (toastId) {
    toastStore.getState().dismiss(toastId);
    toastId = null;
  }
}

// 用户点 X：清理定时器并标记本会话不再弹（Toaster 已负责 dismiss）
function onToastClosed(): void {
  clearFlowTimers();
  downloading = false;
  toastId = null;
  dismissedThisSession = true;
}

// 点「忽略」：版本号写入 IDB，该版本永久不再提示；
// versionId 为 null（哈希失败）时无法标记，退化为 X 的本会话关闭语义
function ignoreVersion(): void {
  if (versionId) {
    void idbSet(IGNORED_KEY, versionId).catch(() => {});
  } else {
    dismissedThisSession = true;
  }
  dismissToast();
}

// 点「更新」：模拟下载进度 0→100（真实资源已预缓存，见文件头注释）
function startDownload(): void {
  if (downloading || reloading || !toastId) return;
  downloading = true;
  const id = toastId;
  toastStore.getState().update(id, {
    description: t("update.downloading"),
    actions: [],
    progress: 0,
  });
  const startedAt = Date.now();
  progressTimer = setInterval(() => {
    const pct = Math.min(
      100,
      Math.round(((Date.now() - startedAt) / PROGRESS_DURATION_MS) * 100),
    );
    toastStore.getState().update(id, { progress: pct });
    if (pct >= 100 && progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
      startCountdown(id);
    }
  }, 100);
}

// 进度满格后：10s 倒计时按钮（刷新页面 (Ns)），归零或点击即刷新
function startCountdown(id: string): void {
  let remain = RELOAD_COUNTDOWN_S;
  const render = () =>
    toastStore.getState().update(id, {
      title: t("update.ready"),
      description: undefined,
      progress: 100,
      actions: [
        {
          label: t("update.actionReload", { s: remain }),
          variant: "primary",
          onClick: applyAndReload,
        },
      ],
    });
  render();
  countdownTimer = setInterval(() => {
    remain -= 1;
    if (remain <= 0) {
      if (countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      applyAndReload();
      return;
    }
    render();
  }, 1000);
}

// 激活 waiting SW 并刷新页面：controllerchange 后 reload，3s 兜底强制 reload
function applyAndReload(): void {
  if (reloading) return;
  reloading = true;
  clearFlowTimers();
  const waiting = registration?.waiting;
  if (!waiting) {
    // waiting 已不存在（如已被其他 tab 激活）→ 直接刷新即是新版本
    window.location.reload();
    return;
  }
  let done = false;
  const reload = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };
  navigator.serviceWorker?.addEventListener("controllerchange", reload, {
    once: true,
  });
  waiting.postMessage({ type: "SKIP_WAITING" });
  // 逃生舱：正常路径 controllerchange 先到，不会触发此兜底
  setTimeout(reload, RELOAD_FALLBACK_MS);
}

function showUpdateToast(): void {
  if (toastId) return;
  promptedVersionId = versionId;
  dismissedThisSession = false;
  toastId = toastStore.getState().add({
    type: "info",
    title: t("update.available"),
    duration: Infinity,
    sticky: true,
    onClose: onToastClosed,
    actions: [
      {
        label: t("update.actionUpdate"),
        variant: "primary",
        onClick: startDownload,
      },
      {
        label: t("update.actionIgnore"),
        variant: "ghost",
        onClick: ignoreVersion,
      },
    ],
  });
}

// manual 模式分派：忽略版本/本会话已关闭 → 静默，否则弹 toast
async function dispatchManual(): Promise<void> {
  if (reloading || toastId) return;
  // Loader 可见期不弹：等进入正式界面后再展示（延迟期间仅推迟展示，
  // 判定在真正展示前执行，用户中途切走 manual 模式则不再弹出）
  await waitForAppReady();
  if (reloading || toastId) return;
  if (useStore.getState().updateMode !== "manual") return;
  // 本会话点过 X：同版本不再弹；周期检查发现更新的版本（哈希不同）则重新提示
  if (dismissedThisSession) {
    if (versionId === null || versionId === promptedVersionId) return;
  }
  if (versionId) {
    const ignored = await idbGet(IGNORED_KEY).catch(() => undefined);
    if (ignored === versionId) return;
  }
  showUpdateToast();
}

// ── 决策入口 ──

async function handleNewVersion(): Promise<void> {
  updateAvailable = true;
  await waitForHydration();
  versionId = await computeVersionId();
  // 用户显式「检查更新」触发的下载完成：跳过模式/忽略判定直接弹交互式 toast
  if (explicitCheck) {
    explicitCheck = false;
    dismissedThisSession = false;
    if (!reloading && !toastId) showUpdateToast();
    return;
  }
  applyMode(useStore.getState().updateMode);
}

// 按当前模式落实行为（onNeedRefresh 与模式切换共用）
function applyMode(mode: UpdateMode): void {
  if (reloading || !updateAvailable) return;
  if (mode === "off") {
    dismissToast();
    return;
  }
  if (mode === "auto") {
    // 会话中途发现的新版本静默保持 waiting，不打扰当前观看；
    // 下次进入页面时由 activateWaitingBeforeBoot 在渲染前无感激活
    dismissToast();
    return;
  }
  // manual
  void dispatchManual();
}

// ── 手动检查（设置页「检查更新」按钮） ──

/** 手动检查结果：available=新版已就绪并已弹提示；downloading=发现新版下载中；latest=已是最新；failed=检查失败 */
export type CheckUpdateResult =
  | "available"
  | "downloading"
  | "latest"
  | "failed";

/**
 * 用户显式检查更新：绕过 off 模式与周期间隔限制，无论当前 updateMode
 * 为何，发现新版本都弹交互式更新 toast（不改变持久化的模式偏好）。
 */
export async function checkForUpdates(): Promise<CheckUpdateResult> {
  if (checking || !registration) return "failed";
  checking = true;
  try {
    // 已存在装好的 waiting SW：显式检查视为新意图，
    // 跳过忽略版本/本会话关闭判定直接弹出
    if (registration.waiting) {
      updateAvailable = true;
      dismissedThisSession = false;
      if (versionId === null) versionId = await computeVersionId();
      if (!reloading && !toastId) showUpdateToast();
      return "available";
    }
    lastCheckAt = Date.now();
    // 先立显式标记再触发检查：install 极快完成时 onNeedRefresh 也能命中显式分支
    explicitCheck = true;
    try {
      await registration.update();
    } catch {
      // 离线/网络异常
      explicitCheck = false;
      return "failed";
    }
    if (registration.installing || registration.waiting) return "downloading";
    explicitCheck = false;
    return "latest";
  } finally {
    checking = false;
  }
}

// ── 周期检查 ──

async function maybeCheck(minGap: number): Promise<void> {
  if (!registration) return;
  if (useStore.getState().updateMode === "off") return;
  if (Date.now() - lastCheckAt < minGap) return;
  lastCheckAt = Date.now();
  try {
    await registration.update();
  } catch {
    // 离线/网络异常 → 静默，下个周期再试
  }
}

/**
 * 初始化 PWA 更新管理器（main.tsx bootstrap 末尾调用一次）。
 * 注册 SW + 周期检查 + 订阅 updateMode 变化联动。
 */
export function initUpdater(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // 安全网：会话运行中 controller 被更换（多标签页激活新 SW、强刷旁路等）
  // 意味着旧预缓存已/即将被 cleanupOutdatedCaches 清理，旧页面继续运行会
  // 出现懒加载 chunk 失效等各式错误 → 立即整页重载进入完整新版本。
  // 仅在本页加载时已有 controller 才监听：首次安装的 clients.claim
  // 不应触发重载（避免首访误刷）。
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, r) {
      swScriptUrl = swUrl;
      registration = r ?? null;
      if (!r) return;
      lastCheckAt = Date.now();
      // 每 60 分钟检查一次；tab 切回可见且距上次检查 ≥5 分钟时补查一次
      setInterval(() => void maybeCheck(0), CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          void maybeCheck(VISIBLE_CHECK_GAP_MS);
        }
      });
      // 网络恢复即补查：上次中断的下载在新一轮 install 中增量续传
      //（Workbox 预缓存逐文件先 cacheMatch，已下载的不会重下）
      window.addEventListener("online", () => {
        void maybeCheck(ONLINE_CHECK_GAP_MS);
      });
      // 安装失败（如下载中断，installing → redundant）→ 60s 后单次重试；
      // 重试再失败则等 online 事件或 60 分钟周期，避免离线时空转轮询
      r.addEventListener("updatefound", () => {
        const installing = r.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state !== "redundant" || retryScheduled) return;
          retryScheduled = true;
          setTimeout(() => {
            retryScheduled = false;
            void maybeCheck(0);
          }, INSTALL_RETRY_DELAY_MS);
        });
      });
    },
    onNeedRefresh() {
      void handleNewVersion();
    },
  });

  // 模式切换联动：off/auto 清理提示转静默、manual 立即评估是否弹 toast
  useStore.subscribe((s, prev) => {
    if (s.updateMode === prev.updateMode) return;
    // 用户显式切换视为新意图：清除「本会话已关闭」标记，
    // 切到 manual 且存在未忽略的 waiting SW 时能立即弹出
    dismissedThisSession = false;
    applyMode(s.updateMode);
  });
}
