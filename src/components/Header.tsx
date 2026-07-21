import { useEffect, useRef, useState } from "react";
import { Search, X, Command, Menu } from "lucide-react";
import { useStore } from "../store/useStore";
import { useAllChannels } from "../hooks/useChannels";
import { broadcastDate, clock } from "../lib/format";
import { Logo } from "./Logo";

export function Header() {
  const setFilter = useStore((s) => s.setFilter);
  const filter = useStore((s) => s.filter);
  const setView = useStore((s) => s.setView);
  const channels = useAllChannels();
  const mobileSidebarOpen = useStore((s) => s.mobileSidebarOpen);
  const setMobileSidebar = useStore((s) => s.setMobileSidebar);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const [now, setNow] = useState(() => new Date());
  // 响应式判定：≤860px 视为移动端，与 CSS 媒体查询断点一致
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 860px)").matches : false,
  );
  // 手机端判定：≤510px，用于搜索框内 bars 替代 ⌘K 提示
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 510px)").matches : false,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
  }, [isMobile]);

  // 展开搜索框时自动聚焦输入框（setTimeout 等待 display 切换生效）
  useEffect(() => {
    if (isMobile && searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isMobile, searchOpen]);

  const liveCount = channels.length;

  function onMenuClick() {
    if (isMobile) {
      setMobileSidebar(!mobileSidebarOpen);
    } else {
      toggleSidebar();
    }
  }

  const menuLabel = isMobile
    ? mobileSidebarOpen
      ? "关闭菜单"
      : "打开菜单"
    : sidebarCollapsed
      ? "展开侧边栏"
      : "收起侧边栏";

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
          placeholder="搜索频道、电视台、国家…"
          value={filter.q}
          onChange={(e) => setFilter({ q: e.target.value })}
          onBlur={onSearchBlur}
          aria-label="搜索频道"
          ref={searchInputRef}
        />
        {filter.q ? (
          <button type="button" className="search__clear" onClick={clear} aria-label="清除搜索">
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
            aria-label="搜索"
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
            <strong>{liveCount.toLocaleString("en-US")}</strong> 路信号直播中
          </span>
        </div>
        <div className="header__clock mono" title={broadcastDate(now)}>
          {clock(now)}
        </div>
      </div>
    </header>
  );
}
