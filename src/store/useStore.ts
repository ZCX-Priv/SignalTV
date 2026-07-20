import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Category,
  ChannelWithStream,
  CountryInfo,
} from "../types";
import {
  api,
  buildChannelIndex,
  buildCountryInfo,
} from "../lib/api";
import { probeBatch } from "../lib/latency";
import { idbGet, idbStorage } from "../lib/idb";
import { applySeo, describeView } from "../lib/seo";

// 批量节流更新 latency：200ms 窗口内合并多次 setLatency 为一次 set，
// 避免 5000 频道 × new Map(s.latency) 的 O(n²) 开销。
let pendingLatency = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const LATENCY_FLUSH_MS = 200;

// runLatencyProbe 持有的 AbortController，用于组件卸载或视图切换时取消探测
let latencyAbortController: AbortController | null = null;

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

// 弱网检测：navigator.connection.effectiveType 为 2g/slow-2g 或 saveData 时返回 true
// Safari/Firefox 不支持 Network Information API 时返回 false（不阻断功能）
function isWeakNetwork(): boolean {
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

export type Theme = "dark" | "light";

// 用户主题偏好：system 表示跟随系统 prefers-color-scheme；
// light/dark 为用户显式选择，会覆盖系统偏好并持久化。
// theme 字段保留为实际渲染值（dark|light），由 themeMode 派生。
export type ThemeMode = "system" | "light" | "dark";

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
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("signaltv-theme-cache", theme);
  } catch {
    // localStorage 不可用（隐私模式/配额满）→ 忽略，IDB persist 仍是 source of truth
  }
}

// 首次访问跟随系统 prefers-color-scheme；用户手动切换后持久化覆盖
// 异步：从 IndexedDB 读取持久化的主题（main.tsx 在渲染前 await 此函数，
// 拿到结果后会通过 useStore.setState 同步给 store）
export async function getInitialTheme(): Promise<Theme> {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = await idbGet("signaltv-iptv");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: { theme?: Theme; themeMode?: ThemeMode };
      };
      // 优先按 themeMode 推导实际渲染值（兼容旧版只有 theme 字段的持久化）
      const mode = parsed.state?.themeMode;
      if (mode === "system") return getSystemTheme();
      if (mode === "light" || mode === "dark") return mode;
      if (parsed.state?.theme === "dark" || parsed.state?.theme === "light") {
        return parsed.state.theme;
      }
    }
  } catch {
    // 解析失败则回落到系统偏好
  }
  return getSystemTheme();
}

// 主题切换瞬间禁用所有过渡/动画：在 <html> 上加 .theme-transitioning 类，
// CSS 规则把该类下所有元素的 transition-duration / animation-duration 强制为 0s，
// 等效于"瞬时切换"，避免带 transition 的元素缓慢过渡到新主题色形成扎眼时差。
// 双 RAF 后移除：第一帧 React 提交新 theme 到 DOM（data-theme 变化），
// 第二帧浏览器完成重绘，此时再恢复过渡行为已无可见延迟。
// 兜底：100ms 后强制清理，防止 set 抛错或 RAF 被打断导致类永久残留
// （CSS html.theme-transitioning * 会禁用所有动画，永久残留会让应用视觉崩坏）
function disableTransitionsBriefly(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-transitioning");
  // 强制回流，确保 .theme-transitioning 类先生效再切换 data-theme
  void root.offsetHeight;
  const fallback = setTimeout(
    () => root.classList.remove("theme-transitioning"),
    100,
  );
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      root.classList.remove("theme-transitioning");
    });
  });
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

export type View =
  | { kind: "home" }
  | { kind: "category"; id: string }
  | { kind: "country"; code: string }
  | { kind: "favorites" }
  | { kind: "search"; q: string }
  | { kind: "status" }
  | { kind: "settings" };

interface State {
  // 数据
  channels: Map<string, ChannelWithStream>;
  categories: Category[];
  countries: CountryInfo[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  // 延迟探测
  latency: Map<string, number>; // 频道id → 延迟ms，-1 表示失败
  latencyLoading: boolean;

  // 界面状态
  view: View;
  filter: Filter;
  activeChannelId: string | null; // 播放器目标
  favorites: string[];
  recents: string[]; // 最近观看，最新在前
  recentCategories: string[]; // 最近使用的分类，最新在前
  recentCountries: string[]; // 最近使用的国家 code，最新在前
  sidebarCollapsed: boolean; // 桌面端侧边栏收起
  mobileSidebarOpen: boolean; // 移动端抽屉式侧边栏开关
  theme: Theme; // 实际渲染主题（dark|light），由 themeMode 派生
  themeMode: ThemeMode; // 用户主题偏好（system|light|dark），持久化

  // 动作
  init: () => Promise<void>;
  setView: (v: View) => void;
  setFilter: (patch: Partial<Filter>) => void;
  openChannel: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
  pushRecent: (id: string) => void;
  pushRecentCategory: (id: string) => void;
  pushRecentCountry: (code: string) => void;
  runLatencyProbe: () => Promise<void>;
  probeLatencyForIds: (ids: string[]) => Promise<void>;
  toggleSidebar: () => void;
  setMobileSidebar: (open: boolean) => void;
  setTheme: (t: Theme) => void;
  setThemeMode: (m: ThemeMode) => void;
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

      view: { kind: "home" },
      filter: { q: "", categoryId: null, countryCode: null, sort: "default", nsfw: false },
      activeChannelId: null,
      favorites: [],
      recents: [],
      recentCategories: [],
      recentCountries: [],
      latency: new Map(),
      latencyLoading: false,
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      theme: getSystemTheme(),
      themeMode: "system",

      init: async () => {
        if (get().loaded || get().loading) return;
        set({ loading: true, error: null });
        try {
          const [channels, streams, categories, countries] = await Promise.all([
            api.channels(),
            api.streams(),
            api.categories(),
            api.countries(),
          ]);
          const idx = buildChannelIndex(channels, streams);
          const countryInfo = buildCountryInfo(countries, idx);
          const cats = categories
            .filter((c) => c.id !== "xxx")
            .sort((a, b) => a.name.localeCompare(b.name));
          set({
            channels: idx,
            categories: cats,
            countries: countryInfo,
            loaded: true,
            loading: false,
          });
        } catch (e) {
          set({
            loading: false,
            error: e instanceof Error ? e.message : "加载广播数据失败。",
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
        if (id) get().pushRecent(id);
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
      pushRecentCategory: (id) =>
        set((s) => ({
          recentCategories: [id, ...s.recentCategories.filter((r) => r !== id)].slice(0, 24),
        })),
      pushRecentCountry: (code) =>
        set((s) => ({
          recentCountries: [code, ...s.recentCountries.filter((r) => r !== code)].slice(0, 24),
        })),
      runLatencyProbe: async () => {
        if (get().latencyLoading) return;
        // 弱网（2g/slow-2g/saveData）下跳过全量探测，避免挤占首屏带宽
        if (isWeakNetwork()) return;
        const channels = get().channels;
        const existing = get().latency;
        const urls = new Map<string, string>();
        for (const [id, c] of channels) {
          // 跳过已探测的频道，避免与 probeLatencyForIds 重复
          if (c.streamUrl && !existing.has(id)) urls.set(id, c.streamUrl);
        }
        if (urls.size === 0) return;
        set({ latencyLoading: true });
        // 持有 AbortController 引用，供取消使用（如组件卸载）
        const controller = new AbortController();
        latencyAbortController = controller;
        try {
          await probeBatch(
            urls,
            16,
            (id, ms) => batchSetLatency(id, ms),
            controller.signal,
          );
        } finally {
          if (latencyAbortController === controller) {
            latencyAbortController = null;
          }
          set({ latencyLoading: false });
        }
      },
      probeLatencyForIds: async (ids) => {
        // 弱网下跳过按需探测，latency 标签会显示"未探测"
        if (isWeakNetwork()) return;
        const channels = get().channels;
        const existing = get().latency;
        const urls = new Map<string, string>();
        for (const id of ids) {
          const c = channels.get(id);
          // 只探测有流且未探测过的频道
          if (c?.streamUrl && !existing.has(id)) urls.set(id, c.streamUrl);
        }
        if (urls.size === 0) return;
        // 按需探测不持有全局 controller，调用方（ChannelGrid）通过
        // useEffect cleanup 自动停止触发新批次，进行中的请求由 fetch 自身超时兜底
        await probeBatch(urls, 16, (id, ms) => {
          batchSetLatency(id, ms);
        });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
      setTheme: (t) => {
        syncThemeCache(t);
        set({ theme: t });
      },
      setThemeMode: (m) => {
        // themeMode === "system" 时根据当前 prefers-color-scheme 推导实际渲染值，
        // 否则直接使用 light/dark 作为渲染值
        const actualTheme: Theme = m === "system" ? getSystemTheme() : m;
        disableTransitionsBriefly();
        syncThemeCache(actualTheme);
        set({ themeMode: m, theme: actualTheme });
      },
    }),
    {
      name: "signaltv-iptv",
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        favorites: s.favorites,
        recents: s.recents,
        recentCategories: s.recentCategories,
        recentCountries: s.recentCountries,
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        themeMode: s.themeMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
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
    disableTransitionsBriefly();
    syncThemeCache(next);
    useStore.setState({ theme: next });
  });
}
