import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App.tsx";
import { getInitialTheme, useStore } from "./store/useStore";
import { migrateFromLocalStorage } from "./lib/idb";
import { initSeo } from "./lib/seo";

// 启动前串行执行：
// 1) 迁移旧 localStorage 数据到 IndexedDB（一次性，老用户无感知升级）
// 2) 异步读取持久化主题
// 3) 同步 <html data-theme>，并把主题写回 store，避免 App.tsx 的 useEffect 用初始 systemTheme 覆盖
// 4) 初始化运行时 SEO：用真实 origin 覆写 JSON-LD 中的占位 URL，并写入首页默认 meta
// 5) 挂载 React
// IndexedDB 单 key 读取通常 <5ms，对用户无感知
async function bootstrap() {
  await migrateFromLocalStorage();
  const theme = await getInitialTheme();
  document.documentElement.dataset.theme = theme;
  useStore.setState({ theme });
  initSeo();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
