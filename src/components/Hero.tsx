import { useMemo } from "react";
import { Play, Star, Globe2, Tv2, ArrowUpRight } from "lucide-react";
import { useStore } from "../store/useStore";
import { useAllChannels } from "../hooks/useChannels";
import { broadcastDate, channelPosition, flagUrlLg, prettyCategory } from "../lib/format";

// 精选分类列表——每次加载从这些分类中随机挑一个频道作为首屏主推
const FEATURE_CATEGORIES = ["movies", "news", "sports", "music", "documentary", "entertainment"];

export function Hero() {
  const all = useAllChannels();
  const openChannel = useStore((s) => s.openChannel);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const favorites = useStore((s) => s.favorites);
  const setView = useStore((s) => s.setView);

  const featured = useMemo(() => {
    const pool = all.filter(
      (c) =>
        !c.is_nsfw &&
        c.logo &&
        c.categories.some((cat) => FEATURE_CATEGORIES.includes(cat)),
    );
    if (pool.length === 0) return undefined;
    // 每次会话随机挑选，但限制范围
    const idx = Math.floor(Math.random() * Math.min(pool.length, 400));
    return pool[idx];
  }, [all]);

  // 右侧"正在播放"轮播频道列表
  const ticker = useMemo(() => {
    return all
      .filter((c) => !c.is_nsfw && c.logo)
      .slice(0, 6);
  }, [all]);

  if (!featured) return null;

  const isFav = favorites.includes(featured.id);
  const primaryCat = featured.categories[0];

  return (
    <section className="hero">
      <div className="hero__grid">
        {/* 左侧：编辑式大字 */}
        <div className="hero__lead">
          <div className="hero__eyebrow">
            <span className="dot" />
            <span className="mono">直播中 · {broadcastDate()}</span>
          </div>

          <h1 className="hero__title display">
            世界，
            <br />
            <em>实时调频。</em>
          </h1>

          <p className="hero__lede">
            聚合全球{" "}
            <strong>{all.length.toLocaleString("en-US")}</strong>{" "}
            路免费电视频道，涵盖新闻、电影、体育、音乐、纪录片等分类，无需注册即开即看。
          </p>

          <div className="hero__actions">
            <button
              className="btn btn--primary"
              onClick={() => openChannel(featured.id)}
            >
              <Play size={15} fill="currentColor" />
              <span>调频至精选</span>
              <span className="mono btn__meta">频道 {channelPosition(featured.id)}</span>
            </button>
            <button
              className={`btn btn--ghost ${isFav ? "is-fav" : ""}`}
              onClick={() => toggleFavorite(featured.id)}
              aria-label={isFav ? "移出收藏" : "加入收藏"}
            >
              <Star size={15} fill={isFav ? "currentColor" : "none"} />
              <span>{isFav ? "已收藏" : "收藏"}</span>
            </button>
          </div>
        </div>

        {/* 右侧：精选频道卡片 */}
        <button className="feature" onClick={() => openChannel(featured.id)}>
          <div className="feature__media">
            <div className="feature__noise" />
            <div className="feature__scan" />
            {featured.logo && (
              <img
                className="feature__logo"
                src={featured.logo}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="feature__badge">
              <span className="bars"><span /><span /><span /><span /></span>
              <span className="mono">精选</span>
            </div>
            <div className="feature__play">
              <Play size={26} fill="currentColor" />
            </div>
            <div className="feature__corner mono">
              <span>频道 {channelPosition(featured.id)}</span>
              <span>● 录制</span>
            </div>
          </div>
          <div className="feature__body">
            <div className="feature__top">
              <span className="mono feature__cat">
                {primaryCat ? prettyCategory(primaryCat) : "频道"}
              </span>
              <span className="feature__country">
                {flagUrlLg(featured.country) && (
                  <img src={flagUrlLg(featured.country)!} alt="" className="feature__flag" />
                )}
                <span className="mono">{featured.country}</span>
              </span>
            </div>
            <h2 className="feature__name display">{featured.name}</h2>
            <div className="feature__meta mono">
              <span><Tv2 size={11} /> {featured.network ?? "独立"}</span>
              {featured.categories.length > 0 && (
                <span>
                  <Globe2 size={11} />
                  {featured.categories.slice(0, 3).map(prettyCategory).join(" / ")}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>

      {/* 滚动 ticker：CSS animation 无限循环，2 份内容拼接实现无缝衔接 */}
      <div className="ticker" aria-hidden>
        <div className="ticker__label mono">
          <span className="dot" /> 正在播放
        </div>
        {ticker.length > 0 && (
          <div className="ticker__track">
            <div className="ticker__inner">
              {[...ticker, ...ticker].map((c, i) => (
                <div className="ticker__item" key={`${c.id}-${i}`} onClick={() => openChannel(c.id)}>
                  {c.logo ? (
                    <img src={c.logo} alt="" onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = "0";
                    }} />
                  ) : (
                    <span className="mono">{c.name}</span>
                  )}
                  <span className="ticker__name mono">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button className="ticker__more" onClick={() => setView({ kind: "home" })}>
          <ArrowUpRight size={14} />
        </button>
      </div>
    </section>
  );
}
