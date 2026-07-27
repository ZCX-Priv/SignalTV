import { useMemo, useState } from "react";
import { History, Play, Trash2, Tv2, Globe, Hash } from "lucide-react";
import { useStore } from "../store/useStore";
import type { HistoryEntry } from "../store/useStore";
import { clock, historyDayLabel } from "../lib/format";
import { toast } from "../lib/toast";
import { useI18n } from "../i18n";
import { Select } from "./Select";
import { EmptyState } from "./EmptyState";

/** Radix Select 中 value="" 等同未选；用哨兵值表示"全部"（与 FilterBar 一致） */
const ALL = "_all";

interface HistoryGroup {
  label: string;
  entries: HistoryEntry[];
}

/**
 * 播放历史面板：以垂直时间线展示每次播放记录（最新在前），
 * 按天分组（今天 / 昨天 / MM月DD日），点击条目可重新播放。
 * 头部复用 .filterbar 结构与收藏夹页对齐；分类/国家筛选为
 * 页面本地状态（不写入 store.filter，离开页面自动重置），
 * 筛选结果实时作用于时间线。
 */
export function HistoryPanel() {
  const { t } = useI18n();
  const history = useStore((s) => s.history);
  const channels = useStore((s) => s.channels);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const openChannel = useStore((s) => s.openChannel);
  const clearHistory = useStore((s) => s.clearHistory);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const hasFilter = categoryId !== null || countryCode !== null;

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
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  clearHistory();
                  toast.info(t("toast.historyCleared"));
                }}
              >
                <Trash2 size={13} /> {t("history.clear")}
              </button>
            )}
          </div>
        </div>
      </div>

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
              {g.entries.map((e, i) => {
                const ch = channels.get(e.id);
                return (
                  <button
                    key={`${e.at}-${e.id}-${i}`}
                    type="button"
                    className={`history__item${ch ? "" : " is-gone"}`}
                    onClick={() => {
                      if (ch) openChannel(e.id);
                    }}
                    disabled={!ch}
                    title={ch ? t("history.replay", { name: ch.name }) : t("history.gone")}
                  >
                    <span className="history__dot" aria-hidden />
                    <span className="history__time mono">
                      {clock(new Date(e.at))}
                    </span>
                    <span className="history__logo">
                      {ch?.logo ? (
                        <img
                          src={ch.logo}
                          alt=""
                          loading="lazy"
                          onError={(ev) => {
                            (ev.currentTarget as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <Tv2 size={14} />
                      )}
                    </span>
                    <span className="history__name">
                      {ch?.name ?? t("history.gone")}
                    </span>
                    {ch && (
                      <span className="history__country mono">{ch.country}</span>
                    )}
                    {ch && (
                      <span className="history__play" aria-hidden>
                        <Play size={12} fill="currentColor" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
