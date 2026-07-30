import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  History,
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
import { clockMinute, historyDayLabel } from "../lib/format";
import { toast } from "../lib/toast";
import { useI18n } from "../i18n";
import { useLayoutSwitchAnim } from "../hooks/useLayoutSwitchAnim";
import { Select } from "./Select";
import { EmptyState } from "./EmptyState";
import { ConfirmModal } from "./ConfirmModal";
import { ChannelCard } from "./ChannelCard";
import { ViewToggle } from "./ViewToggle";

/** Radix Select 中 value="" 等同未选；用哨兵值表示"全部"（与 FilterBar 一致） */
const ALL = "_all";

interface HistoryGroup {
  label: string;
  /** 天内按分钟合并的时间桶：同一 HH:mm 只挂一个小节点，不重复标注 */
  times: { time: string; entries: HistoryEntry[] }[];
}

interface HistoryCardProps {
  entry: HistoryEntry;
  ch: ChannelWithStream | undefined;
  /** 跨日期分组连续递增的卡片序号（入场动画错峰延迟用） */
  index: number;
  managing: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

/**
 * 单条历史卡片：在线频道直接复用首页 ChannelCard（样式完全一致）；
 * 已下线频道降级为占位卡。播放时间由父层时间轴小节点标签展示，
 * 卡片自身不再重复显示。
 * 管理模式叠加透明覆盖按钮拦截点击切换选中，不侵入 ChannelCard 内部。
 * memo 化隔离重渲染：勾选某条时仅该卡片（selected 变化）重渲染。
 */
const HistoryCard = memo(function HistoryCard({
  entry,
  ch,
  index,
  managing,
  selected,
  onToggleSelect,
}: HistoryCardProps) {
  const { t } = useI18n();
  return (
    <div
      className={`history-card${ch ? "" : " history-card--gone"}${selected ? " is-selected" : ""}`}
    >
      {ch ? (
        // 历史页非窗口化渲染，卡片一律保留 fade-up 入场
        <ChannelCard channel={ch} index={index} animate />
      ) : (
        // 降级占位卡：复用 .card 骨架与入场动画，无流可播 → 不可点击
        <article className="card" style={{ animationDelay: `${Math.min(index, 24) * 28}ms` }}>
          <div className="card__media card__media--empty">
            <div className="card__noise" />
            <div className="card__placeholder">
              <Tv2 size={22} />
              <span className="card__placeholder-country">{t("history.gone")}</span>
            </div>
          </div>
          <div className="card__body">
            <div className="card__top">
              <h3 className="card__name">{t("history.gone")}</h3>
            </div>
          </div>
        </article>
      )}
      {managing && (
        <button
          type="button"
          className="history-card__select"
          onClick={() => onToggleSelect(entry.id)}
          aria-pressed={selected}
          aria-label={ch ? ch.name : t("history.gone")}
        >
          <span className={`history-card__check${selected ? " is-on" : ""}`} aria-hidden>
            {selected && <Check size={12} strokeWidth={3} />}
          </span>
        </button>
      )}
    </div>
  );
});

/**
 * 播放历史面板：一条贯穿全部记录的竖向长时间轴——日期为大节点
 * （今天 / 昨天 / 完整年月日），每条记录为小节点（HH:mm 标签），
 * 卡片挂在小节点右侧逐条排列；卡片/列表切换仅改变卡片自身形态
 * （全局 gridLayout，grid--list 挂在时间轴容器上复用列表态卡片样式）。
 * 头部复用 .filterbar 结构与收藏夹页对齐；分类/国家筛选为
 * 页面本地状态（不写入 store.filter，离开页面自动重置）。
 * "管理"模式：卡片叠加勾选覆盖层，支持全选/全不选与批量删除（二次确认）。
 */
export function HistoryPanel() {
  const { t } = useI18n();
  const history = useStore((s) => s.history);
  const channels = useStore((s) => s.channels);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const removeHistoryEntries = useStore((s) => s.removeHistoryEntries);
  const gridLayout = useStore((s) => s.gridLayouts.history);
  // 卡片/列表切换的缩放过渡：与 ChannelGrid 同一套两阶段动画
  const { shownLayout, animClass } = useLayoutSwitchAnim(gridLayout);
  const probeLatencyForIds = useStore((s) => s.probeLatencyForIds);
  const activeChannelId = useStore((s) => s.activeChannelId);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const hasFilter = categoryId !== null || countryCode !== null;

  // 下拉只列历史频道实际出现的分类/国家（历史为空或全部已下线时
  // 回退完整列表）；基于历史全集而非 filtered 计算，
  // 避免选中某项后候选项塌缩成单项无法切换
  const { categoryOptions, countryOptions } = useMemo(() => {
    const catIds = new Set<string>();
    const codes = new Set<string>();
    for (const e of history) {
      const ch = channels.get(e.id);
      if (!ch) continue;
      for (const cat of ch.categories) catIds.add(cat);
      codes.add(ch.country);
    }
    return {
      categoryOptions:
        catIds.size > 0 ? categories.filter((c) => catIds.has(c.id)) : categories,
      countryOptions:
        codes.size > 0 ? countries.filter((c) => codes.has(c.code)) : countries,
    };
  }, [history, channels, categories, countries]);

  // 管理模式：selected 存频道 id（history 按频道去重，id 即条目唯一键）
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 稳定引用：ConfirmModal 的模态栈/焦点 effect 依赖 onClose，内联箭头会在
  // 父组件重渲染时触发 effect 重跑（弹栈重推 + 焦点跳回），与 Sidebar 同惯例
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);

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

  // filtered 已按时间倒序，顺序扫描聚成两级分组：天（大节点）→ 分钟（小节点）；
  // 同分钟记录在倒序序列中必相邻，连续相同 HH:mm 合并进同一时间桶
  const groups = useMemo<HistoryGroup[]>(() => {
    const out: HistoryGroup[] = [];
    for (const e of filtered) {
      const label = historyDayLabel(e.at);
      const time = clockMinute(e.at);
      let g = out[out.length - 1];
      if (!g || g.label !== label) {
        g = { label, times: [] };
        out.push(g);
      }
      const bucket = g.times[g.times.length - 1];
      if (bucket && bucket.time === time) bucket.entries.push(e);
      else g.times.push({ time, entries: [e] });
    }
    return out;
  }, [filtered]);

  // 全选状态相对当前筛选结果判断（筛选后全选只作用于可见条目）
  const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  // 筛选变化时收敛选中集：只保留仍可见的条目，防止"删除所选"
  // 误删已被筛选滤出视野的记录（计数与可见项也会不一致）
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((e) => e.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  // 入场动画错峰延迟需跨分组/时间桶连续递增：按 filtered 顺序生成 id → 序号
  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((e, i) => m.set(e.id, i));
    return m;
  }, [filtered]);

  // 与 ChannelGrid 同策略的延迟探测：筛选结果变化后 debounce 150ms
  // 探测在线频道，让卡片延迟标签与首页表现一致；播放器打开期间暂停
  // （不与视频流抢带宽），历史上限 200 条不会引发全量探测量级问题
  useEffect(() => {
    if (activeChannelId) return;
    const ids = filtered.filter((e) => channels.has(e.id)).map((e) => e.id);
    if (ids.length === 0) return;
    const timer = setTimeout(() => {
      void probeLatencyForIds(ids);
    }, 150);
    return () => clearTimeout(timer);
  }, [filtered, channels, probeLatencyForIds, activeChannelId]);

  // 勾选切换：引用稳定（useCallback 无依赖），保证 HistoryCard 的 memo 生效；
  // 播放点击由 ChannelCard 自身的 openChannel 处理，这里只管管理模式选中态
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
            {/* 卡片/列表视图切换：历史页独立偏好（默认列表） */}
            <ViewToggle scope="history" />

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
                ...categoryOptions.map((c) => ({ value: c.id, label: c.name })),
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
                ...countryOptions.map((c) => ({
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
        <div
          className={`history__timeline ${shownLayout === "list" ? "grid--list" : ""} ${animClass}`}
        >
          {groups.map((g) => (
            <section className="history__tl-group" key={g.label}>
              {/* 日期大节点：大圆点由 ::before 绘制，对齐贯穿竖线 */}
              <div className="history__tl-day mono">{g.label}</div>
              {g.times.map((tb) => (
                <div className="history__tl-item" key={`${g.label}-${tb.time}`}>
                  {/* 时间小分类：同一分钟只标注一次，小圆点由 ::before 绘制 */}
                  <span className="history__tl-time mono">{tb.time}</span>
                  <div className="history__tl-cards">
                    {tb.entries.map((e) => (
                      <HistoryCard
                        key={e.id}
                        entry={e}
                        ch={channels.get(e.id)}
                        index={indexById.get(e.id) ?? 0}
                        managing={managing}
                        selected={selected.has(e.id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={closeConfirm}
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
