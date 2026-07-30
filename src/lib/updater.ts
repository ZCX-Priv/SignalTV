// PWA 版本更新管理器 —— 统一接管 Service Worker 注册与更新流程。
//
// 架构：单一状态机，不再用一堆互相纠缠的布尔标志事后猜测「这次事件属于
// 哪条流程」。核心事实来源只有两个：
// - phase：当前进行中的流程阶段（见 UpdatePhase）；
// - registration.waiting：实时的待激活 SW（ServiceWorker 对象引用即会话内
//   的版本身份，新版本 = 新对象，无需再算哈希比对）。
// 所有「是否/如何提示」的决策收敛到唯一函数 reconcile()，每次都基于实时
// waiting + 当前 updateMode 判断，天然对齐真实版本、杜绝跨事件标志错配。
//
// 三种更新方式（用户偏好持久化在 useStore.updateMode）：
// - auto：后台静默增量下载（断点续传由 Workbox 预缓存天然提供：install
//   逐文件先 cacheMatch，已缓存的跳过；中断后重试只补缺失文件），会话内
//   不打扰；下次进入页面时由 activateWaitingBeforeBoot 在 React 挂载前无感
//   激活并重载，用户看到的是一次正常加载。
// - manual：弹交互式 toast（更新/忽略/X），点「更新」走模拟进度条 → 10s
//   倒计时 → applyUpdate；点「忽略」把版本哈希写入 IDB 永久跳过该版本；
//   点 X 仅本会话静默该版本（记 worker 引用），下次进入页面再提示。
// - off：不周期检查更新，也不提示。
//
// 设置页「检查更新」按钮走 checkForUpdates()：用户显式意图，绕过周期间隔，
// 自身 await 检查结果后直接分流（不依赖后续事件猜测）：
// - manual：发现新版本弹交互式 toast（显式意图，绕过忽略/本会话静默）；
// - auto：单条进度 toast 全程接管：「发现新版本，正在下载…」→「正在安装…」
//   → success「已完成更新」，不弹交互式 toast；waiting 保持不动，仍按 auto
//   语义下次启动无感激活。
//
// 跨版本可靠性：激活统一走 applyUpdate/activateWaitingBeforeBoot，读实时
// waiting、同时监听 controllerchange 与 waiting.state==="activated" 两个信号，
// 兜底超时拉长到 10s，避免旧版「固定 2s 超时即强制 reload」与新 SW 慢激活
// （activate 阶段 cleanupOutdatedCaches 清旧预缓存）竞态导致的黑屏/chunk 失效。
//
// 版本哈希（fnv1a(sw.js)）仅用于 manual 的「持久忽略」：只在用户点忽略时
// 记录、在 manual 即将弹 toast 时读一次（按 worker 引用缓存，每个 waiting
// 至多 fetch 一次）。auto/off 全程零额外 fetch，弱网下不被哈希计算阻塞。
import { registerSW } from "virtual:pwa-register";
import { toastStore, toast } from "./toast";
import { idbGet, idbSet } from "./idb";
import { useStore, getBootPersistedState } from "../store/useStore";
import type { UpdateMode } from "../store/useStore";
import { t } from "../i18n";

// 忽略版本记录的 IDB key（只存最近一次被忽略的版本哈希）
const IGNORED_KEY = "signaltv-ignored-update";
// 周期检查间隔：60 分钟
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// tab 从后台切回可见时的最小检查间隔：5 分钟
const VISIBLE_CHECK_GAP_MS = 5 * 60 * 1000;
// 网络恢复（online 事件）后的最小补查间隔：1 分钟
const ONLINE_CHECK_GAP_MS = 60 * 1000;
// SW 安装失败（如下载中断，installing → redundant）后的退避重试起步延迟：60s，
// 每次失败翻倍（封顶见下），安装成功或网络恢复（online）时复位
const INSTALL_RETRY_DELAY_MS = 60 * 1000;
// 退避重试延迟封顶：10 分钟——失败常态化（弱网非断网，online 事件不会来）
// 时的稳态重试频率；离线时 update() 秒抛，重试代价极低，不算空转轮询
const INSTALL_RETRY_MAX_MS = 10 * 60 * 1000;
// manual 点「更新」后的模拟下载进度总时长（资源实际已被 SW 预缓存完毕）
const PROGRESS_DURATION_MS = 1500;
// 下载完成后自动刷新的倒计时秒数
const RELOAD_COUNTDOWN_S = 10;
// applyUpdate 发出 SKIP_WAITING 后的兜底超时：拉长到 10s，给新 SW 充分的
// 激活时间，避免短兜底 reload 撞上 activate 阶段的缓存清理（chunk 失效）
const APPLY_FALLBACK_MS = 10_000;
// 启动期无感激活兜底超时：同样 10s，仅作极端卡死逃生舱（详见 activateWaitingBeforeBoot）
const BOOT_ACTIVATE_TIMEOUT_MS = 10_000;
// 等待 zustand persist rehydrate 的兜底超时（IDB 异常时不至于永久卡住）
const HYDRATION_TIMEOUT_MS = 3000;
// 启动期自动重载的防循环护栏 key（sessionStorage）
const RELOAD_GUARD_KEY = "signaltv-update-reloading";
// auto 显式检查：模拟下载进度封顶百分比（真实安装完成前不跑满，
// 安装完成（statechange installed）后才跳 100 转「正在安装…」）
const AUTO_FLOW_PROGRESS_CAP = 90;
// auto 显式检查：模拟进度推进到封顶的总时长
const AUTO_FLOW_PROGRESS_MS = 4000;
// auto 显式检查：waiting 已存在（资源早已下载完）时快速跑满的时长
const AUTO_FLOW_FAST_MS = 600;
// auto 显式检查：「正在安装…」停留时长，之后收掉进度 toast 弹「已完成更新」
const AUTO_FLOW_INSTALL_MS = 1000;
// auto 显式检查进度流程的停滞兜底：installing 超时仍未 installed/redundant
//（半开连接下 SW 内预缓存 fetch 可挂数分钟直到浏览器杀 SW）→ 降级进度
// toast 并释放 phase，避免全程阻塞后台检查。0.5Mbps 下 2.4MB 预缓存约
// 60-90s，取 120s 留足余量
const AUTO_FLOW_STALL_MS = 120_000;

// ── 状态机 ──

// 更新流程阶段：任一时刻至多一条流程活跃（模式单值 + 模式切换清理保证互斥）
// - idle：无进行中的提示流程
// - available/downloading/countdown：manual 交互式流程的三段
// - progress：auto 显式检查的单条进度 toast 接管中
// - applying：已发 SKIP_WAITING，整页重载在即（终态，任何决策都让路）
type UpdatePhase =
  | "idle"
  | "available"
  | "downloading"
  | "countdown"
  | "progress"
  | "applying";

let registration: ServiceWorkerRegistration | null = null;
let swScriptUrl: string | null = null;
let phase: UpdatePhase = "idle";
// manual 交互式流程当前处理的 waiting worker（点忽略/X 时据此定位版本）
let activeWorker: ServiceWorker | null = null;
// 本会话点过 X 静默的 worker：同一 worker 不再自动提示，新版本（新对象）照常提示
let dismissedWorker: ServiceWorker | null = null;
// auto 显式流程本会话已收尾的 worker：再次显式检查该版本直接回「最新」，不重跑流程
let autoDoneWorker: ServiceWorker | null = null;
let toastId: string | null = null; // manual 交互式 toast 的 id（null = 未展示）
let autoFlowToastId: string | null = null; // auto 显式检查进度 toast 的 id
let checkInFlight = false; // 显式检查(checkForUpdates)进行中：后台检查一律让路
let bgCheckInFlight = false; // 后台检查(maybeCheck)进行中：防自身并发(周期与重试均 minGap=0)
// 安装失败后的指数退避重试链（替代旧版单发 60s 重试：弱网下单发失败
// 即断链，要等 60 分钟周期才有下一次机会）
let installRetryTimer: ReturnType<typeof setTimeout> | null = null;
let installRetryDelay = INSTALL_RETRY_DELAY_MS; // 当前退避延迟（成功/online 复位）
let lastCheckAt = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let autoFlowTimer: ReturnType<typeof setInterval> | null = null;
// auto 进度流程的停滞兜底定时器（与 autoFlowTimer 同生命周期统一清理）
let autoFlowStallTimer: ReturnType<typeof setTimeout> | null = null;
// 版本哈希缓存：按 worker 引用缓存，保证每个 waiting 至多 fetch 一次 sw.js
let versionHashCache: { worker: ServiceWorker; hash: string | null } | null = null;

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

function clearAutoFlowTimer(): void {
  if (autoFlowTimer !== null) {
    clearInterval(autoFlowTimer);
    autoFlowTimer = null;
  }
  if (autoFlowStallTimer !== null) {
    clearTimeout(autoFlowStallTimer);
    autoFlowStallTimer = null;
  }
}

// worker 是否已装好（可激活）：waiting=installed，激活中/后同样视为已就绪
function isInstalled(worker: ServiceWorker): boolean {
  return worker.state === "installed" || worker.state === "activated";
}

// ── 版本哈希（仅用于 manual 持久忽略） ──

// FNV-1a 32 位哈希：0 依赖，对 sw.js 全文计算，构建产物变化即哈希变化
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// 取 sw.js 文本算版本哈希；失败/超时返回 null（离线/停滞网络下不阻断提示流程）
async function computeVersionId(): Promise<string | null> {
  if (!swScriptUrl) return null;
  try {
    // 10s 超时：停滞网络下无限挂起会拖延 manual 模式的 toast 弹出
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(swScriptUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return fnv1a(await res.text());
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

// 按 worker 引用缓存哈希：新版本 = 新 worker 对象，缓存自然失效并重算
async function getVersionHash(worker: ServiceWorker): Promise<string | null> {
  if (versionHashCache?.worker === worker) return versionHashCache.hash;
  const hash = await computeVersionId();
  versionHashCache = { worker, hash };
  return hash;
}

// 该 waiting 版本是否被用户持久忽略；哈希失败（null）时判为未忽略（宁可多提示）
async function isIgnored(worker: ServiceWorker): Promise<boolean> {
  const hash = await getVersionHash(worker);
  if (hash === null) return false;
  const ignored = await idbGet(IGNORED_KEY).catch(() => undefined);
  return ignored === hash;
}

// ── 就绪等待 ──

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

// 等待 persist rehydrate 完成：SW 的 waiting 事件可能早于 IDB 中 updateMode
// 偏好就绪，直接读 store 会拿到默认值（auto）而非用户偏好（如 manual）
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

// 渲染前读取持久化的 updateMode（此时 persist 尚未 rehydrate，不能读 store
// 默认值；与 useStore 的 getInitial* 同模式的原始解析）
async function getBootUpdateMode(): Promise<UpdateMode> {
  try {
    const state = (await getBootPersistedState()) as {
      updateMode?: UpdateMode;
    } | null;
    const m = state?.updateMode;
    if (m === "manual" || m === "off") return m;
  } catch {
    // 解析失败按默认 auto 处理
  }
  return "auto";
}

/**
 * 启动期无感激活：main.tsx bootstrap 在 React 挂载前 await。
 * auto 模式且存在上个会话装好的 waiting SW 时（waiting 仅在全部资源预缓存
 * 完成后才会出现，天然保证「没下载完不替换」），发 SKIP_WAITING 并在新 SW
 * 确认接管后整页重载 —— 此时页面仅有 index.html 主题底色，重载表现为一次
 * 正常加载，无旧版闪现/黑屏。
 *
 * 可靠性：同时监听 controllerchange 与 waiting.state==="activated"，任一到达
 * 即重载；兜底超时 10s（不再是旧版的 2s）—— 跨版本大预缓存激活较慢时，短
 * 兜底会在新 SW 尚在 activate 阶段（cleanupOutdatedCaches 清旧缓存）就强制
 * reload，导致旧页面 chunk 失效。一旦发出 SKIP_WAITING，Promise 永不 resolve、
 * 必定重载：激活指令无法撤回。
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
    // 正常路径：新 SW 确认接管（controllerchange）或自身激活完成后重载
    navigator.serviceWorker.addEventListener("controllerchange", reload, {
      once: true,
    });
    waiting.addEventListener("statechange", () => {
      if (waiting.state === "activated") reload();
    });
    // 防循环护栏先于 SKIP_WAITING 写入：任一路径的重载都受护栏保护
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    } catch {
      // 护栏写入失败也照常激活重载（前面已确认 sessionStorage 可读）
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
    // 兜底逃生舱：激活确实卡死时重载后仍由旧 SW 控制、照常进旧版（护栏已
    // 消费不会循环）；激活稍慢完成则前面两个信号会先触发、进新版
    setTimeout(reload, BOOT_ACTIVATE_TIMEOUT_MS);
  });
}

// ── manual 模式：交互式更新 toast 流程 ──

// 程序性收掉 manual 提示 toast（模式切换/忽略），不设本会话静默标记
function dismissPromptToast(): void {
  clearFlowTimers();
  if (toastId) {
    toastStore.getState().dismiss(toastId);
    toastId = null;
  }
}

// 用户点 X：本会话静默该 worker 版本（Toaster 已负责 dismiss，此处清状态）
function onPromptClosed(): void {
  clearFlowTimers();
  dismissedWorker = activeWorker;
  toastId = null;
  activeWorker = null;
  phase = "idle";
}

// 点「忽略」：把该版本哈希写入 IDB，永久不再提示（哈希失败则无法持久记录，
// 退化为仅收掉本次提示 —— 下次仍会评估，符合「宁可多提示」）
function ignoreVersion(): void {
  const worker = activeWorker;
  if (worker) {
    void getVersionHash(worker).then((hash) => {
      if (hash) void idbSet(IGNORED_KEY, hash).catch(() => {});
    });
  }
  dismissPromptToast();
  activeWorker = null;
  phase = "idle";
}

// 点「更新」：模拟下载进度 0→100（真实资源已预缓存，见文件头注释）
function startDownload(): void {
  if (phase !== "available" || !toastId) return;
  phase = "downloading";
  const id = toastId;
  // 标题直接换成「正在下载更新…」，清空按钮，起进度条
  toastStore.getState().update(id, {
    title: t("update.downloading"),
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

// 进度满格后：10s 倒计时按钮（刷新页面 (Ns)），归零或点击即激活重载
function startCountdown(id: string): void {
  phase = "countdown";
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
          onClick: () => void applyUpdate(),
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
      void applyUpdate();
      return;
    }
    render();
  }, 1000);
}

// 交互式更新提示的 toast 字段（更新/忽略两按钮）；key:undefined 使复用检查中
// toast 后脱离 update-check 去重键，避免下次检查命中同键把提示串改回「检查中」
function promptToastFields() {
  return {
    type: "info" as const,
    title: t("update.available"),
    description: undefined,
    progress: undefined,
    duration: Infinity,
    sticky: true,
    key: undefined,
    onClose: onPromptClosed,
    actions: [
      {
        label: t("update.actionUpdate"),
        variant: "primary" as const,
        onClick: startDownload,
      },
      {
        label: t("update.actionIgnore"),
        variant: "ghost" as const,
        onClick: ignoreVersion,
      },
    ],
  };
}

// 渲染交互式更新 toast。reuseId 仍在场 → 原地变身（单条 toast 平滑过渡，
// 供设置页把「正在检查」提示就地改成交互提示）；否则新建一条 sticky toast
function renderPromptToast(reuseId?: string): void {
  const store = toastStore.getState();
  const canReuse =
    reuseId !== undefined &&
    store.toasts.some((it) => it.id === reuseId && !it.closing);
  if (canReuse) {
    store.update(reuseId, promptToastFields());
    toastId = reuseId;
  } else {
    toastId = store.add(promptToastFields());
  }
}

// 弹交互式更新 toast（幂等：非 idle 时不重复弹，供 reconcile 后台发现新版调用）
function showPromptToast(worker: ServiceWorker): void {
  if (phase !== "idle") return;
  phase = "available";
  activeWorker = worker;
  renderPromptToast();
}

/**
 * 设置页「检查更新」在「正在检查」最短展示后调用：把该检查中 toast 原地
 * 变身为交互式更新提示（避免与「有新版本」并存两条 toast）。若等待期间流程
 * 被模式切换等清空/改写（phase 已非 available 或已另有提示 toast），则收掉这条
 * 复用 toast，不残留「正在检查」。
 */
export function presentUpdatePrompt(reuseId: string): void {
  if (
    phase !== "available" ||
    !activeWorker ||
    (toastId !== null && toastId !== reuseId)
  ) {
    toastStore.getState().dismiss(reuseId);
    return;
  }
  renderPromptToast(reuseId);
}

// ── 统一激活入口 ──

/**
 * 激活 waiting SW 并整页重载。读实时 waiting（不缓存旧引用），同时监听
 * controllerchange 与 waiting.state==="activated"，任一到达即重载；兜底 10s。
 * 跨版本场景下，页面挂起期间服务器可能已连发多版，此处始终应用最新的 waiting。
 */
async function applyUpdate(): Promise<void> {
  if (phase === "applying") return;
  phase = "applying";
  clearFlowTimers();
  let done = false;
  const reloadOnce = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };
  // 优先读当前 registration 的实时 waiting；缺失时从最新 registration 再取一次
  let worker = registration?.waiting ?? null;
  let latestReg: ServiceWorkerRegistration | undefined;
  if (!worker) {
    latestReg = await navigator.serviceWorker
      .getRegistration()
      .catch(() => undefined);
    worker = latestReg?.waiting ?? null;
  }
  if (!worker) {
    // 无 waiting 但有 installing（manual 认领了仍在下载的 worker，用户在其
    // 转 waiting 前就点了「更新」）：立即 reload 会重载回旧版本，必须等
    // statechange 到 installed 后再发 SKIP_WAITING（activated/兜底超时照旧
    // 由下方监听与 APPLY_FALLBACK_MS 接管）
    const installing = latestReg?.installing ?? registration?.installing ?? null;
    if (installing) {
      worker = installing;
    } else {
      // 无 waiting 也无 installing（已被其他 tab 激活等）→ 直接刷新即是新版本
      reloadOnce();
      return;
    }
  }
  const target = worker;
  navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, {
    once: true,
  });
  target.addEventListener("statechange", () => {
    if (target.state === "activated") reloadOnce();
    // installing 路径：安装完成转 installed 的瞬间补发 SKIP_WAITING
    //（此前发送会被 SW 忽略：skipWaiting 对未安装完的 worker 无效）
    if (target.state === "installed") {
      target.postMessage({ type: "SKIP_WAITING" });
    }
  });
  if (isInstalled(target) && target.state === "activated") {
    // 极罕见竞态：已激活 → 直接重载
    reloadOnce();
  } else if (target.state !== "installing") {
    target.postMessage({ type: "SKIP_WAITING" });
  }
  // 逃生舱：正常路径 controllerchange/activated 先到，不会触发此兜底
  //（installing 超时/redundant 也由它接管：重载后仍是旧版，下次 reconcile 重提）
  setTimeout(reloadOnce, APPLY_FALLBACK_MS);
}

// ── auto 显式检查：单条进度 toast 流程 ──

// 创建「发现新版本，正在下载…」进度 toast 并推进：
// - worker 已装好（waiting）：快速跑满 → 直接转「正在安装…」→「已完成更新」；
// - worker 安装中（installing）：进度封顶 90 等真实安装完成（statechange
//   installed）→ 跳满转安装提示；安装失败（redundant）→ 转错误提示。
function startAutoProgress(worker: ServiceWorker, reuseId?: string): void {
  if (autoFlowToastId) return; // 已在进行
  phase = "progress";
  const alreadyInstalled = isInstalled(worker);
  const cap = alreadyInstalled ? 100 : AUTO_FLOW_PROGRESS_CAP;
  const duration = alreadyInstalled ? AUTO_FLOW_FAST_MS : AUTO_FLOW_PROGRESS_MS;
  // 用户点 X：仅收掉进度提示，下载安装照常在后台继续
  const onClose = () => {
    clearAutoFlowTimer();
    autoFlowToastId = null;
    if (phase === "progress") phase = "idle";
  };
  const store = toastStore.getState();
  const canReuse =
    reuseId !== undefined &&
    store.toasts.some((it) => it.id === reuseId && !it.closing);
  let id: string;
  if (canReuse) {
    // 复用检查中 toast 原地变身为进度 toast；key:undefined 脱离 update-check
    // 去重键，避免下次检查命中同键把进度提示串改回「检查中」
    store.update(reuseId, {
      type: "info",
      title: t("update.foundDownloading"),
      description: undefined,
      duration: Infinity,
      sticky: true,
      key: undefined,
      progress: 0,
      onClose,
    });
    id = reuseId;
  } else {
    id = store.add({
      type: "info",
      title: t("update.foundDownloading"),
      duration: Infinity,
      sticky: true,
      progress: 0,
      onClose,
    });
  }
  autoFlowToastId = id;
  const startedAt = Date.now();
  autoFlowTimer = setInterval(() => {
    const pct = Math.min(
      cap,
      Math.round(((Date.now() - startedAt) / duration) * 100),
    );
    toastStore.getState().update(id, { progress: pct });
    if (pct >= cap && autoFlowTimer !== null) {
      clearAutoFlowTimer();
      // 快路径（资源已就绪）：不等 statechange，直接转安装提示
      if (cap >= 100) finishAutoProgress(worker);
    }
  }, 100);
  // 安装中路径：监听真实安装完成/失败 + 停滞兜底
  if (!alreadyInstalled) {
    const onState = () => {
      if (isInstalled(worker)) {
        worker.removeEventListener("statechange", onState);
        finishAutoProgress(worker);
      } else if (worker.state === "redundant") {
        worker.removeEventListener("statechange", onState);
        failAutoProgress();
      }
    };
    worker.addEventListener("statechange", onState);
    // 停滞兜底：超时仍未 installed/redundant（半开连接下 SW 内 fetch 可挂
    // 数分钟）→ 进度 toast 原地降级为普通提示并释放 phase，解除对后台
    // 检查的全程阻塞（重复下载仍由 maybeCheck 的 registration.installing
    // 守卫杜绝）。onState 监听保留：稍后 installed 仍弹「已完成更新」
    //（toastId 已空，finishAutoProgress 只弹 success）；redundant 静默交给
    // 退避重试链（failAutoProgress 的 toastId-null 分支不弹错）。
    // 正常收尾时由 finish/fail 内的 clearAutoFlowTimer 统一清掉本定时器。
    autoFlowStallTimer = setTimeout(() => {
      autoFlowStallTimer = null;
      clearAutoFlowTimer();
      if (autoFlowToastId === id) {
        // 标题本就是「发现新版本，正在后台下载…」，去进度条/去 sticky/
        // 限时自动消失（与 toast.ts 默认时长一致）即是准确的降级语义
        toastStore.getState().update(id, {
          progress: undefined,
          sticky: false,
          duration: 3500,
        });
        autoFlowToastId = null;
      }
      if (phase === "progress") phase = "idle";
    }, AUTO_FLOW_STALL_MS);
  }
}

// 真实安装完成：进度跳满 →「正在安装…」→ 收掉进度 toast 弹「已完成更新」；
// 进度 toast 已被用户关闭时仅弹完成提示（更新确实已就绪）
function finishAutoProgress(worker: ServiceWorker): void {
  clearAutoFlowTimer();
  autoDoneWorker = worker; // 记录该版本已走完显式流程 → 再次显式检查回「最新」
  const id = autoFlowToastId;
  if (!id) {
    toast.success(t("update.done"));
    if (phase === "progress") phase = "idle";
    return;
  }
  toastStore.getState().update(id, {
    title: t("update.installing"),
    progress: 100,
  });
  setTimeout(() => {
    if (autoFlowToastId !== id) return; // 用户已手动关闭
    autoFlowToastId = null;
    toastStore.getState().dismiss(id);
    toast.success(t("update.done"));
    if (phase === "progress") phase = "idle";
  }, AUTO_FLOW_INSTALL_MS);
}

// 安装失败（installing → redundant）：收掉进度 toast 转错误提示
function failAutoProgress(): void {
  clearAutoFlowTimer();
  if (autoFlowToastId) {
    toastStore.getState().dismiss(autoFlowToastId);
    autoFlowToastId = null;
    toast.error(t("update.checkFailed"));
  }
  if (phase === "progress") phase = "idle";
}

// 收掉进行中的 auto 显式检查进度流程（模式切换时用；后台下载安装不受影响）
function cancelAutoFlow(): void {
  clearAutoFlowTimer();
  if (autoFlowToastId) {
    toastStore.getState().dismiss(autoFlowToastId);
    autoFlowToastId = null;
  }
  if (phase === "progress") phase = "idle";
}

/**
 * 设置页「检查更新」在「正在检查」最短展示后调用（auto/off）：把该检查中 toast
 * 原地变身为进度 toast 并推进（避免与进度提示并存两条）。若等待期间流程被清空
 * （phase 已非 progress）或已另有进度 toast，则收掉这条复用 toast，不残留「正在检查」。
 */
export function presentAutoProgress(reuseId: string): void {
  const worker = registration?.installing ?? registration?.waiting ?? null;
  if (phase !== "progress" || !worker || autoFlowToastId !== null) {
    // 兜底早退前复位 phase：checkForUpdates 已置 progress 但 worker 在等待
    // 窗口内消失（如被另一标签页激活）时，若不复位，reconcile/maybeCheck
    // 会因 phase !== "idle" 永久让路，本会话后台更新检查全部停摆
    if (phase === "progress" && autoFlowToastId === null) phase = "idle";
    toastStore.getState().dismiss(reuseId);
    return;
  }
  startAutoProgress(worker, reuseId); // 复用检查中 toast 变身为进度 toast
}

// ── 唯一决策函数 ──

// 基于实时 waiting + 当前 updateMode 决定是否/如何提示。onNeedRefresh、周期
// 检查、可见性检查、online 补查、模式切换统一调用。串行安全：多入口并发时
// 靠 phase 幂等 + await 后重校验，保证至多弹一条、且对齐真实版本。
async function reconcile(): Promise<void> {
  if (phase !== "idle") return; // applying/progress/manual 流程进行中 → 不介入
  if (!registration?.waiting) {
    activeWorker = null;
    return;
  }
  await waitForHydration();
  if (phase !== "idle") return;
  const waiting = registration?.waiting ?? null;
  if (!waiting) return;
  const mode = useStore.getState().updateMode;
  // auto/off：保持 waiting 静默（下次启动由 activateWaitingBeforeBoot 无感激活）
  if (mode !== "manual") return;
  if (waiting === dismissedWorker) return; // 本会话已点 X 静默该版本
  if (await isIgnored(waiting)) return; // 已持久忽略该版本
  if (phase !== "idle") return;
  await waitForAppReady(); // Loader 期间延后到进入正式界面
  if (phase !== "idle") return;
  if (registration?.waiting !== waiting) return; // await 期间已被新版取代 → 交给下一次 reconcile
  if (useStore.getState().updateMode !== "manual") return;
  showPromptToast(waiting);
}

// ── 手动检查（设置页「检查更新」按钮） ──

/** 手动检查结果：available=新版已发现并弹交互提示；handled=auto 模式已由进度 toast 接管；latest=已是最新；failed=检查失败 */
export type CheckUpdateResult =
  | "available"
  | "handled"
  | "latest"
  | "failed";

// 认领一个已存在的 waiting/installing worker（不触发新的 update()/下载），按模式分流
function adoptExistingWorker(
  worker: ServiceWorker,
  mode: UpdateMode,
): CheckUpdateResult {
  if (mode === "manual") {
    // 绕过忽略/本会话静默（显式检查是强意图）；worker 可能仍在 installing，
    // 同一对象后续转 waiting，点「更新」时 applyUpdate 读实时 waiting 即可激活
    dismissedWorker = null;
    phase = "available";
    activeWorker = worker;
    return "available";
  }
  // auto：本会话已走完显式流程的版本 → 视为最新，不重跑
  if (worker === autoDoneWorker) return "latest";
  if (phase === "progress") return "handled";
  phase = "progress";
  return "handled";
}

/**
 * 用户显式检查更新：绕过周期间隔限制，自身 await 检查结果后直接分流
 *（不改变持久化的模式偏好，不依赖后续事件猜测）：
 * - manual：发现新版本弹交互式更新 toast（更新/忽略/X），绕过忽略/本会话静默；
 * - auto：单条进度 toast 全程接管：下载进度 → 正在安装 → 已完成更新
 *（off 模式下按钮已隐藏，此处按 auto 语义兜底）。
 */
export async function checkForUpdates(): Promise<CheckUpdateResult> {
  if (!registration || phase === "applying" || checkInFlight) return "failed";
  checkInFlight = true;
  try {
    const mode = useStore.getState().updateMode;
    // 已就绪(waiting)或正在下载(installing) → 认领现有 worker，不重复触发下载
    //（防「手动检查」撞上「后台/自动已在下载」造成并发下载、网络占道）
    const existing = registration.waiting ?? registration.installing;
    if (existing) return adoptExistingWorker(existing, mode);
    lastCheckAt = Date.now();
    try {
      await registration.update();
    } catch {
      // 离线/网络异常
      return "failed";
    }
    const worker = registration.installing ?? registration.waiting;
    if (worker) return adoptExistingWorker(worker, mode);
    return "latest";
  } finally {
    checkInFlight = false;
  }
}

// ── 周期检查 ──

// 后台检查结果：供退避重试链续链决策（done=update() 已执行；
// failed=update() 抛错；skipped=被守卫让路/未到间隔）
type BgCheckOutcome = "done" | "failed" | "skipped";

async function maybeCheck(minGap: number): Promise<BgCheckOutcome> {
  if (!registration) return "skipped";
  if (useStore.getState().updateMode === "off") return "skipped";
  // 并发/下载防护：显式检查进行中 / 已有活跃流程(manual 交互·auto 进度·applying) /
  // 已有 SW 正在安装(真实下载中) / 另一路后台检查进行中 → 一律让路，杜绝重复触发下载
  if (checkInFlight || bgCheckInFlight || phase !== "idle") return "skipped";
  if (registration.installing) return "skipped";
  if (Date.now() - lastCheckAt < minGap) return "skipped";
  bgCheckInFlight = true;
  lastCheckAt = Date.now();
  let outcome: BgCheckOutcome = "done";
  try {
    await registration.update();
  } catch {
    // 离线/网络异常 → 静默；回滚间隔戳：失败的检查不占用 visibility(5min)/
    // online(1min) 的最小间隔窗口，下一个事件触发即可立刻补查
    lastCheckAt = 0;
    outcome = "failed";
  } finally {
    bgCheckInFlight = false;
  }
  // update() 若发现新版会经 onNeedRefresh 触发 reconcile；但「本已存在的
  // waiting」不会再次触发事件，这里主动补一次 reconcile 兜底评估
  void reconcile();
  return outcome;
}

// ── 安装监视与退避重试链 ──

// 排期一次退避重试（幂等：已有排期则让它跑完）。到期后经 maybeCheck
// 发起检查（保持 registration.update() 仅有 maybeCheck/checkForUpdates 两个
// 调用点的约束），并按结果续链：
// - failed（update() 网络失败）：翻倍退避后再排——旧版此处直接断链，
//   弱网（非断网，online 事件不会来）要等 60 分钟周期才有下一次机会；
// - skipped（被守卫让路：显式检查/活跃流程/已在安装）：同延迟再排；
//   模式已切 off 则终止链；
// - done：链自然移交——有新版则 updatefound → watchInstalling 接管
//  （再失败会重新进链），无新版（已最新/版本回撤）则终止。
function scheduleInstallRetry(): void {
  if (installRetryTimer !== null) return;
  installRetryTimer = setTimeout(() => {
    installRetryTimer = null;
    void maybeCheck(0).then((outcome) => {
      if (useStore.getState().updateMode === "off") return;
      if (outcome === "failed") {
        installRetryDelay = Math.min(installRetryDelay * 2, INSTALL_RETRY_MAX_MS);
        scheduleInstallRetry();
      } else if (outcome === "skipped") {
        scheduleInstallRetry();
      }
    });
  }, installRetryDelay);
}

// 已挂监视的 worker：updatefound 与注册就绪时的遗留 installing 两条路径
// 可能碰同一对象，防重复挂监听/重复调度重试
const watchedWorkers = new WeakSet<ServiceWorker>();

// 监视一个正在安装（或刚发现）的 worker 的安装结局：
// - 安装成功（installed/activated）：退避延迟复位；
// - 安装失败（redundant，如下载中断）：收掉 auto 进度流程（若在），
//   以当前延迟排期重试，并为下次失败翻倍退避。
function watchInstalling(worker: ServiceWorker): void {
  if (watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  worker.addEventListener("statechange", () => {
    if (isInstalled(worker)) {
      installRetryDelay = INSTALL_RETRY_DELAY_MS;
      return;
    }
    if (worker.state !== "redundant") return;
    failAutoProgress();
    scheduleInstallRetry();
    installRetryDelay = Math.min(installRetryDelay * 2, INSTALL_RETRY_MAX_MS);
  });
}

/**
 * 初始化 PWA 更新管理器（main.tsx bootstrap 末尾调用一次）。
 * 注册 SW + 周期检查 + 订阅 updateMode 变化联动。
 */
export function initUpdater(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // 安全网：会话运行中 controller 被更换（多标签页激活新 SW、强刷旁路等）
  // 意味着旧预缓存已/即将被 cleanupOutdatedCaches 清理，旧页面继续运行会
  // 出现懒加载 chunk 失效等各式错误 → 整页重载进入完整新版本。
  // 正在播放时不立即掩断：弹 sticky toast 告知，等播放器关闭
  //（activeChannelId → null）后再重载 —— 旧页面带风险续命的窗口仅限
  // 播放期间，且 phase="applying" 已阻断其它更新流程介入。
  // 仅在本页加载时已有 controller 才监听：首次安装的 clients.claim 不应触发
  // 重载（避免首访误刷）。applyUpdate 自身激活时已置 phase="applying"，此处
  // 让路避免重复 reload。
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (phase === "applying") return;
      phase = "applying";
      if (useStore.getState().activeChannelId === null) {
        window.location.reload();
        return;
      }
      // 播放中：延迟到播放器关闭时重载（订阅不随 toast 关闭而取消：
      // chunk 已失效的旧页面继续长期运行风险更高）
      toastStore.getState().add({
        type: "info",
        title: t("update.deferredReload"),
        duration: Infinity,
        sticky: true,
      });
      const unsub = useStore.subscribe((s) => {
        if (s.activeChannelId !== null) return;
        unsub();
        window.location.reload();
      });
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
      //（Workbox 预缓存逐文件先 cacheMatch，已下载的不会重下）；
      // 退避延迟同步复位：网络已恢复，无需继续长退避
      window.addEventListener("online", () => {
        installRetryDelay = INSTALL_RETRY_DELAY_MS;
        void maybeCheck(ONLINE_CHECK_GAP_MS);
      });
      // 安装失败（installing → redundant）→ 指数退避重试链：60s 起步、
      // 每次失败翻倍、封顶 10 分钟，安装成功或 online 时复位（旧版单发
      // 60s 重试在弱网下失败即断链，要等 60 分钟周期）。auto 进度流程
      // 进行中则收掉进度 toast 转错误提示。监视统一走 watchInstalling。
      r.addEventListener("updatefound", () => {
        const installing = r.installing;
        if (!installing) return;
        watchInstalling(installing);
      });
      // 上一会话遗留的 installing（下载跨会话未完成）：本会话不会再
      // 触发 updatefound，必须在注册就绪时主动补挂监视，否则它失败
      //（redundant）时无人调度重试——这是「后台下载卡住」的监听盲区
      if (r.installing) watchInstalling(r.installing);
      // 上个会话遗留的 waiting SW：workbox 的 waiting 事件可能早于本回调
      // 设置 registration 就触发（此时 reconcile 读不到 registration 而提前
      // 返回、不再重试），故注册就绪后主动补一次 reconcile 兜底评估
      if (r.waiting) void reconcile();
    },
    onNeedRefresh() {
      void reconcile();
    },
  });

  // 模式切换联动：统一委托 reconcile 重新决策，切走 manual/auto 时清理各自
  // 遗留 toast。用户显式切换视为新意图 → 清本会话 X 静默标记。
  useStore.subscribe((s, prev) => {
    if (s.updateMode === prev.updateMode) return;
    if (phase === "applying") return; // 重载在即，不打扰
    dismissedWorker = null;
    // 切到 auto/off：收掉进行中的 manual 交互式流程（waiting 保持，下次启动激活）
    if (
      s.updateMode !== "manual" &&
      (phase === "available" || phase === "downloading" || phase === "countdown")
    ) {
      dismissPromptToast();
      activeWorker = null;
      phase = "idle";
    }
    // 收掉遗留的 auto 显式检查进度 toast（后台下载安装不受影响）
    cancelAutoFlow();
    void reconcile();
  });
}
