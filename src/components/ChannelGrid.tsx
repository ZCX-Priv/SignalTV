import { useEffect, useMemo, useRef, useState } from "react";
import { SearchX, Loader2, Heart } from "lucide-react";
import { useStore } from "../store/useStore";
import type { ChannelWithStream } from "../types";
import { fmt } from "../lib/format";
import { useI18n } from "../i18n";
import { ChannelCard } from "./ChannelCard";
import { EmptyState } from "./EmptyState";

const PAGE = 60;   // 首屏一次性渲染量，保证首屏立即填满
const BATCH = 12;  // 流式补给批量：约 2-3 行卡片，单批渲染开销小到可逐帧完成
const BUFFER = 1200; // 预补缓冲（px）：哨兵距视口底不足约一屏半时开始补给

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

  // 滚动驱动的实时流式补给：替代原 IntersectionObserver「到点补一大页」，
  // 每次滚动经 rAF 节流后检查哨兵与视口底的距离，进入 BUFFER 预补区即补一小批。
  // 依赖含 limit：每补一批渲染后 effect 重跑并立即复检，形成逐帧小批量补给链，
  // 直到缓冲填满自然停止——内容随滚动连续流入，快滚也不会断流成片。
  // scroll 事件不冒泡，监听须挂在实际滚动容器 .app__main 上而非 window。
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    let raf = 0;
    const replenish = () => {
      raf = 0;
      const s = sentinelRef.current;
      if (!s) return;
      if (s.getBoundingClientRect().top < window.innerHeight + BUFFER) {
        setLimit((l) => Math.min(l + BATCH, list.length));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(replenish);
    };
    replenish();
    const scroller = el.closest(".app__main");
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [list.length, limit]);

  const shown = useMemo(() => list.slice(0, limit), [list, limit]);
  const probeLatencyForIds = useStore((s) => s.probeLatencyForIds);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const favoritesCount = useStore((s) => s.favorites.length);
  // 卡片/列表展示形态：收藏页独立偏好，其余浏览页共享一份；
  // 列表态仅加修饰类，卡片 JSX 不变（样式见 .grid--list）
  const gridLayout = useStore((s) =>
    s.gridLayouts[view.kind === "favorites" ? "favorites" : "browse"],
  );

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
      <div className={`grid ${gridLayout === "list" ? "grid--list" : ""}`}>
        {shown.map((c, i) => (
          <ChannelCard key={c.id} channel={c} index={i} />
        ))}
      </div>

      {limit < list.length && (
        <div className="grid-loadmore" ref={sentinelRef}>
          <Loader2 size={14} className="spin" />
          <span className="mono">{t("grid.loadingMore", { count: Math.min(BATCH, list.length - limit) })}</span>
        </div>
      )}

      <div className="grid-foot mono">
        {t("grid.footer", { total: fmt(list.length), shown: fmt(shown.length) })}
      </div>
    </div>
  );
}
