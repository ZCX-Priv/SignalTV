import { useEffect, useMemo, useRef, useState } from "react";
import { SearchX, Loader2, Heart } from "lucide-react";
import { useStore } from "../store/useStore";
import type { ChannelWithStream } from "../types";
import { fmt } from "../lib/format";
import { useI18n } from "../i18n";
import { ChannelCard } from "./ChannelCard";
import { EmptyState } from "./EmptyState";

const PAGE = 60;

interface ChannelGridProps {
  /** 由父组件（ChannelsView）统一计算的过滤结果，避免与 FilterBar 重复过滤 */
  list: ChannelWithStream[];
}

export function ChannelGrid({ list }: ChannelGridProps) {
  const { t } = useI18n();
  const view = useStore((s) => s.view);
  const filter = useStore((s) => s.filter);
  const [limit, setLimit] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 结果集变化时重置分页：依赖 filter 而非仅 list.length，
  // 避免筛选条件变化但结果数恰好相同时不重置导致展示错乱
  useEffect(() => {
    setLimit(PAGE);
  }, [view, filter, list.length]);

  // 通过 IntersectionObserver 实现无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setLimit((l) => Math.min(l + PAGE, list.length));
          }
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [list.length]);

  const shown = useMemo(() => list.slice(0, limit), [list, limit]);
  const probeLatencyForIds = useStore((s) => s.probeLatencyForIds);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const favoritesCount = useStore((s) => s.favorites.length);

  // 可见性优先探测：shown 变化时 debounce 150ms 触发，
  // 让首屏可见频道的延迟标签 1-3 秒内出现，而非等全量探测。
  // 播放器打开期间暂停（不与视频流抢带宽），关闭后自动补测。
  useEffect(() => {
    if (shown.length === 0) return;
    if (activeChannelId) return;
    const ids = shown.map((c) => c.id);
    const timer = setTimeout(() => {
      void probeLatencyForIds(ids);
    }, 150);
    return () => clearTimeout(timer);
  }, [shown, probeLatencyForIds, activeChannelId]);

  if (list.length === 0) {
    // 收藏页且没有任何收藏：专属空态（图标与侧边栏收藏夹入口一致）；
    // 有收藏但被搜索/筛选过滤为空时仍走通用「无信号」空态
    if (view.kind === "favorites" && favoritesCount === 0) {
      return (
        <EmptyState
          icon={<Heart size={28} />}
          title={t("grid.favEmptyTitle")}
          desc={t("grid.favEmptyDesc")}
        />
      );
    }
    return (
      <EmptyState
        icon={<SearchX size={28} />}
        title={t("grid.emptyTitle")}
        desc={t("grid.emptyDesc")}
      />
    );
  }

  return (
    <div className="grid-wrap">
      <div className="grid">
        {shown.map((c, i) => (
          <ChannelCard key={c.id} channel={c} index={i} />
        ))}
      </div>

      {limit < list.length && (
        <div className="grid-loadmore" ref={sentinelRef}>
          <Loader2 size={14} className="spin" />
          <span className="mono">{t("grid.loadingMore", { count: Math.min(PAGE, list.length - limit) })}</span>
        </div>
      )}

      <div className="grid-foot mono">
        {t("grid.footer", { total: fmt(list.length), shown: fmt(shown.length) })}
      </div>
    </div>
  );
}
