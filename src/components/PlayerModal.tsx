import { useEffect } from "react";
import {
  X,
  Play,
  Loader2,
  AlertTriangle,
  Star,
  Globe2,
  Tv2,
  ExternalLink,
  Volume2,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useChannel } from "../hooks/useChannels";
import { useHls } from "../hooks/useHls";
import { broadcastDate, channelPosition, flagUrl, prettyCategory } from "../lib/format";
import { LatencyTag } from "./LatencyTag";

export function PlayerModal() {
  const activeId = useStore((s) => s.activeChannelId);
  const openChannel = useStore((s) => s.openChannel);
  const channel = useChannel(activeId);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const channels = useStore((s) => s.channels);

  const url = channel?.streamUrl ?? null;
  const { videoRef, state, message, latency } = useHls(url);

  // ESC 关闭
  useEffect(() => {
    if (!activeId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") openChannel(null);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [activeId, openChannel]);

  if (!activeId || !channel) return null;

  const isFav = favorites.includes(channel.id);

  // 推荐的关联频道（同主分类、不同 id）
  const primaryCat = channel.categories[0];
  const suggestions = primaryCat
    ? Array.from(channels.values())
        .filter((c) => c.id !== channel.id && c.categories.includes(primaryCat) && !c.is_nsfw)
        .slice(0, 6)
    : [];

  return (
    <div className="player" role="dialog" aria-modal="true" aria-label={`正在播放 ${channel.name}`}>
      <div className="player__backdrop" onClick={() => openChannel(null)} />
      <div className="player__panel">
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
          </div>
          <button className="player__close" onClick={() => openChannel(null)} aria-label="关闭播放器">
            <X size={18} />
          </button>
        </header>

        <div className="player__stage">
          <div className={`player__video ${state === "error" ? "is-error" : ""}`}>
            <video
              ref={videoRef}
              playsInline
              controls
              autoPlay
              className="player__el"
            />

            {state === "loading" && (
              <div className="player__overlay">
                <Loader2 size={28} className="spin" />
                <p className="mono">正在获取信号…</p>
              </div>
            )}

            {state === "error" && (
              <div className="player__overlay player__overlay--error">
                <AlertTriangle size={28} />
                <h3 className="display">信号丢失。</h3>
                <p>{message ?? "此直播流不可用。"}</p>
                <p className="player__error-note mono">
                  许多免费信号受地区限制或间歇性离线，请尝试同一电视网的其他频道。
                </p>
              </div>
            )}

            {state === "ready" && (
              <div className="player__signaltv mono">
                <Volume2 size={11} /> 信号已锁定 · {channel.country}
              </div>
            )}

            <div className="player__scan" />
          </div>

          <aside className="player__info">
            <div className="player__channel-head">
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
              <div className="player__channel-titles">
                <div className="eyebrow">
                  {flagUrl(channel.country) && (
                    <img src={flagUrl(channel.country)!} alt="" className="player__flag" />
                  )}
                  {channel.country} · {channel.network ?? "独立"}
                </div>
                <h2 className="player__name display">{channel.name}</h2>
              </div>
            </div>

            <div className="player__actions">
              <button
                className={`btn btn--ghost btn--sm ${isFav ? "is-fav" : ""}`}
                onClick={() => toggleFavorite(channel.id)}
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

            {channel.categories.length > 0 && (
              <div className="player__cats">
                {channel.categories.map((c) => (
                  <span className="tag" key={c}>{prettyCategory(c)}</span>
                ))}
              </div>
            )}

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
                      onClick={() => openChannel(c.id)}
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
