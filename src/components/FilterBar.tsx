import { useEffect, useMemo } from "react";
import { SlidersHorizontal, ArrowDownUp, Globe, Hash, ShieldAlert } from "lucide-react";
import { useStore } from "../store/useStore";
import { useFilteredChannels } from "../hooks/useChannels";
import { toast } from "../lib/toast";
import type { SortKey } from "../store/useStore";
import { Select } from "./Select";

/** Radix Select 中 value="" 等同未选；用哨兵值表示"全部" */
const ALL = "_all";

export function FilterBar() {
  const list = useFilteredChannels();
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const view = useStore((s) => s.view);

  // 当 nsfw 关闭时，sort=nsfw-first 无意义（所有 nsfw 频道已被过滤），自动回退到 default
  useEffect(() => {
    if (!filter.nsfw && filter.sort === "nsfw-first") {
      setFilter({ sort: "default" });
    }
  }, [filter.nsfw, filter.sort, setFilter]);

  const sortOptions = useMemo(
    () => [
      { value: "default", label: "默认" },
      { value: "country", label: "国家" },
      { value: "recent", label: "最近观看" },
      { value: "latency-asc", label: "延迟：低 → 高" },
      { value: "latency-desc", label: "延迟：高 → 低" },
      ...(filter.nsfw
        ? [{ value: "nsfw-first", label: "成人内容优先" }]
        : []),
    ],
    [filter.nsfw],
  );

  const title = (() => {
    // 输入即搜索：有搜索词时动态显示 "xxxx 的搜索结果"（与受控输入框内容一致）
    if (filter.q.trim()) return `“${filter.q.trim()}” 的搜索结果`;
    switch (view.kind) {
      case "home": return "全部频道";
      case "category": {
        const c = categories.find((x) => x.id === view.id);
        return c ? c.name : "分类";
      }
      case "country": {
        const c = countries.find((x) => x.code === view.code);
        return c ? c.name : "国家";
      }
      case "favorites": return "收藏夹";
      case "search": return `“${view.q}” 的搜索结果`;
    }
  })();

  return (
    <div className="filterbar">
      <div className="filterbar__head">
        <div>
          <div className="eyebrow">
            <SlidersHorizontal size={11} /> 节目指南
          </div>
          <h2 className="filterbar__title display">
            {title}
            <span className="filterbar__count mono">
              {list.length.toLocaleString("en-US")} 路信号
            </span>
          </h2>
        </div>

        <div className="filterbar__controls">
          <Select
            aria-label="分类筛选"
            icon={<Hash size={13} />}
            placeholder="全部分类"
            value={filter.categoryId ?? ALL}
            onValueChange={(v) => {
              setFilter({ categoryId: v === ALL ? null : v });
              if (v === ALL) toast.info("已清除分类筛选");
              else {
                const c = categories.find((x) => x.id === v);
                if (c) toast.info(`分类：${c.name}`);
              }
            }}
            options={[
              { value: ALL, label: "全部分类" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />

          <Select
            aria-label="国家筛选"
            icon={<Globe size={13} />}
            placeholder="全部国家"
            value={filter.countryCode ?? ALL}
            onValueChange={(v) => {
              setFilter({ countryCode: v === ALL ? null : v });
              if (v === ALL) toast.info("已清除国家筛选");
              else {
                const c = countries.find((x) => x.code === v);
                if (c) toast.info(`国家：${c.name}`);
              }
            }}
            options={[
              { value: ALL, label: "全部国家" },
              ...countries.map((c) => ({
                value: c.code,
                label: <>{c.name}（{c.channelCount}）</>,
                textValue: c.name,
              })),
            ]}
          />

          <Select
            aria-label="排序方式"
            icon={<ArrowDownUp size={13} />}
            value={filter.sort}
            onValueChange={(v) => {
              setFilter({ sort: v as SortKey });
              const opt = sortOptions.find((o) => o.value === v);
              if (opt) toast.info(`排序：${opt.label}`);
            }}
            options={sortOptions}
          />

          <button
            className={`toggle ${filter.nsfw ? "is-on" : ""}`}
            onClick={() => {
              const next = !filter.nsfw;
              setFilter({ nsfw: next });
              if (next) toast.warning("已开启成人内容显示");
              else toast.info("已隐藏成人内容");
            }}
            title="包含成人内容"
          >
            <ShieldAlert size={13} />
            <span>{filter.nsfw ? "已显示成人内容" : "已隐藏成人内容"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
