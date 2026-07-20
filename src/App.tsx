import { lazy, Suspense, useEffect } from "react";
import { useStore } from "./store/useStore";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Hero } from "./components/Hero";
import { FilterBar } from "./components/FilterBar";
import { ChannelGrid } from "./components/ChannelGrid";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusPanel } from "./components/StatusPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loader, ErrorState } from "./components/Loader";
import { Toaster } from "./components/Toaster";
import { toast } from "./lib/toast";

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

  // 首次访问欢迎提示：loaded 后检测 localStorage 标记，仅首次显示。
  // 用独立 key "signaltv-welcomed" 与 zustand persist 解耦，读取同步无时序问题。
  // localStorage 不可用（隐私模式）时静默失败，不阻塞渲染。
  useEffect(() => {
    if (!loaded) return;
    try {
      if (!localStorage.getItem("signaltv-welcomed")) {
        toast.success("欢迎来到 SignalTV");
        localStorage.setItem("signaltv-welcomed", "1");
      }
    } catch {
      // localStorage 不可用 → 静默失败
    }
  }, [loaded]);

  // 注：原 loaded 后自动触发 runLatencyProbe 的逻辑已移除。
  // 全量探测会挤占弱网首屏带宽（5000 频道 × 16 并发 × 5s 超时），
  // 改由 ChannelGrid 的 IntersectionObserver 调用 probeLatencyForIds
  // 按需探测可见 + 预加载范围内的频道（store 层已加弱网检测跳过）。

  // 注：原主题 useEffect 已移除。
  // syncThemeCache（store 内部函数）会在 setTheme/setThemeMode/onRehydrateStorage
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
        <ErrorState message={error} />
        <Toaster />
      </>
    );
  }

  const showHero = view.kind === "home";
  const isSettings = view.kind === "settings";
  const isStatus = view.kind === "status";
  const isPanel = isSettings || isStatus;

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
            {isPanel ? (
              isStatus ? <StatusPanel /> : <SettingsPanel />
            ) : (
              <>
                <FilterBar />
                <ChannelGrid />
              </>
            )}
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

      <Toaster />
    </>
  );
}

export default App;
