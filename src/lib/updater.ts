// PWA 版本更新管理器 —— 统一接管 Service Worker 注册与更新流程。
//
// 三种更新方式（用户偏好持久化在 useStore.updateMode）：
// - auto：静默安装 + 下次生效。发现新版本后不打扰当前会话，
//   在页面隐藏/离开（pagehide）瞬间向 waiting SW 发 SKIP_WAITING，
//   下次打开/刷新即进入新版本。避免 mid-session 激活清掉旧 precache
//   导致运行中页面懒加载 chunk（如语言包）失败。
// - manual：弹交互式 toast（更新/忽略/X），点「更新」走模拟进度条 →
//   10s 倒计时 → SKIP_WAITING + reload；点「忽略」把版本号写入 IDB
//   永久跳过该版本；点 X 仅本会话静默，下次进入页面再提示。
// - off：不周期检查更新，也不提示。
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

// ── 模块级状态 ──
let registration: ServiceWorkerRegistration | null = null;
let swScriptUrl: string | null = null;
let updateAvailable = false; // onNeedRefresh 已触发（存在 waiting SW）
let versionId: string | null = null; // 当前 waiting SW 的版本哈希
let promptedVersionId: string | null = null; // 本会话最近一次弹过 toast 的版本
let toastId: string | null = null; // 更新 toast 的 id（null = 未展示）
let dismissedThisSession = false; // 用户点 X：本会话不再弹同版本
let downloading = false; // 已点「更新」，进度/倒计时流程中（防重入）
let reloading = false; // 已触发 applyAndReload（防重入）
let pagehideArmed = false; // auto 模式的 pagehide 激活监听已挂
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

// ── auto 模式：pagehide 静默激活 ──

function sendSkipWaiting(): void {
  registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
}

function armPagehideActivation(): void {
  if (pagehideArmed) return;
  pagehideArmed = true;
  window.addEventListener("pagehide", sendSkipWaiting);
  // 页面本就处于后台（如后台 tab 里周期检查发现更新）→ 立即激活
  if (document.visibilityState === "hidden") sendSkipWaiting();
}

function disarmPagehideActivation(): void {
  if (!pagehideArmed) return;
  pagehideArmed = false;
  window.removeEventListener("pagehide", sendSkipWaiting);
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
  applyMode(useStore.getState().updateMode);
}

// 按当前模式落实行为（onNeedRefresh 与模式切换共用）
function applyMode(mode: UpdateMode): void {
  if (reloading || !updateAvailable) return;
  if (mode === "off") {
    disarmPagehideActivation();
    dismissToast();
    return;
  }
  if (mode === "auto") {
    dismissToast();
    armPagehideActivation();
    return;
  }
  // manual
  disarmPagehideActivation();
  void dispatchManual();
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
    },
    onNeedRefresh() {
      void handleNewVersion();
    },
  });

  // 模式切换联动：off 清理提示、auto 转静默激活、manual 立即评估是否弹 toast
  useStore.subscribe((s, prev) => {
    if (s.updateMode === prev.updateMode) return;
    // 用户显式切换视为新意图：清除「本会话已关闭」标记，
    // 切到 manual 且存在未忽略的 waiting SW 时能立即弹出
    dismissedThisSession = false;
    applyMode(s.updateMode);
  });
}
