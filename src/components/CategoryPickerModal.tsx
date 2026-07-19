import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Search, X } from "lucide-react";
import { useStore } from "../store/useStore";
import { fmt } from "../lib/format";
import { catIcon } from "../lib/categoryIcon";

interface CategoryPickerModalProps {
  open: boolean;
  onClose: () => void;
}

interface CatWithCount {
  id: string;
  name: string;
  count: number;
}

export function CategoryPickerModal({ open, onClose }: CategoryPickerModalProps) {
  const categories = useStore((s) => s.categories);
  const channels = useStore((s) => s.channels);
  const recentCategories = useStore((s) => s.recentCategories);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时重置关键字、聚焦输入框、锁 body 滚动、ESC 关闭
  useEffect(() => {
    if (!open) return;
    setQ("");
    // 下一帧聚焦，确保 input 已挂载
    // 仅在非触摸设备上自动聚焦，避免移动端强制弹出虚拟键盘导致 panel 溢出可见区域
    const id = requestAnimationFrame(() => {
      if (!window.matchMedia("(pointer: coarse)").matches) {
        inputRef.current?.focus();
      }
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // 每分类非 NSFW 频道数（与侧边栏 topCats 同口径）
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of channels.values()) {
      if (c.is_nsfw) continue;
      for (const cat of c.categories) m.set(cat, (m.get(cat) ?? 0) + 1);
    }
    return m;
  }, [channels]);

  // 候选集：count > 0 的分类，按频道数降序
  const ranked = useMemo<CatWithCount[]>(() => {
    return categories
      .map((c) => ({ ...c, count: catCounts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [categories, catCounts]);

  // 搜索结果（q 非空时按名称子串过滤）
  const filtered = useMemo<CatWithCount[]>(() => {
    if (!q.trim()) return ranked;
    const needle = q.trim().toLowerCase();
    return ranked.filter((c) => c.name.toLowerCase().includes(needle));
  }, [ranked, q]);

  // 最近使用分组（仅 q 为空时展示，最多 6 项，且必须存在于候选集）
  const recentSection = useMemo<CatWithCount[]>(() => {
    if (q.trim()) return [];
    const rankedById = new Map(ranked.map((c) => [c.id, c]));
    return recentCategories
      .map((id) => rankedById.get(id))
      .filter((c): c is CatWithCount => !!c)
      .slice(0, 6);
  }, [recentCategories, ranked, q]);

  // 全部分类分组（去掉最近使用已展示的，避免重复）
  const allSection = useMemo<CatWithCount[]>(() => {
    if (q.trim()) return filtered;
    const recentIds = new Set(recentSection.map((c) => c.id));
    return filtered.filter((c) => !recentIds.has(c.id));
  }, [filtered, recentSection, q]);

  if (!open) return null;

  const activeCatId = view.kind === "category" ? view.id : null;

  function handlePick(id: string) {
    setView({ kind: "category", id });
    onClose();
  }

  function renderItem(c: CatWithCount) {
    const Icon = catIcon(c.id);
    const active = activeCatId === c.id;
    return (
      <button
        key={c.id}
        type="button"
        className={`category-picker__item ${active ? "is-active" : ""}`}
        onClick={() => handlePick(c.id)}
      >
        <Icon size={14} />
        <span>{c.name}</span>
        <span className="category-picker__count mono">{fmt(c.count)}</span>
      </button>
    );
  }

  const isEmpty = filtered.length === 0;

  return (
    <div className="category-picker" role="dialog" aria-modal="true" aria-label="全部分类">
      <div className="category-picker__backdrop" />
      <div className="category-picker__panel">
        <header className="category-picker__header">
          <div className="category-picker__title">
            <LayoutGrid size={14} />
            <span>全部分类</span>
            <span className="category-picker__total mono">{ranked.length}</span>
          </div>
          <button
            type="button"
            className="category-picker__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </header>

        <div className="category-picker__search">
          <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
            <Search size={15} strokeWidth={2} className="search__icon" />
            <input
              ref={inputRef}
              className="search__input"
              type="text"
              placeholder="搜索分类…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="搜索分类"
            />
            {q && (
              <button
                type="button"
                className="search__clear"
                onClick={() => setQ("")}
                aria-label="清除"
              >
                <X size={13} />
              </button>
            )}
          </form>
        </div>

        <div className="category-picker__list">
          {isEmpty ? (
            <div className="category-picker__empty">未找到匹配的分类</div>
          ) : (
            <>
              {recentSection.length > 0 && (
                <section>
                  <div className="category-picker__section-label">最近点击</div>
                  {recentSection.map(renderItem)}
                </section>
              )}
              <section>
                {!q.trim() && <div className="category-picker__section-label">全部分类</div>}
                {allSection.map(renderItem)}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
