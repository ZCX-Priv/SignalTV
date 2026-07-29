import { useEffect, useMemo } from "react";
import { SlidersHorizontal, ArrowDownUp, Globe, Hash, ShieldAlert } from "lucide-react";
import { useStore } from "../store/useStore";
import { toast } from "../lib/toast";
import type { SortKey } from "../store/useStore";
import type { ChannelWithStream } from "../types";
import { useI18n } from "../i18n";
import { Select } from "./Select";
import { ViewToggle } from "./ViewToggle";

/** Radix Select 中 value="" 等同未选；用哨兵值表示"全部" */
const ALL = "_all";

interface FilterBarProps {
  /** 由父组件（ChannelsView）统一计算的过滤结果，避免与 ChannelGrid 重复过滤 */
  list: ChannelWithStream[];
}

export function FilterBar({ list }: FilterBarProps) {
  const { t } = useI18n();
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const view = useStore((s) => s.view);
  const favorites = useStore((s) => s.favorites);
  const channels = useStore((s) => s.channels);

  // 收藏夹视图不提供成人内容开关与"成人内容优先"排序：
  // 收藏是用户自己选的，列表也不受 nsfw 过滤影响（见 useFilteredChannels）
  const isFavorites = view.kind === "favorites";
  // 分类/国家页自身已限定范围，不再渲染同维度的冗余下拉
  //（setView 切页时已重置 categoryId/countryCode，无残留筛选）
  const isCategoryView = view.kind === "category";
  const isCountryView = view.kind === "country";

  // 收藏夹视图：下拉只列收藏频道实际出现的分类/国家（收藏为空时
  // 回退完整列表）；基于收藏全集而非过滤后的 list prop 计算，
  // 避免选中某项后候选项塌缩成单项无法切换
  const { categoryOptions, countryOptions } = useMemo(() => {
    if (!isFavorites) {
      return { categoryOptions: categories, countryOptions: countries };
    }
    const catIds = new Set<string>();
    const codes = new Set<string>();
    for (const id of favorites) {
      const c = channels.get(id);
      if (!c) continue;
      for (const cat of c.categories) catIds.add(cat);
      codes.add(c.country);
    }
    return {
      categoryOptions:
        catIds.size > 0 ? categories.filter((c) => catIds.has(c.id)) : categories,
      countryOptions:
        codes.size > 0 ? countries.filter((c) => codes.has(c.code)) : countries,
    };
  }, [isFavorites, favorites, channels, categories, countries]);

  // 当 nsfw 关闭或处于收藏夹视图时，sort=nsfw-first 无意义，自动回退到 default
  useEffect(() => {
    if ((!filter.nsfw || isFavorites) && filter.sort === "nsfw-first") {
      setFilter({ sort: "default" });
    }
  }, [filter.nsfw, filter.sort, isFavorites, setFilter]);

  const sortOptions = useMemo(
    () => [
      { value: "default", label: t("sort.default") },
      { value: "recent", label: t("sort.recent") },
      { value: "latency-asc", label: t("sort.latencyAsc") },
      { value: "latency-desc", label: t("sort.latencyDesc") },
      ...(filter.nsfw && !isFavorites
        ? [{ value: "nsfw-first", label: t("sort.nsfwFirst") }]
        : []),
    ],
    [filter.nsfw, isFavorites, t],
  );

  const title = (() => {
    // 输入即搜索：有搜索词时动态显示搜索结果标题（与受控输入框内容一致）
    if (filter.q.trim()) return t("filter.searchResults", { q: filter.q.trim() });
    switch (view.kind) {
      case "home": return t("filter.allChannels");
      case "category": {
        const c = categories.find((x) => x.id === view.id);
        return c ? c.name : t("filter.categoryFallback");
      }
      case "country": {
        const c = countries.find((x) => x.code === view.code);
        return c ? c.name : t("filter.countryFallback");
      }
      case "favorites": return t("filter.favorites");
      default: return t("common.channel");
    }
  })();

  return (
    <div className="filterbar">
      <div className="filterbar__head">
        <div>
          <div className="eyebrow">
            <SlidersHorizontal size={11} /> {t("filter.eyebrow")}
          </div>
          <h2 className="filterbar__title display">
            {title}
            <span className="filterbar__count mono">
              {t(isFavorites ? "filter.countFavorites" : "filter.countSignals", { count: list.length })}
            </span>
          </h2>
        </div>

        <div className="filterbar__controls">
          {/* 卡片/列表视图切换：收藏页独立偏好，其余浏览页共享一份 */}
          <ViewToggle scope={isFavorites ? "favorites" : "browse"} />

          {!isCategoryView && (
            <Select
              aria-label={t("filter.categoryAria")}
              icon={<Hash size={13} />}
              placeholder={t("filter.allCategories")}
              value={filter.categoryId ?? ALL}
              onValueChange={(v) => {
                setFilter({ categoryId: v === ALL ? null : v });
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
          )}

          {!isCountryView && (
            <Select
              aria-label={t("filter.countryAria")}
              icon={<Globe size={13} />}
              placeholder={t("filter.allCountries")}
              value={filter.countryCode ?? ALL}
              onValueChange={(v) => {
                setFilter({ countryCode: v === ALL ? null : v });
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
          )}

          <Select
            aria-label={t("filter.sortAria")}
            icon={<ArrowDownUp size={13} />}
            value={filter.sort}
            onValueChange={(v) => {
              setFilter({ sort: v as SortKey });
              const opt = sortOptions.find((o) => o.value === v);
              if (opt) toast.info(t("toast.sortSet", { name: opt.label }));
            }}
            options={sortOptions}
          />

          {!isFavorites && (
            <button
              className={`toggle ${filter.nsfw ? "is-on" : ""}`}
              onClick={() => {
                const next = !filter.nsfw;
                setFilter({ nsfw: next });
                if (next) toast.warning(t("toast.nsfwOn"));
                else toast.info(t("toast.nsfwOff"));
              }}
              title={t("filter.nsfwTitle")}
            >
              <ShieldAlert size={13} />
              <span>{filter.nsfw ? t("filter.nsfwShown") : t("filter.nsfwHidden")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
