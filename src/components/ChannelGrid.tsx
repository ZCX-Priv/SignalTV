import { useEffect, useMemo, useRef, useState } from "react";
import { SearchX, Heart } from "lucide-react";
import { useStore } from "../store/useStore";
import type { ChannelWithStream } from "../types";
import { fmt } from "../lib/format";
import { useI18n } from "../i18n";
import { ChannelCard } from "./ChannelCard";
import { EmptyState } from "./EmptyState";

// 窗口化虚拟渲染：任何时刻只挂载视口附近的卡片，滚出即卸载。
// 每帧工作量 = O(窗口大小)，与列表总量、滚动深度、滚动速度全部无关——
// 这是极速滚动（每秒上千行）下不断流、不吃满 CPU 的根本保证。
const INITIAL = 60;       // 视图首帧渲染量：几何未实测前先按估值铺满约两屏
const OVERSCAN_ROWS = 2;  // 视口上下方基础预挂行数：慢滚/静止时的余量
const LOOKAHEAD = 200;    // 前瞻窗口（ms）：按当前速度预测 200ms 后视口位置，向下方向多预挂
const EMA = 0.35;         // 速度平滑系数：越大越跟手，0.35 可滤掉滚轮脉冲式 delta 的抖动
const IDLE_MS = 200;      // 静止判定（ms）：超过此间隔无位移则速度归零，预挂量自动回落
const MAX_CARDS = 180;    // 窗口卡数上限：封死单次 commit 的最大调和/挂载量，保帧率

interface ChannelGridProps {
  /** 由父组件（ChannelsView）统一计算的过滤结果，避免与 FilterBar 重复过滤 */
  list: ChannelWithStream[];
}

export function ChannelGrid({ list }: ChannelGridProps) {
  const { t } = useI18n();
  const view = useStore((s) => s.view);
  const filter = useStore((s) => s.filter);

  // 卡片/列表展示形态：收藏页独立偏好，其余浏览页共享一份；
  // 列表态仅加修饰类，卡片 JSX 不变（样式见 .grid--list）
  const gridLayout = useStore((s) =>
    s.gridLayouts[view.kind === "favorites" ? "favorites" : "browse"],
  );

  const spaceRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // 速度采样全部走 ref：每帧读写，不触发 render
  const velRef = useRef(0);      // EMA 平滑后的下滚速度（px/ms），只统计向下滚动
  const lastTopRef = useRef(0);  // 上次采样的 scrollTop
  const lastTsRef = useRef(0);   // 上次采样时间戳（有位移或超时才更新，保证静止判定准确）

  // 实测几何（列数/行高/行间距/grid-space 距滚动容器顶部的偏移）。
  // 参与 render 计算（撑高与位移），必须是 state；初值为桌面 210px 列宽下的
  // 典型估值，首帧 ResizeObserver 实测后即被覆盖
  const [geom, setGeom] = useState({ cols: 4, rowH: 320, gap: 16, top: 0 });
  // 当前渲染窗口 [start, end)（卡片下标，start 恒为整行起点）
  const [range, setRange] = useState({ start: 0, end: INITIAL });
  // boot 期标记：仅视图首帧挂载的卡片跑 fade-up 入场，
  // 之后窗口滑动挂载的卡片一律静默出现（防止快滚时整屏持续闪烁）
  const [boot, setBoot] = useState(true);

  // 结果集变化时重置窗口到顶部：依赖 filter 而非仅 list.length，
  // 避免筛选条件变化但结果数恰好相同时不重置导致展示错乱。
  // 同步清零速度采样，防止旧速度残留把新结果集的首轮预挂撑大
  useEffect(() => {
    setRange({ start: 0, end: INITIAL });
    setBoot(true);
    velRef.current = 0;
    lastTsRef.current = 0;
    // 同步滚动归顶：定位层首帧即全量高度，深滚位置不会像追加式那样被
    // scrollHeight 塌缩钳回；且若新旧 list.length 恰好相同，窗口计算 effect
    // 不重跑，深滚处会渲染归零后的顶部窗口造成整屏空白。归顶本身触发
    // scroll 事件 → rAF update() 重算窗口，闭合这一状态脱节
    const scroller = spaceRef.current?.closest(".app__main");
    if (scroller && scroller.scrollTop !== 0) scroller.scrollTop = 0;
  }, [view, filter, list.length]);

  // boot 期只维持一次 commit：首帧卡片挂载后立即结束。
  // 已挂载卡片在 ChannelCard 内部冻结了入场参数，此处翻转不影响其动画
  useEffect(() => {
    if (boot) setBoot(false);
  }, [boot]);

  // 几何实测：列数取 grid 的已解析轨道数（自动适配桌面 210px 列 / 移动端 150px 列，
  // 列表态 flex 单列时 computed 值为 "none" → 1 列），行高取首卡实高 + 行间距，
  // top 取 grid-space 相对滚动容器内容顶部的偏移（即 Hero 区高度）。
  // ResizeObserver 挂在 grid-space 上而非 grid：grid 高度随窗口滑动每帧变化，
  // 观察它会导致滚动期间每帧强制 reflow；grid-space 尺寸只随视口/数据量变化
  useEffect(() => {
    const space = spaceRef.current;
    const grid = gridRef.current;
    if (!space || !grid) return;
    const scroller = space.closest(".app__main");
    const measure = () => {
      const style = getComputedStyle(grid);
      const cols = Math.max(1, style.gridTemplateColumns.split(" ").length);
      const gap = parseFloat(style.rowGap) || 16;
      const card = grid.firstElementChild;
      if (!(card instanceof HTMLElement) || card.offsetHeight === 0) return;
      const rowH = card.offsetHeight + gap;
      const top = scroller
        ? space.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
        : 0;
      // 亚像素抖动不触发重渲染，防止「实测 → 撑高变化 → RO 再触发」自激循环
      setGeom((g) =>
        g.cols === cols &&
        g.gap === gap &&
        Math.abs(g.rowH - rowH) < 0.5 &&
        Math.abs(g.top - top) < 0.5
          ? g
          : { cols, rowH, gap, top },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(space);
    return () => ro.disconnect();
    // 依赖含 view：Hero 随视图显隐只改变 grid-space 上方偏移（geom.top）
    // 而不改其宽高，ResizeObserver 不会触发，须靠依赖重跑实测
  }, [list.length, gridLayout, view]);

  // 窗口计算：scroll 经 rAF 节流采样，每帧 O(1) 纯算术——
  // 1) scrollTop 差分算瞬时速度并 EMA 平滑（纯滚动不脏布局，读取无 reflow）；
  // 2) 由 scrollTop 直接换算可见行区间，上方固定预挂、下方按速度前瞻加挂；
  // 3) 窗口总量以 MAX_CARDS 封顶；区间与当前 state 相同则不 setState，静止时零 render。
  // scroll 事件不冒泡，监听须挂在实际滚动容器 .app__main 上而非 window。
  useEffect(() => {
    const space = spaceRef.current;
    if (!space) return;
    const scroller = space.closest(".app__main");
    if (!(scroller instanceof HTMLElement)) return;
    const { cols, rowH, top: gridTop } = geom;
    const totalRows = Math.ceil(list.length / cols);
    let raf = 0;
    const update = () => {
      raf = 0;
      const now = performance.now();
      const top = scroller.scrollTop;
      const dt = now - lastTsRef.current;
      const dy = top - lastTopRef.current;
      if (dy > 0 && dt > 0 && dt <= IDLE_MS) {
        velRef.current = EMA * (dy / dt) + (1 - EMA) * velRef.current;
      } else if (dy < 0 || dt > IDLE_MS) {
        velRef.current = 0; // 上滚无需向下前瞻；静止超时后预挂量回落
      }
      if (dy !== 0 || dt > IDLE_MS) {
        lastTopRef.current = top;
        lastTsRef.current = now;
      }
      const rel = top - gridTop;
      const firstRow = Math.floor(rel / rowH);
      const lastRow = Math.floor((rel + scroller.clientHeight) / rowH);
      const below =
        OVERSCAN_ROWS + Math.ceil((velRef.current * LOOKAHEAD) / rowH);
      const startRow = Math.max(0, firstRow - OVERSCAN_ROWS);
      let endRow = Math.min(totalRows, lastRow + 1 + below);
      const maxRows = Math.max(2, Math.floor(MAX_CARDS / cols));
      if (endRow - startRow > maxRows) endRow = startRow + maxRows;
      // 下界兜底：网格尚在视口下方（Hero 超一屏）时 lastRow 为负，
      // 保证窗口至少含起始 2 行，几何实测始终有首卡可采样
      endRow = Math.max(endRow, Math.min(totalRows, startRow + 2));
      const start = startRow * cols;
      const end = Math.min(list.length, endRow * cols);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [list.length, geom]);

  const shown = useMemo(
    () => list.slice(range.start, range.end),
    [list, range],
  );
  const probeLatencyForIds = useStore((s) => s.probeLatencyForIds);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const favoritesCount = useStore((s) => s.favorites.length);

  // 可见性优先探测：窗口内容变化时 debounce 150ms 触发——滚动期间窗口每帧
  // 变化会不断重置计时器，天然等到滚动停止才探测当前停留处的频道。
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

  // 定位层高度 = 总行数 × 行高 - 末行多余间距：滚动条从首帧起即为全量高度，
  // 拖到任意位置都是下一帧直接渲染该处内容，不存在「加载中」
  const totalRows = Math.ceil(list.length / geom.cols);
  const spaceH = Math.max(0, totalRows * geom.rowH - geom.gap);
  // 窗口起始行的像素位移：start 恒为整行起点，floor 兜底列数突变的瞬时不整
  const offsetY = Math.floor(range.start / geom.cols) * geom.rowH;

  return (
    <div className="grid-wrap">
      <div ref={spaceRef} className="grid-space" style={{ height: spaceH }}>
        <div
          ref={gridRef}
          className={`grid ${gridLayout === "list" ? "grid--list" : ""}`}
          style={{ transform: `translateY(${offsetY}px)` }}
        >
          {shown.map((c, i) => (
            <ChannelCard key={c.id} channel={c} index={i} animate={boot} />
          ))}
        </div>
      </div>

      <div className="grid-foot mono">
        {t("grid.footer", { total: fmt(list.length), shown: fmt(list.length) })}
      </div>
    </div>
  );
}
