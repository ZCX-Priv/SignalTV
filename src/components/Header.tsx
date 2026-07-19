import { useEffect, useState } from "react";
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
    e.preventDefault();
    const q = filter.q.trim();
    if (q) setView({ kind: "search", q });
  }

  function clear() {
    setFilter({ q: "" });
    setView({ kind: "home" });
  }

  return (
    <header className="header">
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
          placeholder="搜索频道、电视网、国家…"
          value={filter.q}
          onChange={(e) => setFilter({ q: e.target.value })}
          aria-label="搜索频道"
        />
        {filter.q ? (
          <button type="button" className="search__clear" onClick={clear} aria-label="清除搜索">
            <X size={14} />
          </button>
        ) : (
          <span className="search__kbd kbd">
            <Command size={11} /> K
          </span>
        )}
      </form>

      <div className="header__meta">
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
