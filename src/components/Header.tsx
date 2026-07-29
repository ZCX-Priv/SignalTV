import { useEffect, useRef, useState } from "react";
import { Search, X, Command, Menu } from "lucide-react";
import { useStore } from "../store/useStore";
import { broadcastDate, clock, fmt } from "../lib/format";
import { applySeo, describeSearch, describeView } from "../lib/seo";
import { useI18n } from "../i18n";
import { Logo } from "./Logo";
import { SearchHistoryDropdown } from "./SearchHistoryDropdown";

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
  const pushSearchHistory = useStore((s) => s.pushSearchHistory);
  // 搜索历史下拉：输入框聚焦打开，失焦/ESC/选词后关闭（出场动画在组件内部）
  const [historyOpen, setHistoryOpen] = useState(false);
  // 下拉内交互标记：个别移动浏览器在下拉的 pointerdown preventDefault
  // 生效前就让输入框 blur（拦截失效），需要此 ref 在 blur 处理中辨认
  // 「blur 源自下拉内点击」——此时不收下拉/搜索框，并把焦点还给输入框；
  // capture 阶段的 pointerdown 先于 blur 触发，标记时序可靠。
  // 拦截生效（blur 未发生）时标记无人消费，靠超时自动复位，
  // 避免残留 true 误吃后续真正的外部点击 blur
  const historyInteractRef = useRef(false);
  const historyInteractTimer = useRef<number | null>(null);
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
    // 回车不再触发二次搜索：实时过滤已由 onChange 完成，此处仅阻止表单默认提交；
    // 非空词记入搜索历史（仿 YouTube：确认搜索才留历史）并收起下拉
    e.preventDefault();
    if (filter.q.trim()) {
      pushSearchHistory(filter.q);
      setHistoryOpen(false);
    }
  }

  function clear() {
    setFilter({ q: "" });
    setView({ kind: "home" });
    // 清空后把焦点还给输入框：用户可继续输入；且后续点击空白处能触发 onBlur 收起搜索框
    searchInputRef.current?.focus();
  }

  function onSearchBlur(e: React.FocusEvent<HTMLInputElement>) {
    // 焦点进了删除确认模态（ConfirmModal 打开时自动聚焦取消按钮）：
    // 不关下拉、不收搜索框，也不能把焦点抢回来（会和模态焦点圈定打架）；
    // 模态关闭时自带焦点还原会把焦点送回输入框，下拉保持打开
    if (e.relatedTarget instanceof Element && e.relatedTarget.closest(".confirm")) {
      historyInteractRef.current = false;
      return;
    }
    // blur 源自下拉内点击（第一层 pointerdown 拦截在个别移动浏览器失效时
    // 的兜底）：不收下拉、不收搜索框，把焦点还给输入框让后续交互继续；
    // relatedTarget 落在下拉内（如键盘 Tab 进下拉按钮）同样视为内部交互。
    // 范围限 .search-history 而非整个表单：Tab 到清空按钮不应被拉回输入框（焦点陷阱）
    const toInside =
      e.relatedTarget instanceof Element && e.relatedTarget.closest(".search-history") !== null;
    if (historyInteractRef.current || toInside) {
      historyInteractRef.current = false;
      searchInputRef.current?.focus();
      return;
    }
    // 失焦关闭历史下拉（下拉内点击已被上方分支拦截，不会走到这）
    setHistoryOpen(false);
    // 失焦时若无搜索词则自动收起；有搜索词时保持展开（用户明确要求）
    if (isMobile && !filter.q.trim()) {
      setSearchOpen(false);
    }
  }

  // 点选历史词：写入搜索词并置顶该词，关闭下拉（焦点仍在输入框，可继续编辑）
  function onPickHistory(term: string) {
    setFilter({ q: term });
    pushSearchHistory(term);
    setHistoryOpen(false);
  }

  function openSearch() {
    setSearchOpen(true);
  }

  return (
    <header
      className={`header${isMobile && searchOpen ? " is-search-open" : ""}`}
      // 移动端抽屉展开时，点击 Header 任意位置收起侧边栏（遮罩不覆盖 Header 区域）；
      // 排除菜单按钮——其自身 onClick 已负责开合切换，避免同一次点击被两处处理
      onClick={(e) => {
        if (!isMobile || !mobileSidebarOpen) return;
        if (e.target instanceof Element && e.target.closest(".header__menu")) return;
        setMobileSidebar(false);
      }}
    >
      <button
        className="header__menu"
        onClick={onMenuClick}
        aria-label={menuLabel}
        aria-expanded={isMobile ? mobileSidebarOpen : !sidebarCollapsed}
      >
        <Menu size={18} />
      </button>
      <Logo />
      <form
        className="search"
        onSubmit={onSubmit}
        role="search"
        // capture 阶段先于 blur：点击落在历史下拉内时打标记，
        // 供 onSearchBlur 辨认内部交互；若拦截生效、blur 未发生，
        // 500ms 后自动复位残留标记（见 historyInteractRef 注释）
        onPointerDownCapture={(e) => {
          if (e.target instanceof Element && e.target.closest(".search-history")) {
            historyInteractRef.current = true;
            if (historyInteractTimer.current !== null) {
              clearTimeout(historyInteractTimer.current);
            }
            historyInteractTimer.current = window.setTimeout(() => {
              historyInteractRef.current = false;
              historyInteractTimer.current = null;
            }, 500);
          }
        }}
      >
        <Search size={16} strokeWidth={2} className="search__icon" />
        <input
          className="search__input"
          type="text"
          placeholder={t("header.searchPlaceholder")}
          value={filter.q}
          onChange={(e) => {
            setFilter({ q: e.target.value });
            // 选词后继续编辑时重开下拉（仿 YouTube：输入即展示候选）
            setHistoryOpen(true);
          }}
          onFocus={() => setHistoryOpen(true)}
          // 已聚焦状态下再点输入框不会产生新 focus 事件（选词收起后
          // 焦点从未离开），需 onClick 补一个重开入口
          onClick={() => setHistoryOpen(true)}
          onBlur={onSearchBlur}
          onKeyDown={(e) => {
            // ESC 只收历史下拉，不干扰模态栈（下拉非模态，不入栈）
            if (e.key === "Escape" && historyOpen) {
              e.stopPropagation();
              setHistoryOpen(false);
            }
          }}
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
        <SearchHistoryDropdown open={historyOpen} onPick={onPickHistory} />
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
