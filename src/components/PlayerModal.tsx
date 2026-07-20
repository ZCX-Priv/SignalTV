import { useEffect, useMemo, useState } from "react";
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
import { LatencyTag } from "./LatencyTag";
import { TvPlayer } from "./TvPlayer";

export function PlayerModal() {
  const activeId = useStore((s) => s.activeChannelId);
  const openChannel = useStore((s) => s.openChannel);
  const channel = useChannel(activeId);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const channels = useStore((s) => s.channels);

  const url = channel?.streamUrl ?? null;
  const [latency, setLatency] = useState<number | null>(null);
  const [playerState, setPlayerState] = useState<"idle" | "loading" | "ready" | "paused" | "error">("idle");

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
      <div className="player__panel">
        <header className="player__head">
          <div className="player__head-left">
            <span className="player__ch mono">频道 {channelPosition(channel.id)}</span>
            <span className="player__divider" />
            <span className="player__live mono">
              <span className="dot" />
              <span className="player__live-text">直播中</span>
            </span>
            <span className="player__divider" />
            <span className="mono player__time">{broadcastDate()}</span>
            <span className="player__divider" />
            <LatencyTag ms={latency} className="player__ping" />
            {playerState === "ready" && (
              <>
                <span className="player__divider" />
                <span className="player__signal-lock mono">
                  <Lock size={11} />
                  <span className="player__signal-lock-text">信号已锁定 · {channel.country}</span>
                </span>
              </>
            )}
          </div>
          <button className="player__close" onClick={() => openChannel(null)} aria-label="关闭播放器">
            <X size={18} />
          </button>
        </header>

        <div className="player__stage">
          <TvPlayer
            url={url}
            onLatencyChange={setLatency}
            onStateChange={setPlayerState}
          />

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
                  {channel.categories.map((c) => (
                    <span className="tag" key={c}>{prettyCategory(c)}</span>
                  ))}
                </div>
                <h2 className="player__name display">{channel.name}</h2>
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
