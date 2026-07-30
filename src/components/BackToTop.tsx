import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useStore } from "../store/useStore";
import type { View } from "../store/useStore";
import { useI18n } from "../i18n";

// 内容页白名单：只有这些视图会深滚出长列表，状态/设置面板页不显示按钮。
// 用白名单而非排除法，未来新增面板类视图时不会被误漏排除
const CONTENT_VIEWS = new Set<View["kind"]>([
  "home",
  "category",
  "country",
  "favorites",
  "history",
]);

/**
 * 返回顶部悬浮按钮：内容页离开顶部即浮现、归顶即隐藏，点击平滑归顶。
 *
 * 实现要点（对齐 ChannelGrid 的滚动性能范式）：
 * - 滚动容器是 .app__main（body overflow:hidden，window 不滚动），
 *   scroll 事件不冒泡，监听必须挂在容器上且 passive + rAF 节流；
 * - 热路径每帧只读 scrollTop（纯滚动不脏布局，无 reflow），
 *   阈值就是 0（scrollTop > 0 即显示），无需迟滞也无需监听 resize；
 * - visible 仅在翻转时才真正重渲染（React 对同值 setState 自动 bail out）；
 * - 视图切换时 effect 重跑并立即重算一次：覆盖「A 页深滚 → 切到 B 页」
 *   的滚动位置残留边界（ChannelGrid 归顶只发生在频道视图，历史页无此逻辑）。
 */
export function BackToTop() {
  const { t } = useI18n();
  const view = useStore((s) => s.view);
  const isContent = CONTENT_VIEWS.has(view.kind);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isContent) {
      // 离开内容页立即隐藏，防止回到内容页首帧短暂残留旧的可见态
      setVisible(false);
      return;
    }
    const scroller = document.querySelector(".app__main");
    if (!(scroller instanceof HTMLElement)) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      // 离开顶部即显示、归顶即隐藏；同值时 React 自动 bail out
      setVisible(scroller.scrollTop > 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // 视图切换后立即重算：滚动位置残留时按钮即刻呈现正确状态
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // 依赖 view 而非仅 isContent：同为内容页间切换（如分类 A → 分类 B）
    // 也要重跑立即重算，不能依赖 ChannelGrid 归顶触发的 scroll 事件时序
  }, [isContent, view]);

  if (!isContent) return null;

  const onClick = () => {
    const scroller = document.querySelector(".app__main");
    if (!(scroller instanceof HTMLElement)) return;
    // 尊重 reduced-motion：减弱动态效果时瞬时跳转而非平滑滚动
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    // 常挂 + is-visible 切换保证退场过渡；隐藏时移出无障碍树与 Tab 焦点链
    <button
      type="button"
      className={`back-top ${visible ? "is-visible" : ""}`}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      aria-label={t("common.backToTop")}
      title={t("common.backToTop")}
      onClick={onClick}
    >
      <ArrowUp size={16} />
      {/* 文字标签仅桌面端可见，移动端由 CSS 隐藏收为纯图标圆按钮 */}
      <span className="back-top__label">{t("common.backToTop")}</span>
    </button>
  );
}
