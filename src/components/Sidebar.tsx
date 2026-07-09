import { useMemo } from "react";
import {
  Home,
  Heart,
  LayoutGrid,
  Globe2,
  Hash,
  Radio,
  Tv,
  Film,
  Newspaper,
  Trophy,
  Music2,
  Baby,
  ShoppingBag,
  GraduationCap,
  Plane,
  Cpu,
  Camera,
  UtensilsCrossed,
  Sprout,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { fmt } from "../lib/format";

// 将部分 iptv-org 分类映射到合适的图标
const CAT_ICON: Record<string, LucideIcon> = {
  news: Newspaper,
  sports: Trophy,
  movies: Film,
  music: Music2,
  kids: Baby,
  entertainment: Tv,
  documentary: Camera,
  education: GraduationCap,
  shopping: ShoppingBag,
  travel: Plane,
  cooking: UtensilsCrossed,
  religious: Sprout,
  business: Activity,
  culture: Film,
  auto: Cpu,
  family: Baby,
  general: Tv,
  legislative: Hash,
  outdoor: Plane,
  relax: Music2,
  series: Film,
  weather: Globe2,
};

function catIcon(id: string): LucideIcon {
  return CAT_ICON[id] ?? Hash;
}

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const favorites = useStore((s) => s.favorites);
  const channels = useStore((s) => s.channels);
  const filter = useStore((s) => s.filter);

  // 计算每个分类的频道数
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of channels.values()) {
      if (c.is_nsfw) continue;
      for (const cat of c.categories) m.set(cat, (m.get(cat) ?? 0) + 1);
    }
    return m;
  }, [channels]);

  // 按数量取热门分类
  const topCats = useMemo(() => {
    return categories
      .map((c) => ({ ...c, count: catCounts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 14);
  }, [categories, catCounts]);

  const topCountries = useMemo(() => countries.slice(0, 14), [countries]);

  const activeCat = view.kind === "category" ? view.id : filter.categoryId;
  const activeCountry = view.kind === "country" ? view.code : filter.countryCode;

  function isActiveNav(kind: string) {
    return view.kind === kind;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__scroll">
        <nav className="nav">
          <button
            className={`nav__item ${isActiveNav("home") && !filter.q ? "is-active" : ""}`}
            onClick={() => setView({ kind: "home" })}
          >
            <Home size={15} />
            <span>首页</span>
          </button>
          <button
            className={`nav__item ${isActiveNav("favorites") ? "is-active" : ""}`}
            onClick={() => setView({ kind: "favorites" })}
          >
            <Heart size={15} />
            <span>收藏夹</span>
            {favorites.length > 0 && <span className="nav__count mono">{favorites.length}</span>}
          </button>
        </nav>

        <div className="sidebar__section">
          <div className="sidebar__label">
            <LayoutGrid size={11} />
            <span>分类</span>
          </div>
          <div className="nav">
            {topCats.map((c) => {
              const Icon = catIcon(c.id);
              const active = activeCat === c.id;
              return (
                <button
                  key={c.id}
                  className={`nav__item ${active ? "is-active" : ""}`}
                  onClick={() => setView({ kind: "category", id: c.id })}
                >
                  <Icon size={14} />
                  <span>{c.name}</span>
                  <span className="nav__count mono">{fmt(c.count)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sidebar__section">
          <div className="sidebar__label">
            <Globe2 size={11} />
            <span>国家</span>
          </div>
          <div className="nav nav--countries">
            {topCountries.map((c) => {
              const active = activeCountry === c.code;
              return (
                <button
                  key={c.code}
                  className={`nav__item nav__item--country ${active ? "is-active" : ""}`}
                  onClick={() => setView({ kind: "country", code: c.code })}
                  title={c.name}
                >
                  <span className="nav__flag">{c.flag}</span>
                  <span className="nav__country-name">{c.name}</span>
                  <span className="nav__count mono">{fmt(c.channelCount)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sidebar__footer mono">
          <div className="sidebar__footer-row">
            <Radio size={11} />
            <span>iptv-org · 公共信号源</span>
          </div>
          <div className="sidebar__footer-row sidebar__footer-row--dim">
            <span>上行链路已建立</span>
            <span className="dot" />
          </div>
        </div>
      </div>
    </aside>
  );
}
