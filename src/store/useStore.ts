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
  getMeasuredSpeed,
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
// 会重复探测同一批 URL，用此集合拦截，避免浪费带宽（弱网致命）
const probeInFlight = new Set<string>();

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
    useStore.setState((s) => {
      const next = new Map(s.latency);
      for (const [k, v] of patch) next.set(k, v);
      return { latency: next };
    });
  }, LATENCY_FLUSH_MS);
}

// 弱网判定：首选首屏加载实测速度（getMeasuredSpeed），低于 500KB/s 判为 slow；
// 样本全部命中缓存（无有效样本）时依次回退：上次会话持久化的实测画像
// → Network Information API（慢 WiFi 下普遍误报 fast，仅作末位兜底）。
export type NetworkProfile = "fast" | "slow";

const SLOW_SPEED_THRESHOLD = 500_000; // 500KB/s

// 上次会话实测网络画像的 IDB key：二次访问命中 SW 缓存时无实测样本，
// 用上次实测值作初值，避免弱网用户被误判 fast 后以 16 并发挤占带宽
const NETWORK_PROFILE_KEY = "signaltv-network-profile";

// 回退路径：navigator.connection 的 saveData/2g/slow-2g 判为弱网
// （Safari/Firefox 不支持时返回 false，不阻断功能）
function connectionSaysWeak(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (
    navigator as {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const t = conn.effectiveType;
  return t === "slow-2g" || t === "2g";
}

/** 实测速度 > 上次会话持久化画像 > Network Information API，逐级回退 */
function resolveNetworkProfile(persisted: NetworkProfile | null): NetworkProfile {
  const speed = getMeasuredSpeed();
  if (speed !== null) {
    return speed < SLOW_SPEED_THRESHOLD ? "slow" : "fast";
  }
  if (persisted) return persisted;
  return connectionSaysWeak() ? "slow" : "fast";
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
  | "country"
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
  /** 网络画像：首屏实测 < 500KB/s 判为 slow，控制探测并发与 hls 缓冲策略 */
  networkProfile: NetworkProfile;

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
      networkProfile: "fast",

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
        // 上次会话实测的网络画像：本次命中 SW 缓存无实测样本时作为判定依据；
        // 提前写入 state 让加载完成前的首批探测就用对并发
        let persistedProfile: NetworkProfile | null = null;
        void idbGet(NETWORK_PROFILE_KEY)
          .then((v) => {
            if (v === "slow" || v === "fast") {
              persistedProfile = v;
              if (!get().loaded) set({ networkProfile: v });
            }
          })
          .catch(() => {});
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
          // 进度百分比分母：上次会话实测的解压后字节数（异步读取，
          // 就绪前不显示百分比；首次访问无记录时整程缺省，回退为仅 [OK]）
          const expectedBytes: { channels?: number; streams?: number } = {};
          for (const file of ["channels", "streams"] as const) {
            void idbGet(BYTES_KEY[file])
              .then((v) => {
                const n = Number(v);
                if (Number.isFinite(n) && n > 0) expectedBytes[file] = n;
              })
              .catch(() => {});
          }
          // 各文件下载百分比（基于上次实测体积；无基准时不显示）
          const filePct: { channels?: number; streams?: number } = {};
          let prevTotal = 0;
          let prevTime = 0;
          const onProgress = (file: keyof typeof fileBytes) => (bytes: number) => {
            fileBytes[file] = bytes;
            // 会话间体积漂移很小（iptv-org 日更 ±几个百分点），百分比真实
            // 平滑推进；体积增长时比值可能略超 100%，钳制 99，真正完成由 [OK] 表达
            const expected = expectedBytes[file];
            if (expected) {
              filePct[file] = Math.min(99, Math.floor((bytes / expected) * 100));
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
          const countryInfo = buildCountryInfo(countries, idx);
          const cats = categories
            .filter((c) => c.id !== "xxx")
            .sort((a, b) => a.name.localeCompare(b.name));
          // 合并行实际显示时刻与 Loader 门控一致（须等错峰入场完成），
          // 先闪 MERGE_MIN_VISIBLE_MS 光标再打 [OK]
          const mergeShownAt = Math.max(mergingAt, startAt + LOG_STAGGER_END_MS);
          const okWait = mergeShownAt + MERGE_MIN_VISIBLE_MS - Date.now();
          if (okWait > 0) await new Promise((r) => setTimeout(r, okWait));
          patch({ mergeOk: true });
          // 全流程唯一停留：合并行 [OK] 后 1s 进主页
          await new Promise((r) => setTimeout(r, 1000));
          // 加载完成后据实测速度判定网络画像（< 500KB/s → slow）；
          // 无实测样本（缓存命中）时回退上次会话持久化的实测画像
          const profile = resolveNetworkProfile(persistedProfile);
          // 仅在有实测样本时持久化，供下次会话（缓存命中无样本）作初值
          if (getMeasuredSpeed() !== null) {
            void idbSet(NETWORK_PROFILE_KEY, profile).catch(() => {});
          }
          set({
            channels: idx,
            categories: cats,
            countries: countryInfo,
            loaded: true,
            loading: false,
            loadProgress: null,
            networkProfile: profile,
          });
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
        // 播放器打开时暂停探测，避免与视频流抢带宽（弱网下尤其致命）；
        // 关闭播放器后 ChannelGrid 的 effect 会重新触发补测
        if (get().activeChannelId !== null) return;
        const channels = get().channels;
        const existing = get().latency;
        const urls = new Map<string, string>();
        for (const id of ids) {
          const c = channels.get(id);
          // 只探测有流、未探测过且不在 in-flight / 节流待刷队列中的频道
          //（探测结果先进 pendingLatency 等 200ms flush，窗口期内若不查
          // 该队列会对同一 URL 重复发起探测，弱网下白白浪费带宽）
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
        // slow 网络（首屏实测 < 500KB/s）下并发 16 → 4，保留基本可用性信息
        const concurrency = get().networkProfile === "slow" ? 4 : 16;
        // 按需探测不持有全局 controller，调用方（ChannelGrid）通过
        // useEffect cleanup 自动停止触发新批次，进行中的请求由 fetch 自身超时兑底处理
        try {
          await probeBatch(urls, concurrency, (id, ms) => {
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
        // 并发与按需探测同策略：弱网 4 / 常规 16
        const concurrency = get().networkProfile === "slow" ? 4 : 16;
        let done = 0;
        let ok = 0;
        try {
          await probeBatch(
            urls,
            concurrency,
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
      name: "signaltv-iptv",
      storage: createJSONStorage(() => idbStorage),
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
