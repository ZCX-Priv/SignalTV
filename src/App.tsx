import { lazy, Suspense, useEffect } from "react";
import { useStore } from "./store/useStore";
import { useFilteredChannels } from "./hooks/useChannels";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Hero } from "./components/Hero";
import { FilterBar } from "./components/FilterBar";
import { ChannelGrid } from "./components/ChannelGrid";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusPanel } from "./components/StatusPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loader, ErrorState } from "./components/Loader";
import { Toaster } from "./components/Toaster";
import { toast } from "./lib/toast";
import { idbGet, idbSet } from "./lib/idb";
import { hasOpenModal } from "./lib/modalStack";
import { t, useI18n } from "./i18n";

// 懒加载播放器 + hls.js（约 250KB）——仅在打开频道时才需要
const PlayerModal = lazy(() =>
  import("./components/PlayerModal").then((m) => ({ default: m.PlayerModal })),
);

// 频道内容区：在此处统一计算一次过滤结果，作为 prop 下发给
// FilterBar 与 ChannelGrid，避免两处各自调用 useFilteredChannels
// 对 5000+ 频道重复过滤+排序。
function ChannelsView() {
  const list = useFilteredChannels();
  return (
    <>
      <FilterBar list={list} />
      <ChannelGrid list={list} />
    </>
  );
}

function App() {
  const { t: tr } = useI18n();
  const init = useStore((s) => s.init);
  const loading = useStore((s) => s.loading);
  const loaded = useStore((s) => s.loaded);
  const error = useStore((s) => s.error);
  const view = useStore((s) => s.view);

  useEffect(() => {
    void init();
  }, [init]);

  // 首次访问欢迎提示：loaded 后异步检查 IndexedDB 标记，仅首次显示。
  // 统一走 IndexedDB（localStorage 仅保留给必须同步读取的主题防 FOUC 缓存）。
  // 兼容老用户：IDB 无值时检查 localStorage 旧标记，存在则静默迁移不重复弹欢迎。
  // IDB 不可用时静默失败，不阻塞渲染。
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const seen = await idbGet("signaltv-welcomed");
        if (seen) return;
        // 老用户旧标记迁移（localStorage → IDB）
        let legacy: string | null = null;
        try {
          legacy = localStorage.getItem("signaltv-welcomed");
        } catch {
          // localStorage 不可用 → 当作无旧标记
        }
        if (legacy) {
          await idbSet("signaltv-welcomed", "1");
          try {
            localStorage.removeItem("signaltv-welcomed");
          } catch {
            // 忽略清理失败
          }
          return;
        }
        if (cancelled) return;
        toast.success(t("toast.welcome"));
        await idbSet("signaltv-welcomed", "1");
      } catch {
        // IndexedDB 不可用 → 静默失败
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  // 注：原 loaded 后自动触发 runLatencyProbe 的逻辑已移除。
  // 全量探测会挤占弱网首屏带宽（5000 频道 × 16 并发 × 5s 超时），
  // 改由 ChannelGrid 在渲染窗口变化后 debounce 150ms 调用 probeLatencyForIds，
  // 按需探测窗口内（可见 + overscan 预挂）频道（store 层已加弱网检测跳过）。

  // 注：原主题 useEffect 已移除。
  // syncThemeCache（store 内部函数）会在 setTheme/setThemeMode/onRehydrateStorage
  // 三个变更点统一同步 <html data-theme>，无需 App.tsx 重复订阅。

  // 全局 ⌘K / Ctrl+K 聚焦搜索框；移动端搜索框收起（display:none）时
  // 先通过 store 展开再聚焦，避免快捷键静默失灵
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // 模态打开时跳过：聚焦被遮罩挡住的搜索框会使焦点逃出 trapFocus 圈定
        if (hasOpenModal()) return;
        useStore.getState().setSearchOpen(true);
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>(".search__input");
          input?.focus();
          input?.select();
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading && !loaded) {
    return (
      <>
        <div className="app-bg" />
        <div className="grain" />
        <div className="scanlines" />
        <Loader />
        <Toaster />
      </>
    );
  }

  if (error && !loaded) {
    return (
      <>
        <div className="app-bg" />
        <div className="grain" />
        <div className="scanlines" />
        <ErrorState message={tr(error.key, error.params)} />
        <Toaster />
      </>
    );
  }

  const showHero = view.kind === "home";
  const isSettings = view.kind === "settings";
  const isStatus = view.kind === "status";
  const isHistory = view.kind === "history";
  const isPanel = isSettings || isStatus || isHistory;

  // 视图入场动画 key：切换视图/分类/国家时重挂载 .view-anim 重放 fade-up，
  // 同视图内筛选/搜索变化不重放（key 不含 filter），
  // 保证所有页面（含标题区/空态）入场节奏一致
  const viewKey =
    view.kind === "category"
      ? `category:${view.id}`
      : view.kind === "country"
        ? `country:${view.code}`
        : view.kind;

  return (
    <>
      <div className="app-bg" />
      <div className="grain" />
      <div className="scanlines" />

      <div className="app">
        <div className="app__header">
          <Header />
        </div>
        <div className="app__sidebar">
          <Sidebar />
        </div>

        <main className="app__main">
          {showHero && <Hero />}
          <div className="content">
            <div className="view-anim" key={viewKey}>
              {isPanel ? (
                isStatus ? (
                  <StatusPanel />
                ) : isHistory ? (
                  <HistoryPanel />
                ) : (
                  <SettingsPanel />
                )
              ) : (
                <ChannelsView />
              )}
            </div>
          </div>
        </main>
      </div>

      <ErrorBoundary
        fallback={(reset) => (
          // 可恢复降级：全屏遮罩必须提供退路（关闭播放 + 重置边界），
          // 否则 hls chunk 加载失败时遮罩永久覆盖应用且无法操作
          <div className="loader">
            <div className="loader__inner">
              <div className="loader__sub mono">{tr("player.loadFailed")}</div>
              <button
                className="btn btn--primary"
                style={{ marginTop: 18 }}
                onClick={() => {
                  useStore.getState().openChannel(null);
                  reset();
                }}
              >
                {tr("common.close")}
              </button>
            </div>
          </div>
        )}
      >
        <Suspense fallback={null}>
          <PlayerModal />
        </Suspense>
      </ErrorBoundary>

      <Toaster />
    </>
  );
}

export default App;
