import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { pushModal, trapFocus } from "../lib/modalStack";
import { fmt } from "../lib/format";
import { useI18n } from "../i18n";

export interface PickerItem {
  key: string;
  name: string;
  count: number;
  /** 项目前缀（分类图标 / 国旗 emoji 等），文本型请套 .picker__leading */
  leading?: ReactNode;
}

interface PickerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon: ReactNode;
  searchPlaceholder: string;
  searchAriaLabel: string;
  emptyText: string;
  /** 无搜索词时"全部"分组的标签（通常与 title 相同） */
  sectionLabel: string;
  /** 已按期望顺序排好的全量候选 */
  items: PickerItem[];
  /** 最近使用的 key 列表（最新在前），仅无搜索词时展示前 6 项 */
  recentKeys: string[];
  activeKey: string | null;
  onPick: (item: PickerItem) => void;
  /** 自定义搜索匹配；默认按 name 子串（needle 已 lowercase） */
  match?: (item: PickerItem, needle: string) => boolean;
}

const defaultMatch = (item: PickerItem, needle: string) =>
  item.name.toLowerCase().includes(needle);

/**
 * 通用选择弹窗（分类/国家共用）：统一承载模态栈接入、焦点圈定、
 * 搜索过滤、"最近点击"分组与空态，样式走 .picker__* 一套类。
 */
export function PickerModal({
  open,
  onClose,
  title,
  titleIcon,
  searchPlaceholder,
  searchAriaLabel,
  emptyText,
  sectionLabel,
  items,
  recentKeys,
  activeKey,
  onPick,
  match = defaultMatch,
}: PickerModalProps) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 打开时重置关键字、聚焦输入框；模态栈统一处理 ESC（只关栈顶）与 body 滚动锁
  useEffect(() => {
    if (!open) return;
    setQ("");
    const release = pushModal(onClose);
    const prevFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    // 下一帧聚焦，确保 input 已挂载
    // 仅在非触摸设备上自动聚焦，避免移动端强制弹出虚拟键盘导致 panel 溢出可见区域
    const id = requestAnimationFrame(() => {
      if (!window.matchMedia("(pointer: coarse)").matches) {
        inputRef.current?.focus();
      }
    });
    return () => {
      cancelAnimationFrame(id);
      release();
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  // 搜索结果（q 非空时按 match 过滤）
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => match(item, needle));
  }, [items, q, match]);

  // 最近使用分组（仅 q 为空时展示，最多 6 项，且必须存在于候选集）
  const recentSection = useMemo(() => {
    if (q.trim()) return [];
    const byKey = new Map(items.map((item) => [item.key, item]));
    return recentKeys
      .map((k) => byKey.get(k))
      .filter((item): item is PickerItem => !!item)
      .slice(0, 6);
  }, [recentKeys, items, q]);

  // 全部分组（去掉最近使用已展示的，避免重复）
  const allSection = useMemo(() => {
    if (q.trim()) return filtered;
    const recentIds = new Set(recentSection.map((item) => item.key));
    return filtered.filter((item) => !recentIds.has(item.key));
  }, [filtered, recentSection, q]);

  if (!open) return null;

  function renderItem(item: PickerItem) {
    const active = activeKey === item.key;
    return (
      <button
        key={item.key}
        type="button"
        className={`picker__item ${active ? "is-active" : ""}`}
        onClick={() => onPick(item)}
      >
        {item.leading}
        <span className="picker__name">{item.name}</span>
        <span className="picker__count mono">
          {fmt(item.count)}
        </span>
      </button>
    );
  }

  return (
    <div className="picker" role="dialog" aria-modal="true" aria-label={title}>
      <div className="picker__backdrop" />
      <div
        className="picker__panel"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (panelRef.current) trapFocus(e.nativeEvent, panelRef.current);
        }}
      >
        <header className="picker__header">
          <div className="picker__title">
            {titleIcon}
            <span>{title}</span>
            <span className="picker__total mono">{items.length}</span>
          </div>
          <button
            type="button"
            className="picker__close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </header>

        <div className="picker__search">
          <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
            <Search size={15} strokeWidth={2} className="search__icon" />
            <input
              ref={inputRef}
              className="search__input"
              type="text"
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={searchAriaLabel}
            />
            {q && (
              <button
                type="button"
                className="search__clear"
                onClick={() => setQ("")}
                aria-label={t("common.clear")}
              >
                <X size={13} />
              </button>
            )}
          </form>
        </div>

        <div className="picker__list">
          {filtered.length === 0 ? (
            <div className="picker__empty">{emptyText}</div>
          ) : (
            <>
              {recentSection.length > 0 && (
                <section>
                  <div className="picker__section-label">{t("picker.recent")}</div>
                  {recentSection.map(renderItem)}
                </section>
              )}
              <section>
                {!q.trim() && (
                  <div className="picker__section-label">{sectionLabel}</div>
                )}
                {allSection.map(renderItem)}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
