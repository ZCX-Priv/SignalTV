import { useMemo } from "react";
import { useStore } from "../store/useStore";
import type { ChannelWithStream } from "../types";

/** 全部频道数组（按名称排序）。 */
export function useAllChannels(): ChannelWithStream[] {
  const channels = useStore((s) => s.channels);
  return useMemo(() => {
    const arr = Array.from(channels.values());
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [channels]);
}

// 非 latency 排序时返回的稳定空 Map，避免每 200ms flush 触发 useMemo 重算
const EMPTY_LATENCY_MAP = new Map<string, number>();

/** 经当前视图与筛选条件过滤后的频道。 */
export function useFilteredChannels(): ChannelWithStream[] {
  const all = useAllChannels();
  const view = useStore((s) => s.view);
  const filter = useStore((s) => s.filter);
  const favorites = useStore((s) => s.favorites);
  const recents = useStore((s) => s.recents);

  // 条件订阅：仅 latency 排序时才订阅整个 Map，避免 200ms flush 引发 O(n²) 重渲染
  const needLatency =
    filter.sort === "latency-asc" || filter.sort === "latency-desc";
  const latency = useStore((s) =>
    needLatency ? s.latency : EMPTY_LATENCY_MAP,
  );

  // sort=recent 优化：用 Map 索引替代 indexOf O(n) 查找
  const recentsIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < recents.length; i++) m.set(recents[i], i);
    return m;
  }, [recents]);

  return useMemo(() => {
    let list = all;

    // 视图范围
    switch (view.kind) {
      case "category":
        list = list.filter((c) => c.categories.includes(view.id));
        break;
      case "country":
        list = list.filter((c) => c.country === view.code);
        break;
      case "favorites":
        list = list.filter((c) => favorites.includes(c.id));
        break;
      case "search":
        list = list.filter((c) =>
          matchesQuery(c, view.q),
        );
        break;
      case "home":
      default:
        break;
    }

    // 次级筛选（搜索框 + 下拉菜单）
    const q = filter.q.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => matchesQuery(c, q));
    }
    if (filter.categoryId) {
      list = list.filter((c) => c.categories.includes(filter.categoryId!));
    }
    if (filter.countryCode) {
      list = list.filter((c) => c.country === filter.countryCode);
    }
    if (!filter.nsfw) {
      list = list.filter((c) => !c.is_nsfw);
    }

    // 排序
    switch (filter.sort) {
      case "country":
        list = [...list].sort(
          (a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name),
        );
        break;
      case "recent":
        list = [...list].sort((a, b) => {
          const ia = recentsIndex.get(a.id);
          const ib = recentsIndex.get(b.id);
          // 都不在最近观看列表 → 按名称排
          if (ia === undefined && ib === undefined) {
            return a.name.localeCompare(b.name);
          }
          // 在最近观看列表的排前，越近越前
          if (ia === undefined) return 1;
          if (ib === undefined) return -1;
          return ib - ia;
        });
        break;
      case "latency-asc":
      case "latency-desc": {
        const desc = filter.sort === "latency-desc";
        list = [...list].sort((a, b) => {
          const la = latency.get(a.id);
          const lb = latency.get(b.id);
          // -1（失败）和 undefined（未探测）统一放最后，彼此间按名称排
          const aValid = la !== undefined && la >= 0;
          const bValid = lb !== undefined && lb >= 0;
          if (aValid && bValid) {
            return desc ? lb! - la! : la! - lb!;
          }
          if (aValid) return -1;   // a 有效 → 排前
          if (bValid) return 1;    // b 有效 → 排前
          return a.name.localeCompare(b.name);  // 都无效 → 按名称
        });
        break;
      }
      case "nsfw-first":
        list = [...list].sort(
          (a, b) =>
            Number(b.is_nsfw) - Number(a.is_nsfw) || a.name.localeCompare(b.name),
        );
        break;
      case "default":
      default:
        break;
    }

    return list;
  }, [all, view, filter, favorites, recentsIndex, latency]);
}

function matchesQuery(c: ChannelWithStream, q: string): boolean {
  const needle = q.toLowerCase();
  if (c.name.toLowerCase().includes(needle)) return true;
  if (c.alt_names?.some?.((n) => n.toLowerCase().includes(needle))) return true;
  if (c.network?.toLowerCase().includes(needle)) return true;
  if (c.country.toLowerCase().includes(needle)) return true;
  if (c.categories.some((cat) => cat.toLowerCase().includes(needle))) return true;
  return false;
}

/** 按 id 获取频道。 */
export function useChannel(id: string | null | undefined): ChannelWithStream | undefined {
  const channels = useStore((s) => s.channels);
  return id ? channels.get(id) : undefined;
}
