import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getInitialTheme, useStore } from "./store/useStore";
import { migrateFromLocalStorage } from "./lib/idb";
import { initSeo } from "./lib/seo";

// 启动流程：
// 1) index.html 内联同步脚本已从 localStorage 读取 theme 缓存并写入 <html data-theme>，
//    避免了 React 挂载前的 FOUC（首屏主题闪烁）。
// 2) 并行执行 migrateFromLocalStorage（旧 localStorage → IDB 一次性迁移）
//    与 getInitialTheme（从 IDB 读取持久化主题）。两者无顺序依赖：
//    - migrate 写 LEGACY_LS_KEY="signaltv-iptv"
//    - getInitialTheme 读相同 key
//    - 即使 migrate 未完成，getInitialTheme 也会 catch 回退到 getSystemTheme()，
//      随后 zustand persist 异步 rehydrate 会用持久化值纠正 store。
//    并行执行比原串行快约 2x（5-50ms → 5-25ms）。
// 3) 通过 setTheme action 把 theme 写回 store（action 内部会调用 syncThemeCache
//    同步 <html data-theme> + localStorage，所有 theme 变更点走统一路径）
// 4) 初始化运行时 SEO：用真实 origin 覆写 JSON-LD 占位 URL，写入首页默认 meta
// 5) 挂载 React（全局 ErrorBoundary 捕获致命渲染异常，避免整页白屏）
async function bootstrap() {
  const [, theme] = await Promise.all([
    migrateFromLocalStorage(),
    getInitialTheme(),
  ]);
  if (theme) {
    // 走 store action 统一同步路径：setTheme 内部调用 syncThemeCache，
    // 同步 dataset.theme + localStorage 缓存，避免 main.tsx 直接操作 DOM
    useStore.getState().setTheme(theme);
  }
  initSeo();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
