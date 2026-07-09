import { SlidersHorizontal, ArrowDownUp, Globe, Hash, ShieldAlert } from "lucide-react";
import { useStore } from "../store/useStore";
import { useFilteredChannels } from "../hooks/useChannels";
import type { SortKey } from "../store/useStore";

export function FilterBar() {
  const list = useFilteredChannels();
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const view = useStore((s) => s.view);

  const title = (() => {
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
          <label className="select">
            <Hash size={13} className="select__icon" />
            <select
              value={filter.categoryId ?? ""}
              onChange={(e) => setFilter({ categoryId: e.target.value || null })}
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="select">
            <Globe size={13} className="select__icon" />
            <select
              value={filter.countryCode ?? ""}
              onChange={(e) => setFilter({ countryCode: e.target.value || null })}
            >
              <option value="">全部国家</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}（{c.channelCount}）
                </option>
              ))}
            </select>
          </label>

          <label className="select">
            <ArrowDownUp size={13} className="select__icon" />
            <select
              value={filter.sort}
              onChange={(e) => setFilter({ sort: e.target.value as SortKey })}
            >
              <option value="default">排序：默认</option>
              <option value="name">排序：A → Z</option>
              <option value="country">排序：国家</option>
              <option value="recent">排序：最近观看</option>
            </select>
          </label>

          <button
            className={`toggle ${filter.nsfw ? "is-on" : ""}`}
            onClick={() => setFilter({ nsfw: !filter.nsfw })}
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
