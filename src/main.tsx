import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
// 骨架屏库基础样式（shimmer 动画/尺寸继承）；配色由 index.css 的
// --sk-base/--sk-highlight 变量接管，随主题自动切换
import "react-loading-skeleton/dist/skeleton.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  getInitialLanguage,
  getInitialTheme,
  getInitialTimezone,
  useStore,
} from "./store/useStore";
import { migrateFromLocalStorage } from "./lib/idb";
import { initSeo } from "./lib/seo";
import { activateWaitingBeforeBoot, initUpdater } from "./lib/updater";
import { syncActiveTimeZone } from "./lib/timezone";
import { applyLocaleSideEffects, loadLocale, resolveLocale } from "./i18n";

// 启动流程：
// 1) index.html 内联同步脚本已从 localStorage 读取 theme 缓存并写入 <html data-theme>，
//    避免了 React 挂载前的 FOUC（首屏主题闪烁）。
// 2) 并行执行 migrateFromLocalStorage（旧 localStorage → IDB 一次性迁移）
//    与 getInitialTheme / getInitialLanguage（从 IDB 读取持久化偏好）。三者无顺序依赖：
//    - migrate 写 LEGACY_LS_KEY="signaltv-iptv"
//    - 两个 getInitial* 读相同 key，失败时各自回退（系统主题 / 自动检测语言），
//      随后 zustand persist 异步 rehydrate 会用持久化值纠正 store。
// 3) 渲染前 await 语言包加载：首屏直接以目标语言渲染，避免文案闪烁（与主题防 FOUC 同理）
// 4) 通过 setTheme action 把 theme 写回 store（action 内部会调用 syncThemeCache
//    同步 <html data-theme> + localStorage，所有 theme 变更点走统一路径）
// 5) 初始化运行时 SEO：用真实 origin 覆写 JSON-LD 占位 URL，按当前语言写入首页默认 meta
// 6) 挂载 React（全局 ErrorBoundary 捕获致命渲染异常，避免整页白屏）

/**
 * 主动加载 Fraunces italic 字体，就绪后给 <html> 添加标记类，
 * 触发 .loader__title em / .hero__title em 从 normal 切换为 italic。
 * 消除"伪斜体→真斜体"的视觉跳变，只保留"normal→真斜体"一次切换。
 * 带 2s 超时 fallback：超时后也添加类（可能显示伪斜体，但避免永不显示斜体）。
 */
function initFrauncesItalic() {
  const html = document.documentElement;
  if (!("fonts" in document) || typeof document.fonts.load !== "function") {
    // 不支持 Font Loading API，直接显示斜体（fallback）
    html.classList.add("fonts-fraunces-italic-ready");
    return;
  }
  Promise.race([
    document.fonts.load('italic 360 52px "Fraunces"'),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ])
    .then(() => {
      html.classList.add("fonts-fraunces-italic-ready");
    })
    .catch(() => {
      // 加载失败也添加类（fallback，可能显示伪斜体）
      html.classList.add("fonts-fraunces-italic-ready");
    });
}

async function bootstrap() {
  // auto 更新且存在上个会话装好的 waiting SW → 在 React 挂载前无感激活
  // 并重载进入新版本（此时仅有主题底色，重载表现为一次正常加载）；
  // 无 waiting/非 auto 模式时立即返回，不影响首屏速度
  await activateWaitingBeforeBoot();
  // 尽早启动 Fraunces italic 字体加载监听，与后续初始化并行，不阻塞渲染
  initFrauncesItalic();
  const [, theme, languagePref, timezonePref] = await Promise.all([
    migrateFromLocalStorage(),
    getInitialTheme(),
    getInitialLanguage(),
    getInitialTimezone(),
  ]);
  // 渲染前同步激活时区：首屏时钟/日期直接以目标时区渲染，不等 persist rehydrate
  syncActiveTimeZone(timezonePref);
  useStore.setState({ timezonePref });
  // 渲染前就绪目标语言：解析偏好 → 加载语言包 → 同步 store 与 <html lang>
  const locale = resolveLocale(languagePref);
  await loadLocale(locale);
  useStore.setState({ language: languagePref, locale });
  applyLocaleSideEffects(locale);
  if (theme) {
    // 走 store action 统一同步路径：setTheme 内部调用 syncThemeCache，
    // 同步 dataset.theme + localStorage 缓存，避免 main.tsx 直接操作 DOM
    useStore.getState().setTheme(theme);
  }
  initSeo();
  // 注册 Service Worker 并启动 PWA 更新管理（auto/manual/off 由用户设置决定）
  initUpdater();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
