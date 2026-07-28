import { memo, useCallback, useMemo, useState } from "react";
import {
  History,
  Play,
  Tv2,
  Globe,
  Hash,
  ListChecks,
  Check,
  Undo2,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";
import { useStore } from "../store/useStore";
import type { HistoryEntry } from "../store/useStore";
import type { ChannelWithStream } from "../types";
import { clock, historyDayLabel } from "../lib/format";
import { toast } from "../lib/toast";
import { useI18n } from "../i18n";
import { Select } from "./Select";
import { EmptyState } from "./EmptyState";
import { ConfirmModal } from "./ConfirmModal";

/** Radix Select 中 value="" 等同未选；用哨兵值表示"全部"（与 FilterBar 一致） */
const ALL = "_all";

interface HistoryGroup {
  label: string;
  entries: HistoryEntry[];
}

interface HistoryItemProps {
  entry: HistoryEntry;
  ch: ChannelWithStream | undefined;
  managing: boolean;
  selected: boolean;
  /** 播放模式=播放该频道；管理模式=切换选中态 */
  onActivate: (id: string) => void;
}

/**
 * 单条历史条目：memo 化隔离重渲染——勾选某条时仅该条目
 * （selected 变化）重渲染，其余条目 props 全部引用相等直接跳过。
 */
const HistoryItem = memo(function HistoryItem({
  entry,
  ch,
  managing,
  selected,
  onActivate,
}: HistoryItemProps) {
  const { t } = useI18n();
  // 管理模式下已下线条目也可选中（用于删除）；播放模式下保持禁用
  const disabled = !managing && !ch;
  return (
    <button
      type="button"
      className={`history__item${ch ? "" : " is-gone"}${selected ? " is-selected" : ""}`}
      onClick={() => onActivate(entry.id)}
      disabled={disabled}
      title={
        managing
          ? undefined
          : ch
            ? t("history.replay", { name: ch.name })
            : t("history.gone")
      }
      aria-pressed={managing ? selected : undefined}
    >
      <span className="history__dot" aria-hidden />
      {managing && (
        <span className={`history__check${selected ? " is-on" : ""}`} aria-hidden>
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      )}
      <span className="history__time mono">{clock(new Date(entry.at))}</span>
      <span className="history__logo">
        {ch?.logo ? (
          <img
            src={ch.logo}
            alt=""
            loading="lazy"
            onError={(ev) => {
              (ev.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Tv2 size={14} />
        )}
      </span>
      <span className="history__name">{ch?.name ?? t("history.gone")}</span>
      {ch && <span className="history__country mono">{ch.country}</span>}
      {ch && !managing && (
        <span className="history__play" aria-hidden>
          <Play size={12} fill="currentColor" />
        </span>
      )}
    </button>
  );
});

/**
 * 播放历史面板：以垂直时间线展示每次播放记录（最新在前），
 * 按天分组（今天 / 昨天 / MM月DD日），点击条目可重新播放。
 * 头部复用 .filterbar 结构与收藏夹页对齐；分类/国家筛选为
 * 页面本地状态（不写入 store.filter，离开页面自动重置），
 * 筛选结果实时作用于时间线。
 * "管理"模式：条目变复选，支持全选/全不选与批量删除（二次确认）。
 */
export function HistoryPanel() {
  const { t } = useI18n();
  const history = useStore((s) => s.history);
  const channels = useStore((s) => s.channels);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const openChannel = useStore((s) => s.openChannel);
  const removeHistoryEntries = useStore((s) => s.removeHistoryEntries);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const hasFilter = categoryId !== null || countryCode !== null;

  // 管理模式：selected 存频道 id（history 按频道去重，id 即条目唯一键）
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 先按筛选条件过滤：通过频道属性匹配；已下线频道（channels 中不存在）
  // 无法判断属性，仅在无任何筛选时显示
  const filtered = useMemo(() => {
    if (!hasFilter) return history;
    return history.filter((e) => {
      const ch = channels.get(e.id);
      if (!ch) return false;
      if (categoryId && !ch.categories.includes(categoryId)) return false;
      if (countryCode && ch.country !== countryCode) return false;
      return true;
    });
  }, [history, channels, categoryId, countryCode, hasFilter]);

  // filtered 已按时间倒序，顺序扫描聚成连续的日期分组
  const groups = useMemo<HistoryGroup[]>(() => {
    const out: HistoryGroup[] = [];
    for (const e of filtered) {
      const label = historyDayLabel(e.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.entries.push(e);
      else out.push({ label, entries: [e] });
    }
    return out;
  }, [filtered]);

  // 全选状态相对当前筛选结果判断（筛选后全选只作用于可见条目）
  const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  // 条目点击：引用稳定（useCallback），保证 HistoryItem 的 memo 生效。
  // 管理模式判断走函数式 setState 外的最新闭包依赖，依赖变化频率极低
  const handleActivate = useCallback(
    (id: string) => {
      if (managing) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else if (channels.has(id)) {
        openChannel(id);
      }
    },
    [managing, channels, openChannel],
  );

  const exitManage = () => {
    setManaging(false);
    setSelected(new Set());
  };

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((e) => e.id)));
  };

  const deleteSelected = () => {
    const count = selected.size;
    removeHistoryEntries([...selected]);
    setConfirmOpen(false);
    setSelected(new Set());
    toast.info(t("toast.historyDeleted", { count }));
    // 删空后管理模式已无对象，自动退出
    if (count >= history.length) setManaging(false);
  };

  return (
    <div className="history">
      <div className="filterbar">
        <div className="filterbar__head">
          <div>
            <div className="eyebrow">
              <History size={11} /> {t("history.eyebrow")}
            </div>
            <h2 className="filterbar__title display">
              {t("history.title")}
              <span className="filterbar__count mono">
                {t("history.countRecords", { count: filtered.length })}
              </span>
            </h2>
          </div>

          <div className="filterbar__controls">
            <Select
              aria-label={t("filter.categoryAria")}
              icon={<Hash size={13} />}
              placeholder={t("filter.allCategories")}
              value={categoryId ?? ALL}
              onValueChange={(v) => {
                setCategoryId(v === ALL ? null : v);
                if (v === ALL) toast.info(t("toast.categoryCleared"));
                else {
                  const c = categories.find((x) => x.id === v);
                  if (c) toast.info(t("toast.categorySet", { name: c.name }));
                }
              }}
              options={[
                { value: ALL, label: t("filter.allCategories") },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />

            <Select
              aria-label={t("filter.countryAria")}
              icon={<Globe size={13} />}
              placeholder={t("filter.allCountries")}
              value={countryCode ?? ALL}
              onValueChange={(v) => {
                setCountryCode(v === ALL ? null : v);
                if (v === ALL) toast.info(t("toast.countryCleared"));
                else {
                  const c = countries.find((x) => x.code === v);
                  if (c) toast.info(t("toast.countrySet", { name: c.name }));
                }
              }}
              options={[
                { value: ALL, label: t("filter.allCountries") },
                ...countries.map((c) => ({
                  value: c.code,
                  label: <>{c.name}（{c.channelCount}）</>,
                  textValue: c.name,
                })),
              ]}
            />

            {history.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost btn--sm history__manage-btn"
                onClick={() => (managing ? exitManage() : setManaging(true))}
                aria-label={managing ? t("history.exitManage") : t("history.manage")}
                title={managing ? t("history.exitManage") : t("history.manage")}
              >
                {managing ? <Undo2 size={13} /> : <ListChecks size={13} />}
                <span className="history__manage-label">
                  {managing ? t("history.exitManage") : t("history.manage")}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 管理工具条：全选/全不选 + 选中计数 + 删除所选 */}
      {managing && (
        <div className="history__manage-bar">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={toggleSelectAll}
            disabled={filtered.length === 0}
          >
            {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
            {allSelected ? t("history.selectNone") : t("history.selectAll")}
          </button>
          <span className="history__manage-count mono">
            {t("history.selectedCount", { count: selected.size })}
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0}
          >
            <Trash2 size={13} /> {t("history.deleteSelected")}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<History size={28} />}
          title={history.length === 0 ? t("history.emptyTitle") : t("history.noMatchTitle")}
          desc={
            history.length === 0
              ? t("history.emptyDesc")
              : t("history.noMatchDesc")
          }
        />
      ) : (
        groups.map((g) => (
          <section className="history__group" key={g.label}>
            <div className="history__group-label mono">{g.label}</div>
            <div className="history__timeline">
              {g.entries.map((e) => (
                <HistoryItem
                  key={e.id}
                  entry={e}
                  ch={channels.get(e.id)}
                  managing={managing}
                  selected={selected.has(e.id)}
                  onActivate={handleActivate}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={deleteSelected}
        title={t("history.deleteConfirmTitle")}
        desc={t("history.deleteConfirmDesc", { count: selected.size })}
        icon={<Trash2 size={16} />}
        confirmLabel={t("history.deleteSelected")}
        danger
      />
    </div>
  );
}
