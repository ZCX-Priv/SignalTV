import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App.tsx";
import { getInitialTheme } from "./store/useStore";

// 渲染前同步设置主题，避免首帧深色闪烁
document.documentElement.dataset.theme = getInitialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
