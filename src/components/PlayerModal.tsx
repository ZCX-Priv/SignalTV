import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Play,
  Star,
  Globe2,
  Tv2,
  ExternalLink,
  Lock,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useChannel } from "../hooks/useChannels";
import { broadcastDate, channelPosition, flagUrl, prettyCategory } from "../lib/format";
import { toast } from "../lib/toast";
import { pushModal, trapFocus } from "../lib/modalStack";
import { LatencyTag } from "./LatencyTag";
import { TvPlayer } from "./TvPlayer";

export function PlayerModal() {
  const activeId = useStore((s) => s.activeChannelId);
  const openChannel = useStore((s) => s.openChannel);
  const channel = useChannel(activeId);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const channels = useStore((s) => s.channels);

  // 流故障转移：当前播放的流索引，失败时递增；切频道时重置。
  // retryToken 用于"重试"时强制 remount TvPlayer（即使 streamIdx 已是 0）。
  const [streamIdx, setStreamIdx] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const streamUrls = useMemo(() => channel?.streamUrls ?? [], [channel]);
  const url = streamUrls[streamIdx] ?? null;

  useEffect(() => {
    setStreamIdx(0);
    setRetryToken(0);
  }, [activeId]);

  // TvPlayer 播放失败 → 切到下一路流；返回是否还有备用流可切
  const handleStreamError = useCallback(() => {
    let switched = false;
    setStreamIdx((i) => {
      if (i + 1 < streamUrls.length) {
        switched = true;
        return i + 1;
      }
      return i;
    });
    if (switched) toast.info("当前流不可用，已切换备用信号源");
    return switched;
  }, [streamUrls.length]);

  // 错误面板"重试"：从第一路流重新开始，retryToken 变化强制 remount
  const handleRetry = useCallback(() => {
    setStreamIdx(0);
    setRetryToken((t) => t + 1);
  }, []);

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
  }, [activeId]);

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

  if (!activeId || !channel) return null;

  const isFav = favorites.includes(channel.id);

  return (
    <div className="player" role="dialog" aria-modal="true" aria-label={`正在播放 ${channel.name}`}>
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
            <span className="player__ch mono">频道 {channelPosition(channel.id)}</span>
            <span className="player__divider" />
            <span className="player__live mono">
              <span className="dot" /> 直播中
            </span>
            <span className="player__divider" />
            <span className="mono player__time">{broadcastDate()}</span>
            <span className="player__divider" />
            <LatencyTag ms={latency} className="player__ping" />
            {playerState === "ready" && (
              <>
                <span className="player__divider" />
                <span className="player__signal-lock mono">
                  <Lock size={11} /> 信号已锁定 · {channel.country}
                </span>
              </>
            )}
          </div>
          <button className="player__close" onClick={() => openChannel(null)} aria-label="关闭播放器">
            <X size={18} />
          </button>
        </header>

        <div className="player__stage" ref={stageRef}>
          <TvPlayer
            key={`${activeId}-${streamIdx}-${retryToken}`}
            url={url}
            onLatencyChange={setLatency}
            onStateChange={setPlayerState}
            onStreamError={handleStreamError}
            onRetry={handleRetry}
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
                  {channel.country} · {channel.network ?? "独立"}
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
                  if (!isFav) toast.success("已加入收藏夹");
                  else toast.info("已移出收藏夹");
                }}
              >
                <Star size={13} fill={isFav ? "currentColor" : "none"} />
                {isFav ? "已收藏" : "收藏"}
              </button>
              {channel.website && (
                <a
                  className="btn btn--ghost btn--sm"
                  href={channel.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={13} /> 官网
                </a>
              )}
            </div>

            <dl className="player__facts mono">
              <div>
                <dt>频道号</dt>
                <dd>频道 {channelPosition(channel.id)}</dd>
              </div>
              <div>
                <dt>国家</dt>
                <dd>{channel.country}</dd>
              </div>
              <div>
                <dt>流数量</dt>
                <dd>{channel.streamCount}</dd>
              </div>
              {channel.launched && (
                <div>
                  <dt>开播</dt>
                  <dd>{channel.launched.slice(0, 4)}</dd>
                </div>
              )}
            </dl>

            {suggestions.length > 0 && (
              <div className="player__related">
                <div className="eyebrow">
                  <Globe2 size={11} /> 相关信号
                </div>
                <div className="player__related-list">
                  {suggestions.map((c) => (
                    <button
                      key={c.id}
                      className="related"
                      onClick={() => {
                        openChannel(c.id);
                        // 移动端播放页是单列布局，相关信号在底部、视频在顶部。
                        // 切换频道后把滚动容器平滑带回顶部，让用户立刻看到新视频加载。
                        // 桌面端 .player__stage 是 overflow:hidden，scrollTo 无副作用，无需特判。
                        stageRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <span className="related__logo">
                        {c.logo ? (
                          <img src={c.logo} alt="" onError={(e) => {
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
    </div>
  );
}
