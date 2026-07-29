import { useEffect, useRef, useState } from "react";
import type { GridLayout } from "../store/useStore";

// 两阶段时长须与 App.css 的 layout-zoom-out / layout-zoom-in 动画时长同步
const ZOOM_OUT_MS = 160;
const ZOOM_IN_MS = 200;

/**
 * 卡片/列表切换的缩放过渡：布局偏好变化时先播缩小淡出（is-zoom-out），
 * 计时结束后才切换实际渲染布局并播放大淡入（is-zoom-in）。
 * 首挂不播；ZOOM_IN 结束后清空动画类，避免残留 transform 影响后代
 * fixed 定位或 will-change 层。返回的 shownLayout 供渲染类名使用
 * （延迟于 store 值一个 out 阶段）。
 */
export function useLayoutSwitchAnim(layout: GridLayout): {
  shownLayout: GridLayout;
  animClass: string;
} {
  const [shownLayout, setShownLayout] = useState(layout);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  // 首挂跳过：初次渲染布局即为目标值，无需过渡
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (layout === shownLayout) return;
    // 尊重减弱动效：直接瞬时切换（全局 CSS 也会把动画压到近零，双保险）
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShownLayout(layout);
      return;
    }
    setPhase("out");
    const outTimer = window.setTimeout(() => {
      setShownLayout(layout);
      setPhase("in");
    }, ZOOM_OUT_MS);
    return () => clearTimeout(outTimer);
    // 仅在目标布局变化时启动过渡；shownLayout 在 out 结束后追平
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // in 阶段播完后回到 idle，清掉动画类
  useEffect(() => {
    if (phase !== "in") return;
    const inTimer = window.setTimeout(() => setPhase("idle"), ZOOM_IN_MS);
    return () => clearTimeout(inTimer);
  }, [phase]);

  const animClass =
    phase === "out" ? "is-zoom-out" : phase === "in" ? "is-zoom-in" : "";
  return { shownLayout, animClass };
}
