import { useEffect, useMemo, useRef, useState } from "react";
import { SearchX, Loader2 } from "lucide-react";
import { useStore } from "../store/useStore";
import { useFilteredChannels } from "../hooks/useChannels";
import { ChannelCard } from "./ChannelCard";

const PAGE = 60;

export function ChannelGrid() {
  const list = useFilteredChannels();
  const view = useStore((s) => s.view);
  const [limit, setLimit] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 结果集变化时重置分页
  useEffect(() => {
    setLimit(PAGE);
  }, [view, list.length]);

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

  if (list.length === 0) {
    return (
      <div className="empty">
        <SearchX size={28} />
        <h3 className="display">无信号。</h3>
        <p>没有频道匹配当前筛选条件，请尝试扩大搜索范围。</p>
      </div>
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
          <span className="mono">正在加载 {Math.min(PAGE, list.length - limit)} 路信号…</span>
        </div>
      )}

      <div className="grid-foot mono">
        显示 {list.length.toLocaleString("en-US")} 路信号中的 {shown.length.toLocaleString("en-US")} 路
      </div>
    </div>
  );
}
