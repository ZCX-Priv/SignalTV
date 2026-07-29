import { useState } from "react";
import type { ComponentProps, ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import Skeleton from "react-loading-skeleton";
import { useStore } from "../store/useStore";

// 统一骨架配色：专用 CSS 变量（index.css :root / [data-theme="light"]）
// 随主题自动切换，无需 JS 订阅 theme；shimmer 动画在减弱动效偏好下
// 由 index.css 全局 0.01ms 规则压为近零（装饰动画，不属豁免范围）
const SK_COLORS = {
  baseColor: "var(--sk-base)",
  highlightColor: "var(--sk-highlight)",
} as const;

/** 主题化骨架条：react-loading-skeleton 原语 + 项目配色，尺寸随字体/参数自适应 */
export function Sk(props: ComponentProps<typeof Skeleton>) {
  return <Skeleton {...SK_COLORS} {...props} />;
}

/** 铺满最近定位祖先的骨架层（父容器需 position:relative + overflow:hidden） */
export function SkFill() {
  return <Sk containerClassName="sk-fill" className="sk-fill__inner" borderRadius={0} />;
}

interface SkeletonImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** 加载失败回调：内部随即停止渲染 img 与骨架，调用方据此切换降级占位 */
  onFailed?: () => void;
}

/**
 * 带骨架的图片：加载完成前在定位父容器内铺满 shimmer 骨架，
 * onLoad 后骨架卸载、图片淡入（.sk-img 0.2s opacity 过渡）；
 * 失败时整体移除（不渲染 img），由调用方的降级路径接管。
 * 缓存命中防闪烁：ref 挂载时同步检查 complete/naturalWidth，
 * 虚拟化窗口滑动重挂载已缓存图片时直接置为已加载，骨架不闪一帧。
 */
export function SkeletonImg({ onFailed, className, ...rest }: SkeletonImgProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <>
      {!loaded && <SkFill />}
      <img
        {...rest}
        className={`${className ?? ""} sk-img${loaded ? " is-loaded" : ""}`}
        ref={(img) => {
          // 缓存命中：load 事件可能早于 React 挂载 onLoad 监听已触发
          if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          onFailed?.();
        }}
      />
    </>
  );
}

/**
 * 播放器弹窗骨架：作为懒加载 PlayerModal 的 Suspense fallback。
 * 仅在用户已点开频道（activeChannelId 非空）而 chunk 尚未就绪时可见——
 * 应用启动时 lazy 首次 suspend 也会渲染 fallback，此时必须返回 null。
 * 复用真实弹窗的全部壳类（.player/.player__panel/.player__stage/.player__info
 * 等），桌面双栏与 ≤1080px 单列布局由同一套 CSS 媒体查询天然对齐，
 * chunk 就绪后真实弹窗原位替换，零跳动。
 * portal 到 document.body：全屏 fixed 模态的项目强制规范。
 */
export function PlayerModalSkeleton() {
  const active = useStore((s) => s.activeChannelId);
  if (!active) return null;
  return createPortal(
    <div className="player" aria-hidden="true">
      <div className="player__backdrop" />
      <div className="player__panel">
        {/* 头部状态条：频道号/连接状态/时间三段短条 + 右侧两个方形按钮位
            （min-height 对齐真实头部实测 59px，避免替换瞬间面板内区高度跳动） */}
        <header className="player__head sk-player-head">
          <div className="player__head-left">
            <Sk width={56} height={14} />
            <Sk width={78} height={14} />
            <Sk width={96} height={14} />
          </div>
          <div className="player__head-actions">
            <Sk width={34} height={34} borderRadius={8} />
            <Sk width={34} height={34} borderRadius={8} />
          </div>
        </header>

        <div className="player__stage">
          {/* 视频区：复用 .player__video 的黑底/圆角/自适应尺寸，铺满 shimmer */}
          <div className="player__video">
            <SkFill />
          </div>

          <aside className="player__info">
            <div className="player__channel-head">
              <div className="player__logo">
                <SkFill />
              </div>
              <div className="player__channel-titles">
                {/* 真实类名继承字号/行高，骨架条高度自动匹配文本尺寸 */}
                <div className="eyebrow">
                  <Sk width={150} height={11} />
                </div>
                <h2 className="player__name display">
                  <Sk width="62%" />
                </h2>
              </div>
            </div>

            <div className="player__actions">
              <Sk width={92} height={35} borderRadius={9} />
              <Sk width={92} height={35} borderRadius={9} />
            </div>

            <dl className="player__facts mono">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <dt>
                    <Sk width={52} />
                  </dt>
                  <dd>
                    <Sk width={70} />
                  </dd>
                </div>
              ))}
            </dl>

            <div className="player__related">
              <div className="eyebrow">
                <Sk width={92} height={11} />
              </div>
              <div className="player__related-list">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div className="related" key={i}>
                    <span className="related__logo">
                      <SkFill />
                    </span>
                    <Sk containerClassName="sk-grow" height={13} />
                    <Sk width={38} height={11} />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
