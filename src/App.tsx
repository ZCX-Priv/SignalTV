import { lazy, Suspense, useEffect } from "react";
import { useStore } from "./store/useStore";
import { Logo } from "./components/Logo";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Hero } from "./components/Hero";
import { FilterBar } from "./components/FilterBar";
import { ChannelGrid } from "./components/ChannelGrid";
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
        <div className="app__logo">
          <Logo />
        </div>
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

      <Suspense fallback={null}>
        <PlayerModal />
      </Suspense>
    </>
  );
}

export default App;
