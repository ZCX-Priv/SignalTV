import { useEffect, useRef, useState } from "react";
import { Search, X, Command, Menu } from "lucide-react";
import { useStore } from "../store/useStore";
import { broadcastDate, clock, fmt } from "../lib/format";
import { applySeo, describeSearch, describeView } from "../lib/seo";
import { useI18n } from "../i18n";
import { Logo } from "./Logo";

// 时钟隔离成独立组件：每秒 setInterval 只重渲染此小组件，
// 避免整个 Header（含搜索表单/logo/菜单）每秒重渲染
function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="header__clock mono" title={broadcastDate(now)}>
      {clock(now)}
    </div>
  );
}

export function Header() {
  const { t } = useI18n();
  const setFilter = useStore((s) => s.setFilter);
  const filter = useStore((s) => s.filter);
  const setView = useStore((s) => s.setView);
  // 只需频道总数：直接订阅 Map.size，避免 useAllChannels 为此
  // 对万条频道做一次独立的全量排序（Hero 已有一份，useMemo 不跨组件共享）
  const liveCount = useStore((s) => s.channels.size);
  const mobileSidebarOpen = useStore((s) => s.mobileSidebarOpen);
  const setMobileSidebar = useStore((s) => s.setMobileSidebar);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  // 响应式判定：≤860px 视为移动端，与 CSS 媒体查询断点一致
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 860px)").matches : false,
  );
  // 手机端判定：≤510px，用于搜索框内 bars 替代 ⌘K 提示
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 510px)").matches : false,
  );
  // searchOpen 上移到 store：App 的 Ctrl+K 快捷键需要在移动端先展开再聚焦
  const searchOpen = useStore((s) => s.searchOpen);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 860px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 510px)");
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // 退出移动端时重置展开状态，避免残留 is-search-open 影响桌面端
  useEffect(() => {
    if (!isMobile) setSearchOpen(false);
  }, [isMobile, setSearchOpen]);

  // 展开搜索框时自动聚焦输入框（setTimeout 等待 display 切换生效）
  useEffect(() => {
    if (isMobile && searchOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [isMobile, searchOpen]);

  // 搜索词 SEO：搜索走 filter.q 实时过滤（非独立 view），
  // debounce 300ms 后同步 title/description；清空时恢复当前视图的 SEO
  const q = filter.q.trim();
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q) {
        applySeo(describeSearch(q));
      } else {
        const s = useStore.getState();
        applySeo(
          describeView(s.view, s.filter, {
            categories: s.categories,
            countries: s.countries,
            channels: s.channels,
          }),
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  function onMenuClick() {
    if (isMobile) {
      setMobileSidebar(!mobileSidebarOpen);
    } else {
      toggleSidebar();
    }
  }

  const menuLabel = isMobile
    ? mobileSidebarOpen
      ? t("header.menuClose")
      : t("header.menuOpen")
    : sidebarCollapsed
      ? t("header.sidebarExpand")
      : t("header.sidebarCollapse");

  function onSubmit(e: React.FormEvent) {
    // 回车不再触发二次搜索：实时过滤已由 onChange 完成，此处仅阻止表单默认提交
    e.preventDefault();
  }

  function clear() {
    setFilter({ q: "" });
    setView({ kind: "home" });
    // 清空后把焦点还给输入框：用户可继续输入；且后续点击空白处能触发 onBlur 收起搜索框
    searchInputRef.current?.focus();
  }

  function onSearchBlur() {
    // 失焦时若无搜索词则自动收起；有搜索词时保持展开（用户明确要求）
    if (isMobile && !filter.q.trim()) {
      setSearchOpen(false);
    }
  }

  function openSearch() {
    setSearchOpen(true);
  }

  return (
    <header className={`header${isMobile && searchOpen ? " is-search-open" : ""}`}>
      <button
        className="header__menu"
        onClick={onMenuClick}
        aria-label={menuLabel}
        aria-expanded={isMobile ? mobileSidebarOpen : !sidebarCollapsed}
      >
        <Menu size={18} />
      </button>
      <Logo />
      <form className="search" onSubmit={onSubmit} role="search">
        <Search size={16} strokeWidth={2} className="search__icon" />
        <input
          className="search__input"
          type="text"
          placeholder={t("header.searchPlaceholder")}
          value={filter.q}
          onChange={(e) => setFilter({ q: e.target.value })}
          onBlur={onSearchBlur}
          aria-label={t("header.searchAria")}
          spellCheck={false}
          ref={searchInputRef}
        />
        {filter.q ? (
          <button type="button" className="search__clear" onClick={clear} aria-label={t("header.searchClear")}>
            <X size={14} />
          </button>
        ) : isPhone ? (
          <span className="bars search__bars" aria-hidden>
            <span /><span /><span /><span />
          </span>
        ) : (
          <span className="search__kbd kbd">
            <Command size={11} /> K
          </span>
        )}
      </form>

      <div className="header__meta">
        {isMobile && (
          <button
            type="button"
            className="header__search-toggle"
            onClick={openSearch}
            aria-label={t("header.search")}
            aria-expanded={searchOpen}
          >
            <Search size={18} />
          </button>
        )}
        <div className="header__live">
          <span className="bars" aria-hidden>
            <span /><span /><span /><span />
          </span>
          <span className="mono header__live-text">
            <strong>{fmt(liveCount)}</strong> {t("header.liveCountSuffix")}
          </span>
        </div>
        <HeaderClock />
      </div>
    </header>
  );
}
