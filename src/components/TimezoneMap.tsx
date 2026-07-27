import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { clock } from "../lib/format";
import {
  detectTimeZone,
  formatOffsetLabel,
  ianaToOffsetMinutes,
  offsetMinutesLabel,
} from "../lib/timezone";
import { toast } from "../lib/toast";
import { useI18n } from "../i18n";

// ── 地图几何 ──
// 等距圆柱投影（近似）：经度 λ∈[-180,180] → x = 2λ+360 ∈ [0,720]；
// 纬度 φ∈[85,-60]（裁掉南极） → y = 188-2φ ∈ [18,308]。
// 顶部 y∈[0,16] 留给偏移数字标签行。
const MAP_TOP = 18;
const MAP_BOTTOM = 308;

// 可选时区带：UTC-11..UTC+12 共 24 带，每带宽 30px（=15° 经度）。
// 带按等宽排布（x=(N+11)*30），与真实经度中心相差半带（7.5°）——
// 大洲剪影仅为装饰背景，且现实时区边界的政治偏移远大于此，可接受。
const OFFSETS = Array.from({ length: 24 }, (_, i) => i - 11);
const BAND_W = 30;

// 简化大洲剪影（[经度, 纬度] 顶点表，低多边形近似，纯装饰）
const LAND: [number, number][][] = [
  // 北美
  [[-168, 66], [-160, 71], [-140, 70], [-125, 72], [-108, 73], [-88, 74],
   [-70, 68], [-55, 52], [-65, 44], [-76, 38], [-81, 31], [-80, 25],
   [-90, 29], [-97, 25], [-105, 22], [-97, 16], [-88, 12], [-78, 7],
   [-84, 10], [-92, 16], [-106, 24], [-117, 33], [-124, 41], [-124, 49],
   [-133, 56], [-146, 60], [-158, 58], [-166, 62]],
  // 格陵兰
  [[-45, 60], [-25, 70], [-20, 76], [-30, 83], [-55, 83], [-68, 78],
   [-60, 72], [-52, 65]],
  // 南美
  [[-78, 7], [-70, 10], [-62, 10], [-52, 4], [-44, -3], [-35, -8],
   [-39, -15], [-40, -23], [-48, -28], [-53, -34], [-58, -39], [-65, -41],
   [-66, -49], [-69, -52], [-75, -50], [-72, -42], [-71, -33], [-70, -25],
   [-75, -15], [-81, -6], [-80, 0]],
  // 欧亚大陆
  [[-10, 36], [-9, 44], [-1, 47], [3, 51], [8, 54], [5, 58], [10, 63],
   [15, 68], [25, 71], [30, 70], [40, 66], [60, 73], [90, 76], [110, 77],
   [130, 73], [150, 71], [170, 67], [178, 65], [170, 60], [160, 60],
   [150, 55], [141, 50], [135, 44], [128, 39], [122, 37], [121, 31],
   [121, 25], [108, 18], [103, 10], [102, 2], [98, 10], [91, 22],
   [86, 20], [80, 13], [77, 8], [72, 20], [66, 25], [59, 23], [57, 17],
   [50, 13], [43, 13], [43, 17], [39, 21], [34, 28], [34, 31], [36, 36],
   [27, 37], [22, 37], [20, 40], [18, 40], [15, 38], [12, 42], [8, 44],
   [6, 43], [3, 42], [0, 39], [-6, 36]],
  // 非洲
  [[-6, 35], [3, 37], [10, 37], [20, 32], [30, 31], [34, 28], [37, 22],
   [43, 11], [51, 12], [45, 2], [40, -4], [40, -15], [35, -20], [33, -26],
   [27, -34], [18, -34], [15, -27], [12, -18], [9, -7], [9, 0], [6, 4],
   [-5, 5], [-13, 9], [-17, 15], [-16, 20], [-10, 29]],
  // 澳大利亚
  [[114, -22], [122, -18], [130, -12], [136, -12], [142, -11], [146, -15],
   [149, -20], [153, -27], [150, -35], [144, -38], [140, -38], [135, -35],
   [129, -32], [124, -33], [115, -34], [113, -26]],
  // 不列颠
  [[-5, 50], [2, 52], [-1, 55], [-4, 58], [-6, 55], [-5, 52]],
  // 日本列岛
  [[130, 31], [133, 34], [137, 35], [141, 39], [142, 43], [144, 44],
   [141, 41], [139, 35], [132, 31]],
  // 马达加斯加
  [[44, -25], [47, -16], [50, -13], [49, -19], [46, -25]],
  // 新西兰
  [[167, -46], [171, -42], [174, -37], [176, -38], [172, -44], [168, -47]],
  // 苏门答腊/婆罗洲一带
  [[95, 5], [103, 1], [110, 1], [117, 4], [119, -1], [113, -4], [105, -6],
   [97, 2]],
  // 新几内亚
  [[131, -1], [138, -2], [146, -5], [148, -9], [141, -8], [134, -4]],
];

// 顶点表 → SVG path（模块加载时一次性生成）
const LAND_PATH = LAND.map(
  (poly) =>
    poly
      .map(
        ([lon, lat], i) =>
          `${i ? "L" : "M"}${(lon * 2 + 360).toFixed(0)},${(188 - lat * 2).toFixed(0)}`,
      )
      .join("") + "Z",
).join("");

/**
 * 世界地图时区选择器：24 条可点击的 UTC 时区带（UTC-11..UTC+12）。
 * SVG viewBox + width:100% 等比自动缩放适配移动端；
 * 键盘可达（radio 语义，Enter/Space 选择）。
 */
export function TimezoneMap() {
  const { t } = useI18n();
  const timezonePref = useStore((s) => s.timezonePref);
  const setTimezonePref = useStore((s) => s.setTimezonePref);

  // 状态行实时时钟预览（仅设置页挂载期间运行）
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // auto 模式：高亮检测到的时区所在带（就近取整；解析失败不高亮）
  const detected = useMemo(() => detectTimeZone(), []);
  const detectedMins = useMemo(() => ianaToOffsetMinutes(detected), [detected]);
  const activeOffset =
    timezonePref === "auto"
      ? detectedMins === null
        ? null
        : Math.max(-11, Math.min(12, Math.round(detectedMins / 60)))
      : timezonePref;

  const select = (offset: number) => {
    if (timezonePref === offset) return; // 重复点击已选带不重复弹 toast
    setTimezonePref(offset);
    toast.success(t("toast.tzSwitched", { name: formatOffsetLabel(offset) }));
  };

  // 状态行：手动 → UTC+8；auto → 检测到的 IANA 名 + 等效偏移
  const statusLabel =
    timezonePref === "auto"
      ? `${detected}${detectedMins !== null ? ` (${offsetMinutesLabel(detectedMins)})` : ""}`
      : formatOffsetLabel(timezonePref);

  return (
    <div className="tzmap">
      <svg
        className="tzmap__svg"
        viewBox="0 0 720 308"
        role="radiogroup"
        aria-label={t("tz.mapAria")}
      >
        {/* 大洲剪影：纯装饰背景 */}
        <path className="tzmap__land" d={LAND_PATH} aria-hidden="true" />
        {OFFSETS.map((n) => {
          const x = (n + 11) * BAND_W;
          const active = n === activeOffset;
          const label = formatOffsetLabel(n);
          return (
            <g key={n}>
              <rect
                className={`tzmap__band ${active ? "is-active" : ""}`}
                x={x}
                y={MAP_TOP}
                width={BAND_W}
                height={MAP_BOTTOM - MAP_TOP}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                aria-label={t("tz.bandAria", { name: label })}
                onClick={() => select(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(n);
                  }
                }}
              />
              <text
                className={`tzmap__label ${n % 2 !== 0 ? "tzmap__label--odd" : ""} ${active ? "is-active" : ""}`}
                x={x + BAND_W / 2}
                y={11}
                aria-hidden="true"
              >
                {n > 0 ? `+${n}` : n}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="tzmap__status mono">
        <span className="tzmap__status-zone">{statusLabel}</span>
        <span aria-hidden="true">·</span>
        <span className="tzmap__status-time">{clock(now)}</span>
      </div>
    </div>
  );
}
