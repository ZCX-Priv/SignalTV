// 主题切换过渡：基于 View Transitions API 的圆形扩散揭示。
//
// 原理与性能：浏览器对新旧主题各截一张快照，过渡发生在合成器层——
// 无论页面 DOM 多大，成本恒定为两层纹理混合。相比旧方案
// （html.theme-anim * 强制全元素 0.3s 颜色过渡）避免了三个致命问题：
// 1) background/box-shadow/color 均为 paint 属性，无法 GPU 合成，
//    桌面端大 DOM（数百频道卡片）逐帧全量重绘导致掉帧；
// 2) 渐变背景（app-bg / 卡片遮罩）不可插值，照样瞬切，快慢撕裂；
// 3) opacity !important 会劫持切换期间无关的入场/悬停动画。
//
// 视觉：新主题从 origin（点击处）以圆形 clip-path 扩散铺满全屏；
// origin 缺省取视口中心（系统主题自动切换无点击坐标的场景）。
//
// 降级：不支持 startViewTransition 的浏览器（旧 Firefox 等）或用户
// 开启"减弱动态效果"（本过渡属纯装饰动效，遵循偏好不豁免）时，
// 直接执行 applyTheme 瞬切，行为与旧浏览器一致。

/** 圆形扩散的原点（视口坐标） */
export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

/** 扩散动画时长：略长于常规 0.3s 过渡，让波纹轨迹可感知但不拖沓 */
const REVEAL_DURATION_MS = 500;

/**
 * 以圆形扩散过渡执行主题变更。
 * @param applyTheme 实际切换主题的回调（改 data-theme / store 状态），
 *                   必须在回调内完成变更，才能被捕获进"新主题"快照
 * @param origin 扩散原点，缺省为视口中心
 */
export function runThemeTransition(
  applyTheme: () => void,
  origin?: ThemeTransitionOrigin,
): void {
  if (
    typeof document === "undefined" ||
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    applyTheme();
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  // 终态半径 = 原点到视口最远角的距离，保证圆形恰好铺满整个视口
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(applyTheme);
  transition.ready
    .then(() => {
      // 对"新主题"快照伪元素做 clip-path 圆形揭示；旧快照静止垫底
      //（默认交叉淡化已在 index.css 中关闭，动画由此处全权驱动）
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: REVEAL_DURATION_MS,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    // 连续快速切换时上一轮过渡被 skip，ready 会 reject，属正常流程
    .catch(() => {});
}
