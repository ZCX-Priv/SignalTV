import { create } from "zustand";
import { persist } from "zustand/middleware";
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

// 批量节流更新 latency：200ms 窗口内合并多次 setLatency 为一次 set，
// 避免 5000 频道 × new Map(s.latency) 的 O(n²) 开销。
let pendingLatency = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const LATENCY_FLUSH_MS = 200;

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

export type Theme = "dark" | "light";

// 首次访问跟随系统 prefers-color-scheme；用户手动切换后持久化覆盖
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = localStorage.getItem("signaltv-iptv");
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: Theme } };
      if (parsed.state?.theme === "dark" || parsed.state?.theme === "light") {
        return parsed.state.theme;
      }
    }
  } catch {
    // 解析失败则回落到系统偏好
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
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
  | { kind: "search"; q: string };

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
  sidebarCollapsed: boolean; // 桌面端侧边栏收起
  mobileSidebarOpen: boolean; // 移动端抽屉式侧边栏开关
  theme: Theme; // 深色 / 白昼模式

  // 动作
  init: () => Promise<void>;
  setView: (v: View) => void;
  setFilter: (patch: Partial<Filter>) => void;
  openChannel: (id: string | null) => void;
  toggleFavorite: (id: string) => void;
  pushRecent: (id: string) => void;
  setLatency: (id: string, ms: number) => void;
  runLatencyProbe: () => Promise<void>;
  probeLatencyForIds: (ids: string[]) => Promise<void>;
  toggleSidebar: () => void;
  setMobileSidebar: (open: boolean) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
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
      latency: new Map(),
      latencyLoading: false,
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      theme: getInitialTheme(),

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

      setView: (v) => set({ view: v, filter: { ...get().filter, q: "", categoryId: null, countryCode: null } }),
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
      setLatency: (id, ms) => {
        // 单条接口转发到批量节流，避免高频调用导致 O(n²) Map 重建
        batchSetLatency(id, ms);
      },
      runLatencyProbe: async () => {
        if (get().latencyLoading) return;
        const channels = get().channels;
        const existing = get().latency;
        const urls = new Map<string, string>();
        for (const [id, c] of channels) {
          // 跳过已探测的频道，避免与 probeLatencyForIds 重复
          if (c.streamUrl && !existing.has(id)) urls.set(id, c.streamUrl);
        }
        if (urls.size === 0) return;
        set({ latencyLoading: true });
        await probeBatch(urls, 16, (id, ms) => {
          batchSetLatency(id, ms);
        });
        set({ latencyLoading: false });
      },
      probeLatencyForIds: async (ids) => {
        const channels = get().channels;
        const existing = get().latency;
        const urls = new Map<string, string>();
        for (const id of ids) {
          const c = channels.get(id);
          // 只探测有流且未探测过的频道
          if (c?.streamUrl && !existing.has(id)) urls.set(id, c.streamUrl);
        }
        if (urls.size === 0) return;
        await probeBatch(urls, 16, (id, ms) => {
          batchSetLatency(id, ms);
        });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "signaltv-iptv",
      partialize: (s) => ({
        favorites: s.favorites,
        recents: s.recents,
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
      }),
    },
  ),
);
