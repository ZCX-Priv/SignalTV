import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Category,
  ChannelWithStream,
  CountryInfo,
} from "../types";
import {
  api,
  ApiError,
  buildChannelIndex,
  buildCountryInfo,
  type ApiErrorInfo,
} from "../lib/api";
import { probeBatch } from "../lib/latency";
import {
  runThemeTransition,
  type ThemeTransitionOrigin,
} from "../lib/themeTransition";
import { idbGet, idbSet, idbStorage } from "../lib/idb";
import { applySeo, describeView } from "../lib/seo";
import {
  isValidTimezoneOffset,
  syncActiveTimeZone,
  type TimezonePref,
} from "../lib/timezone";
import {
  SUPPORTED_LOCALES,
  applyLocaleSideEffects,
  loadLocale,
  resolveLocale,
  type LanguagePref,
  type Locale,
} from "../i18n";

// 批量节流更新 latency：200ms 窗口内合并多次 setLatency 为一次 set，
// 避免 5000 频道 × new Map(s.latency) 的 O(n²) 开销。
let pendingLatency = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const LATENCY_FLUSH_MS = 200;

// 探测 in-flight 去重：探测需 1-3s 才写入 latency，期间滚动触发的下一批
// 会重复探测同一批 URL，用此集合拦截，避免浪费带宽
const probeInFlight = new Set<string>();

// ── latency 独立持久化 ──
// latency 不走 zustand persist：persist 对每次 setState 都全量 JSON 序列化
// 并写 IDB，探测期间 200ms 一次的 flush 会造成约 10 次/秒 × 数百 KB 的
// 写放大。改为独立 IDB key + 独立防抖写入，并带时间戳做 24h TTL——延迟
// 是网络环境快照而非频道属性，跨会话陈旧值（含 -1 失败项）到期自动
// 失效重测，弱网瞬间测出的失败不再永久固化
const LATENCY_KEY = "signaltv-latency";
const LATENCY_TTL_MS = 24 * 60 * 60 * 1000;
const LATENCY_SAVE_DEBOUNCE_MS = 2000;
// id → 探测时刻（与 latency Map 平行维护，仅持久化链路使用）
const latencyStamp = new Map<string, number>();
let latencySaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLatencySave(): void {
  if (latencySaveTimer) return;
  latencySaveTimer = setTimeout(() => {
    latencySaveTimer = null;
    const now = Date.now();
    const entries: [string, number, number][] = [];
    for (const [id, ms] of useStore.getState().latency) {
      entries.push([id, ms, latencyStamp.get(id) ?? now]);
    }
    void idbSet(LATENCY_KEY, JSON.stringify(entries)).catch(() => {});
  }, LATENCY_SAVE_DEBOUNCE_MS);
}

// 读取上次会话的延迟结果：逐项形状校验 [id, ms, at] + TTL 过滤
//（at 在未来视为污染同样丢弃），命中项回填 latencyStamp 供本会话续写
async function loadPersistedLatency(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const raw = await idbGet(LATENCY_KEY);
    if (!raw) return out;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return out;
    const now = Date.now();
    for (const e of parsed) {
      if (
        Array.isArray(e) &&
        typeof e[0] === "string" &&
        typeof e[1] === "number" &&
        typeof e[2] === "number" &&
        e[2] <= now &&
        now - e[2] < LATENCY_TTL_MS
      ) {
        out.set(e[0], e[1]);
        latencyStamp.set(e[0], e[2]);
      }
    }
  } catch {
    // 读取/解析失败 → 视为无缓存，照常全新探测
  }
  return out;
}

// 延迟探测全局并发：所有探测入口（按需 / 全量）统一 128 路，不区分网络环境。
// probeBatch 内部还有主机感知调度（单主机 4 路 + 连续 3 次超时/网络错误熔断），
// 保证发包时必有空闲 socket 配额，计时不含浏览器内部排队时间
const PROBE_CONCURRENCY = 128;

// 手动全量探测（状态页）：模块级 controller 供取消；进度写回 200ms 节流，
// 避免 5000+ 次回调逐条 setState 刷屏
let fullProbeController: AbortController | null = null;
let fullProbeProgressTimer: ReturnType<typeof setTimeout> | null = null;

/** 手动全量探测的运行态（非持久化，仅状态页进度展示用） */
export interface ProbeRun {
  running: boolean;
  total: number;
  done: number;
}

/** 全量探测结果汇总（调用方据此弹 toast；null = 未启动/重复调用） */
export interface ProbeRunSummary {
  /** 实际完成探测的频道数（取消时小于 total） */
  done: number;
  /** 可达（延迟 >= 0）的频道数 */
  ok: number;
  aborted: boolean;
}

function batchSetLatency(id: string, ms: number) {
  pendingLatency.set(id, ms);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const patch = pendingLatency;
    pendingLatency = new Map();
    flushTimer = null;
    const now = Date.now();
    useStore.setState((s) => {
      const next = new Map(s.latency);
      for (const [k, v] of patch) {
        next.set(k, v);
        latencyStamp.set(k, now);
      }
      return { latency: next };
    });
    // 独立防抖落盘（latency 不在 persist 白名单内，见上方模块注释）
    scheduleLatencySave();
  }, LATENCY_FLUSH_MS);
}

export type Theme = "dark" | "light";

// 用户主题偏好：system 表示跟随系统 prefers-color-scheme；
// light/dark 为用户显式选择，会覆盖系统偏好并持久化。
// theme 字段保留为实际渲染值（dark|light），由 themeMode 派生。
export type ThemeMode = "system" | "light" | "dark";

// PWA 更新方式：auto 静默安装下次生效 / manual 弹 toast 询问 / off 不检查更新。
// 具体更新流程由 src/lib/updater.ts 驱动，此处只持久化用户偏好。
export type UpdateMode = "auto" | "manual" | "off";

// 同步：跟随系统 prefers-color-scheme，用于 store 初始化（避免 Promise 赋给 Theme 字段）
function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

// 同步写一份 theme 副本到 localStorage，供 index.html 内联脚本在下次首屏时同步读取，
// 避免 React 挂载前 IndexedDB 异步 rehydrate 期间出现 dark→light 闪烁（FOUC）。
// 同时同步 <html data-theme>，让所有 theme 变更点（setTheme/setThemeMode/onRehydrateStorage）
// 统一走此函数，消除 App.tsx useEffect 重复设置。
// localStorage 不可用（隐私模式）时静默失败，仍走 IDB persist 路径。
function syncThemeCache(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
    // 同步 theme-color meta：移动端浏览器地址栏/状态栏颜色随主题切换
    //（值与 index.css 的 --bg 变量保持一致）
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#f5f1e8" : "#0a0a0f");
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("signaltv-theme-cache", theme);
  } catch {
    // localStorage 不可用（隐私模式/配额满）→ 忽略，IDB persist 仍是 source of truth
  }
}

// 启动期共享的持久化快照：theme/language/timezone/updateMode 四处预读
// 都解析同一个 IDB key（signaltv-iptv），缓存单次读取避免重复 IO
let bootStatePromise: Promise<Record<string, unknown> | null> | null = null;
export function getBootPersistedState(): Promise<Record<string, unknown> | null> {
  if (!bootStatePromise) {
    bootStatePromise = idbGet("signaltv-iptv")
      .then((raw) => {
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
        return parsed.state ?? null;
      })
      .catch(() => null);
  }
  return bootStatePromise;
}

// 首次访问跟随系统 prefers-color-scheme；用户手动切换后持久化覆盖
// 异步：从 IndexedDB 读取持久化的主题（main.tsx 在渲染前 await 此函数，
// 拿到结果后会通过 useStore.setState 同步给 store）
export async function getInitialTheme(): Promise<Theme> {
  if (typeof window === "undefined") return "dark";
  const state = (await getBootPersistedState()) as {
    theme?: Theme;
    themeMode?: ThemeMode;
  } | null;
  if (state) {
    // 优先按 themeMode 推导实际渲染值（兼容旧版只有 theme 字段的持久化）
    const mode = state.themeMode;
    if (mode === "system") return getSystemTheme();
    if (mode === "light" || mode === "dark") return mode;
    if (state.theme === "dark" || state.theme === "light") {
      return state.theme;
    }
  }
  return getSystemTheme();
}

// 异步：从 IndexedDB 读取持久化的语言偏好（main.tsx 在渲染前 await，
// 据此预加载语言包，避免首屏文案闪烁）。无效/缺失时回落到 "system" 自动检测。
export async function getInitialLanguage(): Promise<LanguagePref> {
  if (typeof window === "undefined") return "system";
  const state = (await getBootPersistedState()) as { language?: string } | null;
  const lang = state?.language;
  if (lang === "system") return lang;
  if (lang && (SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
    return lang as Locale;
  }
  return "system";
}

// 异步：从 IndexedDB 读取持久化的时区偏好（main.tsx 在渲染前 await，
// 据此同步激活时区，保证首屏时钟即为目标时区）。无效/越界/缺失时回落 "auto"。
export async function getInitialTimezone(): Promise<TimezonePref> {
  if (typeof window === "undefined") return "auto";
  const state = (await getBootPersistedState()) as {
    timezonePref?: unknown;
  } | null;
  const pref = state?.timezonePref;
  // 钳制到 -11..12：污染数据（如 999）会产出非法 IANA 名使首屏时钟崩溃
  if (isValidTimezoneOffset(pref)) return pref;
  return "auto";
}

export type SortKey =
  | "default"
  | "recent"
  | "latency-asc"
  | "latency-desc"
  | "nsfw-first";

export type Filter = {
  q: string;
  categoryId: string | null; // "all" | 分类 id
  countryCode: string | null; // "all" | ISO 国家代码
  sort: SortKey;
  nsfw: boolean; // 是否包含成人内容
};

/** 频道列表展示形态：卡片网格 | 横向列表（持久化） */
export type GridLayout = "grid" | "list";

/** 视图形态作用域：浏览页（首页/分类/国家/搜索共享）、收藏页、历史页各自独立 */
export type LayoutScope = "browse" | "favorites" | "history";

/** 各作用域默认形态：历史页挂长时间轴，默认列表更紧凑 */
const DEFAULT_GRID_LAYOUTS: Record<LayoutScope, GridLayout> = {
  browse: "grid",
  favorites: "grid",
  history: "list",
};

export type View =
  | { kind: "home" }
  | { kind: "category"; id: string }
  | { kind: "country"; code: string }
  | { kind: "favorites" }
  | { kind: "history" }
  | { kind: "status" }
  | { kind: "settings" };

// 播放历史条目：按频道去重，重复播放会把该频道条目提升至最新时间，
// 供 HistoryPanel 以垂直时间线展示；与 recents（去重、供排序）独立
export interface HistoryEntry {
  id: string;
  at: number; // Date.now() 时间戳
}

// 历史上限：超出截断尾部（最旧），避免持久化体积无限增长
const HISTORY_LIMIT = 200;

// 搜索历史上限：去重置顶后截断尾部（仿 YouTube 搜索框下拉）
const SEARCH_HISTORY_LIMIT = 20;

// 错峰入场总时长：末行延迟 1.4s + 淡入 0.4s，须与 App.css .loader__l5 延迟及
// fade-in 时长同步（Loader 合并行门控与 init 停留时长计算共用）
export const LOG_STAGGER_END_MS = 1800;

// 合并行打 [OK] 前至少显示光标的时长，避免行与 [OK] 同帧出现
const MERGE_MIN_VISIBLE_MS = 600;

// 两大文件上次会话实测解压后字节数的 IDB key：作为下次下载进度
// 百分比的分母。不能用 Content-Length：gzip 传输下它是压缩后大小、
// 读流字节是解压后，比值下载十几个百分点就超 100% 被钳到 99，进度失真
const BYTES_KEY = {
  channels: "signaltv-bytes-channels",
  streams: "signaltv-bytes-streams",
} as const;

// 首访无 IDB 实测基准时的兜底分母：Content-Length（压缩后）× gzip 解压比率
// 估算解压后体积。比率为对 iptv-org 线上文件的实测经验值（channels.json
// 压缩 1.27MB/解压 10.3MB ≈ 8.1x；streams.json 0.59MB/3.73MB ≈ 6.3x），
// 数据形态稳定漂移缓慢；估算误差由钳制 99 与 [OK] 完成信号兜底。
// 首次会话结束写入实测体积后，后续会话均优先用实测基准。
const GZIP_EST_RATIO = {
  channels: 8,
  streams: 6.3,
} as const;

// 首屏加载进度（固定五行 Loader 用）：所有字段均原地刷新，不重挂载
export interface LoadProgress {
  /** 频道表已就绪 → 第2行 [OK] */
  channelsReady: boolean;
  /** 信号流已就绪 → 第3行 [OK] */
  streamsReady: boolean;
  /** 频道表下载百分比（0~99；分母为上次会话实测体积，首次访问无基准时缺省）→ 第2行 [n%] */
  channelsPct?: number;
  /** 信号流下载百分比（0~99，同上）→ 第3行 [n%] */
  streamsPct?: number;
  /** 两大文件合计已下载（如 2.3MB） */
  size?: string;
  /** 合计瞬时速率（如 512KB/s） */
  speed?: string;
  /** 合并阶段：光标移到"正在合并信号表"行 */
  merging?: boolean;
  /** 合并完成 → 合并行原地追加 [OK]，1s 后进主页 */
  mergeOk?: boolean;
}

interface State {
  // 数据
  channels: Map<string, ChannelWithStream>;
  categories: Category[];
  countries: CountryInfo[];
  loaded: boolean;
  loading: boolean;
  /** 加载错误：存文案 key，展示时翻译（ErrorState / StatusPanel） */
  error: ApiErrorInfo | null;
  /** 首屏加载进度（固定五行 Loader；null = 未开始/已结束） */
  loadProgress: LoadProgress | null;

  // 延迟探测
  latency: Map<string, number>; // 频道id → 延迟ms，-1 表示失败
  /** 手动全量探测运行态（状态页进度条；null = 未在运行） */
  probeRun: ProbeRun | null;

  // 界面状态
  view: View;
  filter: Filter;
  activeChannelId: string | null; // 播放器目标
  favorites: string[];
  recents: string[]; // 最近观看，最新在前
  history: HistoryEntry[]; // 播放历史，最新在前，每次播放追加一条
  searchHistory: string[]; // 搜索历史词，最新在前，回车/带词打开频道时记录，持久化
  recentCategories: string[]; // 最近使用的分类，最新在前
  recentCountries: string[]; // 最近使用的国家 code，最新在前
  sidebarCollapsed: boolean; // 桌面端侧边栏收起
  mobileSidebarOpen: boolean; // 移动端抽屉式侧边栏开关
  searchOpen: boolean; // 移动端搜索框展开（上移到 store 供 Ctrl+K 共用）
  theme: Theme; // 实际渲染主题（dark|light），由 themeMode 派生
  themeMode: ThemeMode; // 用户主题偏好（system|light|dark），持久化
  language: LanguagePref; // 用户语言偏好（system|具体 locale），持久化
  locale: Locale; // 实际界面语言，由 language 派生（system 时自动检测）
  updateMode: UpdateMode; // PWA 更新方式（auto|manual|off），持久化
  timezonePref: TimezonePref; // 时区偏好（auto|UTC 整数偏移），持久化
  gridLayouts: Record<LayoutScope, GridLayout>; // 各作用域的频道列表展示形态，持久化

  // 动作
  init: () => Promise<void>;
  setView: (v: View) => void;
  setFilter: (patch: Partial<Filter>) => void;
  openChannel: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
  pushRecent: (id: string) => void;
  pushHistory: (id: string) => void;
  removeHistoryEntries: (ids: string[]) => void;
  clearHistory: () => void;
  pushSearchHistory: (term: string) => void;
  removeSearchHistory: (terms: string[]) => void;
  pushRecentCategory: (id: string) => void;
  pushRecentCountry: (code: string) => void;
  probeLatencyForIds: (ids: string[]) => Promise<void>;
  /** 状态页手动全量检测：探测所有有流频道（含已探测过的，真重测） */
  runFullProbe: () => Promise<ProbeRunSummary | null>;
  /** 取消进行中的全量检测 */
  cancelFullProbe: () => void;
  toggleSidebar: () => void;
  setMobileSidebar: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setTheme: (t: Theme) => void;
  setThemeMode: (m: ThemeMode, origin?: ThemeTransitionOrigin) => void;
  setLanguage: (pref: LanguagePref) => Promise<void>;
  setUpdateMode: (m: UpdateMode) => void;
  setTimezonePref: (p: TimezonePref) => void;
  setGridLayout: (scope: LayoutScope, l: GridLayout) => void;
}

// ── 跨标签页 persist 同步 ──
// persist 是整包 last-write-wins：两个标签页各持内存副本，后写的会静默
// 覆盖先写的（如 A 页收藏后被 B 页的旧快照整包写回而丢失）。IDB 没有
// storage 事件，改用 BroadcastChannel：写入成功后广播通知其它标签页防抖
// rehydrate 把最新快照合并回内存（BroadcastChannel 不投递给自身，无回声；
// latency 已移出 persist，写入仅由收藏/历史/设置等低频用户操作触发）
const PERSIST_NAME = "signaltv-iptv";
const persistSyncChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("signaltv-persist-sync")
    : null;

// idbStorage 包装版：setItem 落盘成功后广播键名通知其它标签页
const syncedIdbStorage = {
  getItem: idbStorage.getItem,
  removeItem: idbStorage.removeItem,
  setItem: async (name: string, value: string): Promise<void> => {
    await idbStorage.setItem(name, value);
    persistSyncChannel?.postMessage(name);
  },
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      channels: new Map(),
      categories: [],
      countries: [],
      loaded: false,
      loading: false,
      error: null,
      loadProgress: null,

      view: { kind: "home" },
      filter: { q: "", categoryId: null, countryCode: null, sort: "default", nsfw: false },
      activeChannelId: null,
      favorites: [],
      recents: [],
      history: [],
      searchHistory: [],
      recentCategories: [],
      recentCountries: [],
      latency: new Map(),
      probeRun: null,
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      searchOpen: false,
      theme: getSystemTheme(),
      themeMode: "system",
      language: "system",
      locale: "zh-CN",
      updateMode: "auto",
      timezonePref: "auto",
      gridLayouts: DEFAULT_GRID_LAYOUTS,

      init: async () => {
        if (get().loaded || get().loading) return;
        // 五行日志挂载时刻：错峰入场与停留时长均以此为起点
        const startAt = Date.now();
        set({
          loading: true,
          error: null,
          loadProgress: { channelsReady: false, streamsReady: false },
        });
        // 上次会话的延迟结果与 API 下载并行读取（单次 IDB 读仅毫秒级），
        // 最终 set 时合并——本会话已产生的新鲜探测结果优先
        const latencyPromise = loadPersistedLatency();
        try {
          // 原地合并更新进度（行位置固定，不滚动）
          const patch = (p: Partial<LoadProgress>) =>
            set((s) =>
              s.loadProgress ? { loadProgress: { ...s.loadProgress, ...p } } : {},
            );
          // 两大文件完成时原地追加 [OK]（不重挂载，避免闪烁）
          const track = <T,>(p: Promise<T>, onDone: Partial<LoadProgress>): Promise<T> =>
            p.then((r) => {
              patch(onDone);
              return r;
            });
          // 大文件下载进度（弱网下让用户看到真实字节数，而非死等）：
          // 两文件合计字节数与瞬时速率，共享 300ms 节流原地刷新
          const fmtBytes = (b: number) =>
            b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;
          const fileBytes = { channels: 0, streams: 0 };
          // 进度百分比分母兜底链路：IDB 实测基准（精确，上次会话解压后
          // 字节数）→ Content-Length × 估算比率（首访无基准）→ 缺省不显示。
          // 基准读取必须 await：SW 缓存命中时下载毫秒级结束，异步读取
          // 会晚于全部 onProgress tick 导致百分比整程缺失（单次 IDB 读
          // 仅毫秒级，不阻塞启动；失败静默忽略，回退估算/不显示）
          const expectedBytes: { channels?: number; streams?: number } = {};
          await Promise.all(
            (["channels", "streams"] as const).map((file) =>
              idbGet(BYTES_KEY[file])
                .then((v) => {
                  const n = Number(v);
                  if (Number.isFinite(n) && n > 0) expectedBytes[file] = n;
                })
                .catch(() => {}),
            ),
          );
          // 首访估算分母（与实测基准分开存，实测始终优先）
          const estimatedBytes: { channels?: number; streams?: number } = {};
          // 各文件下载百分比（无任何分母时不显示）
          const filePct: { channels?: number; streams?: number } = {};
          let prevTotal = 0;
          let prevTime = 0;
          const onProgress =
            (file: keyof typeof fileBytes) => (bytes: number, contentLength?: number) => {
              // 单调递增：fetchJson 重试时 readBodyMeasured 从 0 重新计数，
              // 直接赋值会使 size/百分比回跳、速率差值为负闪现 "-xxxKB/s"
              fileBytes[file] = Math.max(fileBytes[file], bytes);
              // 会话间体积漂移很小（iptv-org 日更 ±几个百分点），百分比真实
              // 平滑推进；体积增长/估算偏小时比值可能超 100%，钳制 99，
              // 真正完成由 [OK] 表达
              if (estimatedBytes[file] === undefined && contentLength) {
                estimatedBytes[file] = contentLength * GZIP_EST_RATIO[file];
              }
              const expected = expectedBytes[file] ?? estimatedBytes[file];
              if (expected) {
                filePct[file] = Math.min(
                  99,
                  Math.floor((fileBytes[file] / expected) * 100),
                );
              }
              const now = Date.now();
              if (prevTime && now - prevTime < 300) return;
              const total = fileBytes.channels + fileBytes.streams;
              // 首次 tick 无基准不算速度
              const speed = prevTime
                ? `${fmtBytes(((total - prevTotal) / (now - prevTime)) * 1000)}/s`
                : undefined;
              prevTotal = total;
              prevTime = now;
              patch({
                size: fmtBytes(total),
                ...(speed ? { speed } : {}),
                channelsPct: filePct.channels,
                streamsPct: filePct.streams,
              });
            };
          // 两大文件就绪即进入合并阶段，不等 categories/countries 小文件
          // （SW 缓存过期时小文件可能走慢网络，避免卡在大小/速率行）；
          // 同时补一次最终大小与全程均值速率（缓存场景下载在 300ms
          // 节流窗口内结束，末次 tick 被吞、速率恒为 "--"，以均值兜底）
          let mergingAt = 0;
          const filesDone = Promise.all([
            track(api.channels(undefined, onProgress("channels")), { channelsReady: true }),
            track(api.streams(undefined, onProgress("streams")), { streamsReady: true }),
          ]).then((r) => {
            mergingAt = Date.now();
            const doneBytes = fileBytes.channels + fileBytes.streams;
            // 记录本次实测体积，作为下次会话进度百分比的分母
            //（bytes=0 表示走了无 body 回退路径，无实测值不写入）
            for (const file of ["channels", "streams"] as const) {
              if (fileBytes[file] > 0) {
                void idbSet(BYTES_KEY[file], String(fileBytes[file])).catch(() => {});
              }
            }
            patch({
              merging: true,
              size: fmtBytes(doneBytes),
              speed: `${fmtBytes((doneBytes / Math.max(1, mergingAt - startAt)) * 1000)}/s`,
            });
            return r;
          });
          const [[channels, streams], categories, countries] = await Promise.all([
            filesDone,
            api.categories(),
            api.countries(),
          ]);
          const idx = buildChannelIndex(channels, streams);
          // 形状防御与 buildChannelIndex 的归一化同级：同一数据源的单条
          // 脏记录（缺 id/name/code）不应使整个启动失败进错误屏
          const countryInfo = buildCountryInfo(
            countries.filter(
              (c) => !!c && typeof c.code === "string" && typeof c.name === "string",
            ),
            idx,
          );
          const cats = categories
            .filter(
              (c) =>
                !!c &&
                typeof c.id === "string" &&
                typeof c.name === "string" &&
                c.id !== "xxx",
            )
            .sort((a, b) => a.name.localeCompare(b.name));
          // 合并行实际显示时刻与 Loader 门控一致（须等错峰入场完成），
          // 先闪 MERGE_MIN_VISIBLE_MS 光标再打 [OK]
          const mergeShownAt = Math.max(mergingAt, startAt + LOG_STAGGER_END_MS);
          const okWait = mergeShownAt + MERGE_MIN_VISIBLE_MS - Date.now();
          if (okWait > 0) await new Promise((r) => setTimeout(r, okWait));
          patch({ mergeOk: true });
          // 全流程唯一停留：合并行 [OK] 后 1s 进主页
          await new Promise((r) => setTimeout(r, 1000));
          const persistedLatency = await latencyPromise;
          set((s) => ({
            channels: idx,
            categories: cats,
            countries: countryInfo,
            loaded: true,
            loading: false,
            loadProgress: null,
            // 上次会话结果打底，本会话已探测的新鲜值覆盖同 id 旧值
            latency: new Map([...persistedLatency, ...s.latency]),
          }));
        } catch (e) {
          set({
            loading: false,
            loadProgress: null,
            // 存文案 key 而非翻译后字符串：错误屏期间切语言也能正确展示
            error: e instanceof ApiError ? e.info : { key: "api.loadFailed" },
          });
        }
      },

      setView: (v) => {
        if (v.kind === "category") get().pushRecentCategory(v.id);
        if (v.kind === "country") get().pushRecentCountry(v.code);
        set({ view: v, filter: { ...get().filter, q: "", categoryId: null, countryCode: null } });
        // 视图切换时同步 SEO 元信息（title/description/canonical/og:*）
        const s = get();
        applySeo(
          describeView(v, s.filter, {
            categories: s.categories,
            countries: s.countries,
            channels: s.channels,
          }),
        );
      },
      setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
      openChannel: (id) => {
        if (id) {
          get().pushRecent(id);
          get().pushHistory(id);
          // 带搜索词打开频道 = 该词搜到了结果，记入搜索历史（与回车提交同源）
          get().pushSearchHistory(get().filter.q);
        }
        set({ activeChannelId: id });
      },
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((f) => f !== id)
            : [...s.favorites, id],
        })),
      pushRecent: (id) =>
        set((s) => ({
          recents: [id, ...s.recents.filter((r) => r !== id)].slice(0, 24),
        })),
      pushHistory: (id) =>
        set((s) => ({
          // 去重：同频道旧条目移除，新条目置顶（时间刷新为最新）
          history: [{ id, at: Date.now() }, ...s.history.filter((h) => h.id !== id)].slice(
            0,
            HISTORY_LIMIT
          ),
        })),
      removeHistoryEntries: (ids) =>
        set((s) => {
          // history 按频道去重，id 即条目唯一键；转 Set 后单次 filter 完成批量删除
          const gone = new Set(ids);
          return { history: s.history.filter((h) => !gone.has(h.id)) };
        }),
      clearHistory: () => set({ history: [] }),
      pushSearchHistory: (term) => {
        const q = term.trim();
        if (!q) return;
        set((s) => ({
          // 同词（大小写不敏感）去重置顶，保留最新一次的原始大小写
          searchHistory: [
            q,
            ...s.searchHistory.filter((h) => h.toLowerCase() !== q.toLowerCase()),
          ].slice(0, SEARCH_HISTORY_LIMIT),
        }));
      },
      removeSearchHistory: (terms) =>
        set((s) => {
          const gone = new Set(terms);
          return { searchHistory: s.searchHistory.filter((h) => !gone.has(h)) };
        }),
      pushRecentCategory: (id) =>
        set((s) => ({
          recentCategories: [id, ...s.recentCategories.filter((r) => r !== id)].slice(0, 24),
        })),
      pushRecentCountry: (code) =>
        set((s) => ({
          recentCountries: [code, ...s.recentCountries.filter((r) => r !== code)].slice(0, 24),
        })),
      probeLatencyForIds: async (ids) => {
        // 播放器打开时暂停探测，避免与视频流抢带宽；
        // 关闭播放器后 ChannelGrid 的 effect 会重新触发补测
        if (get().activeChannelId !== null) return;
        const channels = get().channels;
        const existing = get().latency;
        const urls = new Map<string, string>();
        for (const id of ids) {
          const c = channels.get(id);
          // 只探测有流、未探测过且不在 in-flight / 节流待刷队列中的频道
          //（探测结果先进 pendingLatency 等 200ms flush，窗口期内若不查
          // 该队列会对同一 URL 重复发起探测，白白浪费带宽）
          if (
            c?.streamUrl &&
            !existing.has(id) &&
            !pendingLatency.has(id) &&
            !probeInFlight.has(id)
          ) {
            urls.set(id, c.streamUrl);
          }
        }
        if (urls.size === 0) return;
        for (const id of urls.keys()) probeInFlight.add(id);
        // 按需探测不持有全局 controller，调用方（ChannelGrid）通过
        // useEffect cleanup 自动停止触发新批次，进行中的请求由 fetch 自身超时兑底处理
        try {
          await probeBatch(urls, PROBE_CONCURRENCY, (id, ms) => {
            probeInFlight.delete(id);
            batchSetLatency(id, ms);
          });
        } finally {
          // 异常/提前退出时清理未回调的 id，避免永久卡在 in-flight
          for (const id of urls.keys()) probeInFlight.delete(id);
        }
      },
      runFullProbe: async () => {
        // 重复启动拦截：运行中再点直接返回 null（UI 按钮此时是“取消”态）
        if (get().probeRun?.running) return null;
        // 全量收集所有有流频道（不跳过已探测项：手动检测是真重测）
        const urls = new Map<string, string>();
        for (const c of get().channels.values()) {
          if (c.streamUrl) urls.set(c.id, c.streamUrl);
        }
        if (urls.size === 0) return null;
        const controller = new AbortController();
        fullProbeController = controller;
        // 登记 in-flight：全量探测期间拦截 ChannelGrid 窗口探测的重复请求
        for (const id of urls.keys()) probeInFlight.add(id);
        set({ probeRun: { running: true, total: urls.size, done: 0 } });
        // 并发与按需探测同策略（PROBE_CONCURRENCY，见常量处注释）
        let done = 0;
        let ok = 0;
        try {
          await probeBatch(
            urls,
            PROBE_CONCURRENCY,
            (id, ms) => {
              probeInFlight.delete(id);
              done++;
              if (ms >= 0) ok++;
              batchSetLatency(id, ms);
              // 进度写回 200ms 节流：5000+ 次回调逐条 setState 会刷屏
              if (!fullProbeProgressTimer) {
                fullProbeProgressTimer = setTimeout(() => {
                  fullProbeProgressTimer = null;
                  set((s) =>
                    s.probeRun ? { probeRun: { ...s.probeRun, done } } : {},
                  );
                }, 200);
              }
            },
            controller.signal,
          );
        } finally {
          if (fullProbeProgressTimer) {
            clearTimeout(fullProbeProgressTimer);
            fullProbeProgressTimer = null;
          }
          for (const id of urls.keys()) probeInFlight.delete(id);
          if (fullProbeController === controller) fullProbeController = null;
          set({ probeRun: null });
          // 兜底落盘：末批结果经 batchSetLatency 进入 state 后确保被保存
          scheduleLatencySave();
        }
        return { done, ok, aborted: controller.signal.aborted };
      },
      cancelFullProbe: () => {
        fullProbeController?.abort();
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
      setSearchOpen: (open) => set({ searchOpen: open }),
      setTheme: (t) => {
        syncThemeCache(t);
        set({ theme: t });
      },
      setThemeMode: (m, origin) => {
        // themeMode === "system" 时根据当前 prefers-color-scheme 推导实际渲染值，
        // 否则直接使用 light/dark 作为渲染值
        const actualTheme: Theme = m === "system" ? getSystemTheme() : m;
        // 渲染值不变（如 dark → system 且系统本就是 dark）时跳过过渡动画，
        // 避免无意义的快照定格闪断
        if (actualTheme === get().theme) {
          syncThemeCache(actualTheme);
          set({ themeMode: m, theme: actualTheme });
          return;
        }
        // 状态变更放进过渡回调内执行：data-theme 属性与 React 重渲染
        //（ChannelCard 内联国旗渐变等）都会被捕获进"新主题"快照
        runThemeTransition(() => {
          syncThemeCache(actualTheme);
          set({ themeMode: m, theme: actualTheme });
        }, origin);
      },
      setLanguage: async (pref) => {
        // 先加载语言包再提交 state：确保订阅组件重渲染时字典已就绪，
        // 调用方 await 后弹的 toast 也能直接用新语言展示
        const locale = resolveLocale(pref);
        await loadLocale(locale);
        set({ language: pref, locale });
        applyLocaleSideEffects(locale);
        // 同步刷新当前视图的 SEO 元信息（title/description 随新语言）
        const s = get();
        applySeo(
          describeView(s.view, s.filter, {
            categories: s.categories,
            countries: s.countries,
            channels: s.channels,
          }),
        );
      },
      setUpdateMode: (m) => set({ updateMode: m }),
      setTimezonePref: (p) => {
        // 先同步模块级激活时区再提交 state：订阅组件重渲染时
        // format.ts 的 dtf() 已能拿到新时区
        syncActiveTimeZone(p);
        set({ timezonePref: p });
      },
      setGridLayout: (scope, l) =>
        set({ gridLayouts: { ...get().gridLayouts, [scope]: l } }),
    }),
    {
      name: PERSIST_NAME,
      storage: createJSONStorage(() => syncedIdbStorage),
      partialize: (s) => ({
        favorites: s.favorites,
        recents: s.recents,
        history: s.history,
        searchHistory: s.searchHistory,
        recentCategories: s.recentCategories,
        recentCountries: s.recentCountries,
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        themeMode: s.themeMode,
        language: s.language,
        updateMode: s.updateMode,
        timezonePref: s.timezonePref,
        gridLayouts: s.gridLayouts,
        // latency 不在白名单内：走独立 IDB key（带时间戳 TTL + 独立防抖），
        // 避免探测期间高频 setState 触发上万条目的全量序列化写放大
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // 持久化数组/对象字段形状校验：IDB 数据被污染为非法形状时，
        // 下游的 includes/filter/展开操作会直接 TypeError，污染则回落默认值
        if (!Array.isArray(state.favorites)) state.favorites = [];
        if (!Array.isArray(state.recents)) state.recents = [];
        if (!Array.isArray(state.recentCategories)) state.recentCategories = [];
        if (!Array.isArray(state.recentCountries)) state.recentCountries = [];
        state.searchHistory = Array.isArray(state.searchHistory)
          ? state.searchHistory.filter((h): h is string => typeof h === "string")
          : [];
        state.history = Array.isArray(state.history)
          ? state.history.filter(
              (h) => !!h && typeof h.id === "string" && typeof h.at === "number",
            )
          : [];
        if (typeof state.gridLayouts !== "object" || state.gridLayouts === null) {
          state.gridLayouts = DEFAULT_GRID_LAYOUTS;
        }
        // latency 已移出 persist（独立 key + TTL，见模块顶部）：
        // - 新写入的 blob 无 latency 字段 → 合并后保留当前内存 Map，不动
        //  （BroadcastChannel 触发的重复 rehydrate 也不会清空本会话结果）；
        // - 旧版 blob 里是 entries 数组 → 一次性迁移：按升级日打时间戳转入
        //   新 key（保留升级当天体验，24h 后自然过期重测）
        const rawLatency = state.latency as unknown;
        if (!(rawLatency instanceof Map)) {
          const legacy = Array.isArray(rawLatency)
            ? rawLatency.filter(
                (e): e is [string, number] =>
                  Array.isArray(e) &&
                  typeof e[0] === "string" &&
                  typeof e[1] === "number",
              )
            : [];
          state.latency = new Map(legacy);
          if (legacy.length > 0) {
            const now = Date.now();
            for (const [id] of legacy) {
              if (!latencyStamp.has(id)) latencyStamp.set(id, now);
            }
            scheduleLatencySave();
          }
        }
        // 旧版持久化数据没有 themeMode → 从 theme 推断（保留旧用户的实际偏好），
        // 否则新字段缺失会导致"跟随系统"语义意外覆盖用户已选主题
        if (!state.themeMode) {
          state.themeMode = state.theme === "light" ? "light" : "dark";
        }
        // 根据 themeMode + 系统偏好重算实际渲染 theme
        const actual: Theme =
          state.themeMode === "system" ? getSystemTheme() : state.themeMode;
        state.theme = actual;
        // 同步 <html data-theme> + localStorage 缓存，避免 main.tsx 初始值
        // 与 rehydrated 值不一致的时序窗口
        document.documentElement.dataset.theme = actual;
        syncThemeCache(actual);
        // 旧版数据没有 language → 默认跟随浏览器自动检测；
        // 重算实际 locale 并确保语言包已加载（main.tsx 预读一致时为幂等操作）
        if (!state.language) state.language = "system";
        const locale = resolveLocale(state.language);
        state.locale = locale;
        void loadLocale(locale).then(() => applyLocaleSideEffects(locale));
        // 旧版数据没有 updateMode → 回落默认「自动更新」
        if (!state.updateMode) state.updateMode = "auto";
        // 旧版数据没有 timezonePref → 回落自动检测；越界/非法值同样回落
        //（污染数据会产出非法 IANA 名使时钟崩溃）；同步激活时区
        // （main.tsx 预读一致时为幂等操作）
        if (state.timezonePref === undefined) state.timezonePref = "auto";
        if (state.timezonePref !== "auto" && !isValidTimezoneOffset(state.timezonePref)) {
          state.timezonePref = "auto";
        }
        syncActiveTimeZone(state.timezonePref);
        // 旧版数据没有 gridLayouts → 用遗留的单一 gridLayout（若有）作为
        // 浏览页初值，其余作用域回落默认；已有时也兜底补齐缺失键
        const legacyLayout = (state as { gridLayout?: GridLayout }).gridLayout;
        state.gridLayouts = {
          ...DEFAULT_GRID_LAYOUTS,
          ...(legacyLayout ? { browse: legacyLayout } : undefined),
          ...state.gridLayouts,
        };
      },
    },
  ),
);

// 跟随系统模式：监听 prefers-color-scheme 变化，仅在 themeMode === "system" 时
// 自动同步实际渲染 theme。light/dark 显式偏好不受系统切换影响。
if (typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia("(prefers-color-scheme: light)");
  mql.addEventListener("change", (e) => {
    const s = useStore.getState();
    if (s.themeMode !== "system") return;
    const next: Theme = e.matches ? "light" : "dark";
    // 系统自动切换无点击坐标，不传 origin，圆形扩散从视口中心展开
    runThemeTransition(() => {
      syncThemeCache(next);
      useStore.setState({ theme: next });
    });
  });
}

// 自动检测模式：监听浏览器语言变化，仅在 language === "system" 时重新解析。
// 显式选择的语言不受系统语言切换影响。
if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    const s = useStore.getState();
    if (s.language !== "system") return;
    void s.setLanguage("system");
  });
}

// 收到其它标签页的 persist 写入通知：300ms 防抖后重新 rehydrate，
// 把最新快照合并回内存（onRehydrateStorage 内的主题/语言/时区副作用
// 均幂等，latency 不在 persist 内不受影响）
if (persistSyncChannel) {
  let rehydrateTimer: ReturnType<typeof setTimeout> | null = null;
  persistSyncChannel.onmessage = (e: MessageEvent) => {
    if (e.data !== PERSIST_NAME) return;
    if (rehydrateTimer) clearTimeout(rehydrateTimer);
    rehydrateTimer = setTimeout(() => {
      rehydrateTimer = null;
      void useStore.persist.rehydrate();
    }, 300);
  };
}
