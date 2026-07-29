import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Play,
  Star,
  Globe2,
  Tv2,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useChannel } from "../hooks/useChannels";
import { broadcastDate, channelPosition, flagUrl, prettyCategory } from "../lib/format";
import { toast } from "../lib/toast";
import { pushModal, trapFocus } from "../lib/modalStack";
import { useI18n } from "../i18n";
import { LatencyTag } from "./LatencyTag";
import { TvPlayer } from "./TvPlayer";

export function PlayerModal() {
  const { t } = useI18n();
  const activeId = useStore((s) => s.activeChannelId);
  const openChannel = useStore((s) => s.openChannel);
  // 退出动画：关闭时 activeId 先变 null，displayId 保留频道继续渲染并加 is-closing 类，
  // fade-out/scale-out 播完（onAnimationEnd）后才真正卸载
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const channel = useChannel(displayId);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const channels = useStore((s) => s.channels);

  // 流故障转移：当前播放的流索引，失败时递增；切频道时重置。
  // retryToken 用于"重试"时强制 remount TvPlayer（即使 streamIdx 已是 0）。
  const [streamIdx, setStreamIdx] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  // streamIdx 的同步镜像：handleStreamError 需同步判断能否切流，
  // 不能依赖 setState updater 的同步副作用（React 急切求值非契约行为）
  const streamIdxRef = useRef(0);
  const streamUrls = useMemo(() => channel?.streamUrls ?? [], [channel]);
  const url = streamUrls[streamIdx] ?? null;

  useEffect(() => {
    streamIdxRef.current = 0;
    setStreamIdx(0);
    setRetryToken(0);
  }, [activeId]);

  // activeId → displayId/closing 同步：打开/切频道直接替换；关闭时进入退出动画阶段
  useEffect(() => {
    if (activeId) {
      setDisplayId(activeId);
      setClosing(false);
    } else if (displayId) {
      setClosing(true);
    }
  }, [activeId, displayId]);

  // 关闭动画兜底：animationend 丢失（如标签页后台）时 400ms 后强制卸载
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(() => {
      setDisplayId(null);
      setClosing(false);
    }, 400);
    return () => clearTimeout(id);
  }, [closing]);

  // TvPlayer 播放失败 → 切到下一路流；返回是否还有备用流可切
  const handleStreamError = useCallback(() => {
    const next = streamIdxRef.current + 1;
    if (next >= streamUrls.length) return false;
    streamIdxRef.current = next;
    setStreamIdx(next);
    // 同 key 去重：多路流连续失败时只显示一条切换提示（刷新时长而非叠加）
    toast.info(t("toast.streamFailover"), { key: "stream-failover" });
    return true;
  }, [streamUrls.length, t]);

  // 错误面板/头部刷新按钮：从第一路流重新开始，retryToken 变化强制 remount；
  // 同 key 去重：连续点击只刷新同一条 toast 的时长，不叠加新条目
  const handleRetry = useCallback(() => {
    streamIdxRef.current = 0;
    setStreamIdx(0);
    setRetryToken((n) => n + 1);
    toast.success(t("toast.streamRefreshed"), { key: "stream-refreshed" });
  }, [t]);

  const [latency, setLatency] = useState<number | null>(null);
  const [playerState, setPlayerState] = useState<"idle" | "loading" | "ready" | "paused" | "error">("idle");
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const titlesRef = useRef<HTMLDivElement>(null);

  // 模态栈接入：ESC 只关栈顶 + body 滚动锁引用计数 + 焦点圈定
  useEffect(() => {
    if (!activeId) return;
    const release = pushModal(() => openChannel(null));
    const prevFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      release();
      prevFocus?.focus?.();
    };
  }, [activeId, openChannel]);

  // 自适应正方形 logo：测量标题区高度，通过 CSS 变量驱动 logo 尺寸
  // 纯 CSS 的 aspect-ratio + align-self:stretch 在 flex 中失效（stretch 非 definite size），
  // 改用 ResizeObserver 测量 titles 实际高度，写入 --logo-size 变量
  // 仅桌面端生效：移动端（≤1080px）由 App.css 媒体查询覆盖为固定 56px 正方形
  // 依赖 displayId 而非 activeId：activeId 变化的那次渲染 displayId 仍为 null
  //（组件返回 null、refs 为空），若依赖 activeId 则 observer 首次打开永不挂上
  useEffect(() => {
    const head = headRef.current;
    const titles = titlesRef.current;
    if (!head || !titles) return;
    const update = () => {
      head.style.setProperty("--logo-size", `${titles.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(titles);
    return () => ro.disconnect();
  }, [displayId]);

  // 推荐的关联频道（同主分类、不同 id）
  // 必须在 early return 之前调用，遵守 React Hooks 规则
  const channelId = channel?.id;
  const primaryCat = channel?.categories[0];
  const suggestions = useMemo(() => {
    if (!channelId || !primaryCat) return [];
    return Array.from(channels.values())
      .filter((c) => c.id !== channelId && c.categories.includes(primaryCat) && !c.is_nsfw)
      .slice(0, 6);
  }, [channels, channelId, primaryCat]);

  if (!displayId || !channel) return null;

  const isFav = favorites.includes(channel.id);
  // 官网链接协议白名单：第三方数据集可能被污染，javascript: 等伪协议
  // 不得进入 href（点击即执行脚本），非 http/https 直接不渲染按钮
  const websiteUrl =
    channel.website && /^https?:\/\//i.test(channel.website)
      ? channel.website
      : null;

  // portal 到 body：与 ConfirmModal 同规范——全屏 fixed 模态不能假设祖先链
  // 无 transform/filter（否则成为包含块，遮罩被裁剪在内容区）
  return createPortal(
    <div
      className={`player ${closing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("player.dialogAria", { name: channel.name })}
      onAnimationEnd={(e) => {
        // 只认根节点自身的 fade-out（panel 的 scale-out 会冒泡上来，需过滤）
        if (closing && e.target === e.currentTarget) {
          setDisplayId(null);
          setClosing(false);
        }
      }}
    >
      <div className="player__backdrop" />
      <div
        className="player__panel"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (panelRef.current) trapFocus(e.nativeEvent, panelRef.current);
        }}
      >
        <header className="player__head">
          <div className="player__head-left">
            <span className="player__ch mono">{t("common.channelPos", { pos: channelPosition(channel.id) })}</span>
            <span className="player__divider" />
            {/* 连接状态指示：连接中 → 信号已锁定 / 连接失败（随 playerState 三态切换） */}
            {playerState === "error" ? (
              <span className="player__live player__live--failed mono">
                <AlertTriangle size={11} /> {t("player.connectFailed")}
              </span>
            ) : playerState === "ready" || playerState === "paused" ? (
              <span className="player__live player__live--locked mono">
                <span className="dot" /> {t("player.signalLocked")}
              </span>
            ) : (
              <span className="player__live player__live--connecting mono">
                <span className="dot" /> {t("player.connecting")}
              </span>
            )}
            <span className="player__divider" />
            <span className="mono player__time">{broadcastDate()}</span>
            <span className="player__divider" />
            <LatencyTag ms={latency} className="player__ping" />
          </div>
          <div className="player__head-actions">
            <button
              className="player__close"
              onClick={handleRetry}
              aria-label={t("common.retry")}
              title={t("common.retry")}
            >
              <RotateCcw size={16} />
            </button>
            <button className="player__close" onClick={() => openChannel(null)} aria-label={t("player.closeAria")}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="player__stage" ref={stageRef}>
          <TvPlayer
            key={`${displayId}-${streamIdx}-${retryToken}`}
            url={closing ? null : url}
            onLatencyChange={setLatency}
            onStateChange={setPlayerState}
            onStreamError={handleStreamError}
            streamTried={Math.min(streamIdx + 1, streamUrls.length)}
            streamTotal={streamUrls.length}
          />

          <aside className="player__info">
            <div className="player__channel-head" ref={headRef}>
              <div className="player__logo">
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Tv2 size={22} />
                )}
              </div>
              <div className="player__channel-titles" ref={titlesRef}>
                <div className="eyebrow">
                  {flagUrl(channel.country) && (
                    <img src={flagUrl(channel.country)!} alt="" className="player__flag" />
                  )}
                  {channel.country} · {channel.network ?? t("common.independent")}
                  {channel.categories.map((c) => (
                    <span className="tag" key={c}>{prettyCategory(c)}</span>
                  ))}
                </div>
                <h2 className="player__name display">{channel.name}</h2>
                {channel.alt_names && channel.alt_names.length > 0 && (
                  <div className="player__alt" title={channel.alt_names.join(" · ")}>
                    {channel.alt_names.join(" · ")}
                  </div>
                )}
              </div>
            </div>

            <div className="player__actions">
              <button
                className={`btn btn--ghost btn--sm ${isFav ? "is-fav" : ""}`}
                onClick={() => {
                  toggleFavorite(channel.id);
                  if (!isFav) toast.success(t("toast.favAdded"));
                  else toast.info(t("toast.favRemoved"));
                }}
              >
                <Star size={13} fill={isFav ? "currentColor" : "none"} />
                {isFav ? t("common.faved") : t("common.fav")}
              </button>
              {websiteUrl && (
                <a
                  className="btn btn--ghost btn--sm"
                  href={websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={13} /> {t("player.website")}
                </a>
              )}
            </div>

            <dl className="player__facts mono">
              <div>
                <dt>{t("player.factChannel")}</dt>
                <dd>{t("common.channelPos", { pos: channelPosition(channel.id) })}</dd>
              </div>
              <div>
                <dt>{t("player.factCountry")}</dt>
                <dd>{channel.country}</dd>
              </div>
              <div>
                <dt>{t("player.factStreams")}</dt>
                <dd>{channel.streamCount}</dd>
              </div>
              {channel.launched && (
                <div>
                  <dt>{t("player.factLaunched")}</dt>
                  <dd>{channel.launched.slice(0, 4)}</dd>
                </div>
              )}
            </dl>

            {suggestions.length > 0 && (
              <div className="player__related">
                <div className="eyebrow">
                  <Globe2 size={11} /> {t("player.related")}
                </div>
                <div className="player__related-list">
                  {suggestions.map((c) => (
                    <button
                      key={c.id}
                      className="related"
                      onClick={() => {
                        openChannel(c.id);
                        // 移动端播放页是单列布局，相关信号在底部、视频在顶部。
                        // 切换频道后把滚动容器带回顶部，让用户立刻看到新视频加载；
                        // 尊重 reduced-motion：减弱动态效果时瞬时跳转而非平滑滚动。
                        // 桌面端 .player__stage 是 overflow:hidden，scrollTo 无副作用，无需特判。
                        const reduceMotion = window.matchMedia(
                          "(prefers-reduced-motion: reduce)",
                        ).matches;
                        stageRef.current?.scrollTo({
                          top: 0,
                          behavior: reduceMotion ? "auto" : "smooth",
                        });
                      }}
                    >
                      <span className="related__logo">
                        {c.logo ? (
                          <img src={c.logo} alt="" loading="lazy" onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.opacity = "0";
                          }} />
                        ) : (
                          <Play size={11} fill="currentColor" />
                        )}
                      </span>
                      <span className="related__name">{c.name}</span>
                      <span className="mono related__ch">{channelPosition(c.id)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
