import { lazy, Suspense, useEffect } from "react";
import { useStore } from "./store/useStore";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Hero } from "./components/Hero";
import { FilterBar } from "./components/FilterBar";
import { ChannelGrid } from "./components/ChannelGrid";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loader, ErrorState } from "./components/Loader";

// 懒加载播放器 + hls.js（约 250KB）——仅在打开频道时才需要
const PlayerModal = lazy(() =>
  import("./components/PlayerModal").then((m) => ({ default: m.PlayerModal })),
);

function App() {
  const init = useStore((s) => s.init);
  const loading = useStore((s) => s.loading);
  const loaded = useStore((s) => s.loaded);
  const error = useStore((s) => s.error);
  const view = useStore((s) => s.view);

  useEffect(() => {
    void init();
  }, [init]);

  // 注：原 loaded 后自动触发 runLatencyProbe 的逻辑已移除。
  // 全量探测会挤占弱网首屏带宽（5000 频道 × 16 并发 × 5s 超时），
  // 改由 ChannelGrid 的 IntersectionObserver 调用 probeLatencyForIds
  // 按需探测可见 + 预加载范围内的频道（store 层已加弱网检测跳过）。

  // 注：原主题 useEffect 已移除。
  // syncThemeCache（store 内部函数）会在 setTheme/toggleTheme/onRehydrateStorage
  // 三个变更点统一同步 <html data-theme>，无需 App.tsx 重复订阅。

  // 全局 ⌘K / Ctrl+K 聚焦搜索框
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".search__input");
        input?.focus();
        input?.select();
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
      </>
    );
  }

  if (error && !loaded) {
    return (
      <>
        <div className="app-bg" />
        <div className="grain" />
        <div className="scanlines" />
        <ErrorState message={error} />
      </>
    );
  }

  const showHero = view.kind === "home";

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
            <FilterBar />
            <ChannelGrid />
          </div>
        </main>
      </div>

      <ErrorBoundary
        fallback={
          <div className="loader">
            <div className="loader__inner">
              <div className="loader__sub mono">播放器加载失败，请关闭后重试。</div>
            </div>
          </div>
        }
      >
        <Suspense fallback={null}>
          <PlayerModal />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

export default App;
