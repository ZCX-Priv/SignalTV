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

/** 经当前视图与筛选条件过滤后的频道。 */
export function useFilteredChannels(): ChannelWithStream[] {
  const all = useAllChannels();
  const view = useStore((s) => s.view);
  const filter = useStore((s) => s.filter);
  const favorites = useStore((s) => s.favorites);
  const recents = useStore((s) => s.recents);
  const channelsMap = useStore((s) => s.channels);
  const latency = useStore((s) => s.latency);

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
        list = [...list].sort(
          (a, b) => recents.indexOf(b.id) - recents.indexOf(a.id),
        );
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
  }, [all, view, filter, favorites, recents, channelsMap, latency]);
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
