import { useEffect, useMemo, useState } from "react";
import { Check, History, ListChecks, Trash2, CheckSquare, Square, X } from "lucide-react";
import { useStore } from "../store/useStore";
import { useI18n } from "../i18n";

interface SearchHistoryDropdownProps {
  /** 由 Header 按输入框聚焦态控制；翻 false 后本组件播完出场动画再卸载 */
  open: boolean;
  /** 点选历史词回调（Header 负责写入 filter.q 并保持焦点） */
  onPick: (term: string) => void;
}

// 出场动画时长兜底：与 App.css .search-history.is-closing 的 0.14s 同步（+余量）
const CLOSE_FALLBACK_MS = 220;
// 下拉最多展示条数（仿 YouTube 搜索框，避免长列表遮挡内容区）
const MAX_SHOWN = 8;

/**
 * 搜索框下拉历史（仿 YouTube）：聚焦时展示历史词（按当前输入前缀过滤），
 * 点击词条即执行搜索；右上「管理」进入多选模式——行首变勾选框，
 * 工具行切换为「全选/全不选 + 删除所选 + 完成」。
 * 内部所有元素 onMouseDown preventDefault：避免夺走输入框焦点触发
 * blur（移动端 blur 会收起整个搜索框）。关闭时自动退出管理模式。
 */
export function SearchHistoryDropdown({ open, onPick }: SearchHistoryDropdownProps) {
  const { t } = useI18n();
  const searchHistory = useStore((s) => s.searchHistory);
  const removeSearchHistory = useStore((s) => s.removeSearchHistory);
  const q = useStore((s) => s.filter.q);

  // 出场动画：open 翻 false 后保留渲染并加 is-closing，动画结束才真正卸载
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);

  // 管理模式（多选删除）；selected 存词条原文（词条即唯一键）
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      // 关闭即退出管理模式，下次打开回到浏览态
      setManaging(false);
      setSelected(new Set());
    }
  }, [open, visible]);

  // 关闭动画兜底：animationend 丢失（标签页后台等）时强制卸载
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, CLOSE_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [closing]);

  // 按当前输入过滤（大小写不敏感子串，与搜索行为一致）；输入为空展示全部
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? searchHistory.filter((h) => h.toLowerCase().includes(needle))
      : searchHistory;
    return base.slice(0, MAX_SHOWN);
  }, [searchHistory, q]);

  // 词条被删/被过滤后收敛选中集，防止「删除所选」误删不可见词条
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const vis = new Set(items);
      let changed = false;
      const next = new Set<string>();
      for (const term of prev) {
        if (vis.has(term)) next.add(term);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  if (!visible || items.length === 0) return null;

  const allSelected = items.length > 0 && items.every((h) => selected.has(h));

  const toggleSelect = (term: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  };

  const deleteSelected = () => {
    removeSearchHistory([...selected]);
    setSelected(new Set());
    // 删空后管理模式已无对象，自动退出（组件因 items 为空自然隐藏）
    if (selected.size >= items.length) setManaging(false);
  };

  return (
    <div
      className={`search-history${closing ? " is-closing" : ""}`}
      role="listbox"
      aria-label={t("searchHistory.aria")}
      // 拦截焦点转移：点击下拉内任何位置都不夺走输入框焦点（blur 会关下拉/收起移动端搜索框）
      onMouseDown={(e) => e.preventDefault()}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) {
          setVisible(false);
          setClosing(false);
        }
      }}
    >
      <div className="search-history__bar">
        <span className="search-history__label mono">{t("searchHistory.title")}</span>
        {managing ? (
          <div className="search-history__tools">
            <button
              type="button"
              className="search-history__tool"
              onClick={() => setSelected(allSelected ? new Set() : new Set(items))}
            >
              {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
              {allSelected ? t("searchHistory.selectNone") : t("searchHistory.selectAll")}
            </button>
            <button
              type="button"
              className="search-history__tool search-history__tool--danger"
              onClick={deleteSelected}
              disabled={selected.size === 0}
            >
              <Trash2 size={12} /> {t("searchHistory.delete")}
              {selected.size > 0 && <span className="mono">({selected.size})</span>}
            </button>
            <button
              type="button"
              className="search-history__tool"
              onClick={() => {
                setManaging(false);
                setSelected(new Set());
              }}
            >
              <X size={12} /> {t("searchHistory.done")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="search-history__tool"
            onClick={() => setManaging(true)}
          >
            <ListChecks size={12} /> {t("searchHistory.manage")}
          </button>
        )}
      </div>

      <ul className="search-history__list">
        {items.map((term) => (
          <li key={term}>
            <button
              type="button"
              className={`search-history__item${managing && selected.has(term) ? " is-selected" : ""}`}
              role="option"
              aria-selected={managing ? selected.has(term) : undefined}
              onClick={() => (managing ? toggleSelect(term) : onPick(term))}
            >
              {managing ? (
                <span
                  className={`search-history__check${selected.has(term) ? " is-on" : ""}`}
                  aria-hidden
                >
                  {selected.has(term) && <Check size={11} strokeWidth={3} />}
                </span>
              ) : (
                <History size={14} className="search-history__icon" aria-hidden />
              )}
              <span className="search-history__term">{term}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
