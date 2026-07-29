import { useEffect, useMemo } from "react";
import { Play, Star, Globe2, Tv2, ArrowUpRight } from "lucide-react";
import { useStore } from "../store/useStore";
import { useAllChannels } from "../hooks/useChannels";
import { broadcastDate, channelPosition, flagUrlLg, fmt, prettyCategory } from "../lib/format";
import { toast } from "../lib/toast";
import { useI18n } from "../i18n";
import { SkeletonImg } from "./Skeletons";

// 精选分类列表——每次加载从这些分类中随机挑一个频道作为首屏主推
const FEATURE_CATEGORIES = ["movies", "news", "sports", "music", "documentary", "entertainment"];

// 会话级缓存选中的精选频道 id：Hero 在离开/回到首页时会重新挂载，
// 若每次都重新随机会导致精选卡片频繁跳变；缓存后整个会话保持稳定
let sessionFeaturedId: string | null = null;

export function Hero() {
  const { t } = useI18n();
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
    // 优先复用本次会话已选中的频道（重挂载不重新随机）
    if (sessionFeaturedId) {
      const cached = pool.find((c) => c.id === sessionFeaturedId);
      if (cached) return cached;
    }
    // 首次（或缓存频道已不存在）随机挑选，但限制范围
    const idx = Math.floor(Math.random() * Math.min(pool.length, 400));
    return pool[idx];
  }, [all]);

  // 会话级缓存在 effect 中提交：渲染阶段写模块级变量违反渲染纯度
  //（StrictMode 双渲染下 Math.random 执行两次结果可能不同）
  useEffect(() => {
    if (featured) sessionFeaturedId = featured.id;
  }, [featured]);

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
            <span className="mono">{t("common.liveNow")} · {broadcastDate()}</span>
          </div>

          <h1 className="hero__title display">
            {t("hero.title1")}
            <br />
            <em>{t("hero.title2")}</em>
          </h1>

          <p className="hero__lede">
            {t("hero.lede1")}{" "}
            <strong>{fmt(all.length)}</strong>{" "}
            {t("hero.lede2")}
          </p>

          <div className="hero__actions">
            <button
              className="btn btn--primary"
              onClick={() => openChannel(featured.id)}
            >
              <Play size={15} fill="currentColor" />
              <span>{t("hero.tuneIn")}</span>
              <span className="mono btn__meta">{t("common.channelPos", { pos: channelPosition(featured.id) })}</span>
            </button>
            <button
              className={`btn btn--ghost ${isFav ? "is-fav" : ""}`}
              onClick={() => {
                toggleFavorite(featured.id);
                if (!isFav) toast.success(t("toast.favAdded"));
                else toast.info(t("toast.favRemoved"));
              }}
              aria-label={isFav ? t("common.favRemove") : t("common.favAdd")}
            >
              <Star size={15} fill={isFav ? "currentColor" : "none"} />
              <span>{isFav ? t("common.faved") : t("common.fav")}</span>
            </button>
          </div>
        </div>

        {/* 右侧：精选频道卡片 */}
        <button className="feature" onClick={() => openChannel(featured.id)}>
          <div className="feature__media">
            <div className="feature__noise" />
            <div className="feature__scan" />
            {featured.logo && (
              // 精选卡大 logo：加载完成前铺满媒体区的 shimmer 骨架
              //（feature__media 已是 relative + overflow:hidden），
              // 失败退化为纯背景（与原 display:none 等效）
              <SkeletonImg
                className="feature__logo"
                src={featured.logo}
                alt=""
              />
            )}
            <div className="feature__badge">
              <span className="bars"><span /><span /><span /><span /></span>
              <span className="mono">{t("hero.featured")}</span>
            </div>
            <div className="feature__play">
              <Play size={26} fill="currentColor" />
            </div>
            <div className="feature__corner mono">
              <span>{t("common.channelPos", { pos: channelPosition(featured.id) })}</span>
              <span>{t("hero.rec")}</span>
            </div>
          </div>
          <div className="feature__body">
            <div className="feature__top">
              <span className="mono feature__cat">
                {primaryCat ? prettyCategory(primaryCat) : t("common.channel")}
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
              <span><Tv2 size={11} /> {featured.network ?? t("common.independent")}</span>
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
          <span className="dot" /> {t("hero.nowPlaying")}
        </div>
        {ticker.length > 0 && (
          <div className="ticker__track">
            <div className="ticker__inner">
              {[...ticker, ...ticker].map((c, i) => (
                <div className="ticker__item" key={`${c.id}-${i}`} onClick={() => openChannel(c.id)}>
                  {c.logo ? (
                    <img src={c.logo} alt="" loading="lazy" onError={(e) => {
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
