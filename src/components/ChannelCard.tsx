import { memo, type CSSProperties } from "react";
import { Play, Star, Tv2 } from "lucide-react";
import type { ChannelWithStream } from "../types";
import { useStore } from "../store/useStore";
import { channelPosition, flagUrl, flagSvgUrl, countryGradient, prettyCategory } from "../lib/format";
import { toast } from "../lib/toast";
import { LatencyTag } from "./LatencyTag";

interface Props {
  channel: ChannelWithStream;
  index: number;
}

export const ChannelCard = memo(function ChannelCard({ channel, index }: Props) {
  const openChannel = useStore((s) => s.openChannel);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const favorites = useStore((s) => s.favorites);
  const isFav = favorites.includes(channel.id);
  const latency = useStore((s) => s.latency.get(channel.id));

  const cat = channel.categories[0];
  const pos = channelPosition(channel.id);

  const flagSvg = flagSvgUrl(channel.country);
  const mediaBackground = flagSvg
    ? [
        "radial-gradient(120% 80% at 50% 30%, rgba(255, 59, 48, 0.10), transparent 60%)",
        `url("${flagSvg}")`,
        countryGradient(channel.country),
      ]
    : [
        "radial-gradient(120% 80% at 50% 30%, rgba(255, 59, 48, 0.10), transparent 60%)",
        countryGradient(channel.country),
      ];
  const mediaBlend = flagSvg ? "normal, overlay, normal" : "normal, normal";
  const mediaStyle: CSSProperties = {
    backgroundImage: mediaBackground.join(", "),
    backgroundSize: flagSvg ? "cover, cover, cover" : "cover, cover",
    backgroundPosition: "center, center, center",
    backgroundRepeat: "no-repeat, no-repeat, no-repeat",
    backgroundBlendMode: mediaBlend,
    backgroundColor: "#16161c",
  };

  return (
    <article
      className="card"
      style={{ animationDelay: `${Math.min(index, 24) * 28}ms` }}
      onClick={() => openChannel(channel.id)}
    >
      <div className="card__media" style={mediaStyle}>
        <div className="card__noise" />
        {channel.logo ? (
          <img
            className="card__logo"
            src={channel.logo}
            alt=""
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = "none";
              img.parentElement?.classList.add("card__media--empty");
            }}
          />
        ) : null}
        <div className="card__placeholder">
          <span className="card__placeholder-name">{channel.name}</span>
          <span className="card__placeholder-country">{channel.country}</span>
        </div>

        <span className="card__pos mono">频道 {pos}</span>

        <div className="card__hover">
          <span className="card__play">
            <Play size={18} fill="currentColor" />
          </span>
        </div>

        <div className="card__live mono">
          <span className="dot" /> 直播
        </div>

        <LatencyTag ms={latency} className="card__ping" />
        {channel.is_nsfw && (
          <span className="card__nsfw">成人</span>
        )}
      </div>

      <div className="card__body">
        <div className="card__top">
          <h3 className="card__name" title={channel.name}>{channel.name}</h3>
          <button
            className={`card__fav ${isFav ? "is-fav" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(channel.id);
              if (!isFav) toast.success("已加入收藏夹");
              else toast.info("已移出收藏夹");
            }}
            aria-label={isFav ? "移出收藏" : "加入收藏"}
          >
            <Star size={13} fill={isFav ? "currentColor" : "none"} />
          </button>
        </div>

        {channel.alt_names && channel.alt_names.length > 0 && (
          <div className="card__alt" title={channel.alt_names.join(" · ")}>
            {channel.alt_names.join(" · ")}
          </div>
        )}

        <div className="card__meta mono">
          {flagUrl(channel.country) && (
            <img src={flagUrl(channel.country)!} alt="" className="card__flag" />
          )}
          <span>{channel.country}</span>
          {channel.network && (
            <>
              <span className="card__sep">·</span>
              <span className="card__net" title={channel.network}>
                <Tv2 size={10} /> {channel.network}
              </span>
            </>
          )}
        </div>

        {cat && (
          <div className="card__cats">
            <span className="tag">{prettyCategory(cat)}</span>
            {channel.categories.length > 1 && (
              <span className="tag tag--muted mono">+{channel.categories.length - 1}</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
});
