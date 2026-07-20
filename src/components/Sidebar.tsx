import { useCallback, useMemo, useState } from "react";
import {
  Home,
  Heart,
  LayoutGrid,
  Globe2,
  Radio,
  ChevronRight,
  Settings,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { fmt } from "../lib/format";
import { catIcon } from "../lib/categoryIcon";
import { CategoryPickerModal } from "./CategoryPickerModal";
import { CountryPickerModal } from "./CountryPickerModal";
import type { CountryInfo } from "../types";

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const favorites = useStore((s) => s.favorites);
  const channels = useStore((s) => s.channels);
  const filter = useStore((s) => s.filter);
  const recentCategories = useStore((s) => s.recentCategories);
  const recentCountries = useStore((s) => s.recentCountries);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const mobileSidebarOpen = useStore((s) => s.mobileSidebarOpen);
  const setMobileSidebar = useStore((s) => s.setMobileSidebar);

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  // 用 useCallback 稳定 onClose 引用，避免 Sidebar 重渲染时 Picker Modal 的
  // useEffect([open, onClose]) 因 onClose 变化而重跑，导致搜索框被清空。
  // useState 返回的 setter 引用永不变化，依赖数组可空。
  const closeCategoryPicker = useCallback(() => setCategoryPickerOpen(false), []);
  const closeCountryPicker = useCallback(() => setCountryPickerOpen(false), []);

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
    const ranked = categories
      .map((c) => ({ ...c, count: catCounts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    // 最近使用的分类（按使用时间倒序）排到最前，并保持最多 14 项
    const recentInRanked = recentCategories
      .map((id) => ranked.find((c) => c.id === id))
      .filter((c): c is { id: string; name: string; count: number } => !!c);
    const recentIds = new Set(recentInRanked.map((c) => c.id));
    const rest = ranked.filter((c) => !recentIds.has(c.id));
    return [...recentInRanked, ...rest].slice(0, 14);
  }, [categories, catCounts, recentCategories]);

  const topCountries = useMemo(() => {
    // countries 已按 channelCount 降序、已过滤 channelCount === 0
    const recentInList = recentCountries
      .map((code) => countries.find((c) => c.code === code))
      .filter((c): c is CountryInfo => !!c);
    const recentCodes = new Set(recentInList.map((c) => c.code));
    const rest = countries.filter((c) => !recentCodes.has(c.code));
    return [...recentInList, ...rest].slice(0, 14);
  }, [countries, recentCountries]);

  const activeCat = view.kind === "category" ? view.id : filter.categoryId;
  const activeCountry = view.kind === "country" ? view.code : filter.countryCode;

  function isActiveNav(kind: string) {
    return view.kind === kind;
  }

  return (
    <>
      {mobileSidebarOpen && (
        <div className="sidebar__overlay" onClick={() => setMobileSidebar(false)} />
      )}
      <aside
        className={`sidebar ${sidebarCollapsed ? "is-collapsed" : ""} ${mobileSidebarOpen ? "is-mobile-open" : ""}`}
        onClickCapture={(e) => {
          if (!mobileSidebarOpen) return;
          const button = (e.target as HTMLElement).closest("button");
          if (!button) return;
          setMobileSidebar(false);
        }}
      >
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
            <button
              type="button"
              className="sidebar__label-action"
              onClick={() => setCategoryPickerOpen(true)}
              aria-label="查看全部分类"
              title="全部分类"
            >
              <span>全部</span>
              <ChevronRight size={11} />
            </button>
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
            <button
              type="button"
              className="sidebar__label-action"
              onClick={() => setCountryPickerOpen(true)}
              aria-label="查看全部国家"
              title="全部国家"
            >
              <span>全部</span>
              <ChevronRight size={11} />
            </button>
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
          <button
            className={`sidebar__settings-btn sidebar__status-btn ${view.kind === "status" ? "is-active" : ""}`}
            onClick={() => setView({ kind: "status" })}
            aria-label="状态"
            title="状态"
          >
            <Radio size={13} />
            <span>状态</span>
            <span className="dot" aria-hidden />
          </button>
          <button
            className={`sidebar__settings-btn ${view.kind === "settings" ? "is-active" : ""}`}
            onClick={() => setView({ kind: "settings" })}
            aria-label="设置"
            title="设置"
          >
            <Settings size={13} />
            <span>设置</span>
          </button>
        </div>
      </div>
    </aside>
      <CategoryPickerModal
        open={categoryPickerOpen}
        onClose={closeCategoryPicker}
      />
      <CountryPickerModal
        open={countryPickerOpen}
        onClose={closeCountryPicker}
      />
    </>
  );
}
