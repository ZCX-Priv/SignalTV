// 格式化辅助函数

const FLAG_BASE = "https://flagcdn.com";

/** 根据国家代码获取小尺寸国旗图片 URL。 */
export function flagUrl(code: string): string | null {
  if (!code || code.length !== 2) return null;
  return `${FLAG_BASE}/w40/${code.toLowerCase()}.png`;
}

/** 获取高分辨率国旗（用于首屏/详情）。 */
export function flagUrlLg(code: string): string | null {
  if (!code || code.length !== 2) return null;
  return `${FLAG_BASE}/w80/${code.toLowerCase()}.png`;
}

/** 获取国旗 SVG 矢量图（用于背景暗纹水印），非 2 位代码返回 null。 */
export function flagSvgUrl(code: string): string | null {
  if (!code || code.length !== 2) return null;
  return `${FLAG_BASE}/${code.toLowerCase()}.svg`;
}

/**
 * 由国家代码哈希生成稳定的双色高级渐变。
 * 非法代码回退为中性高级灰渐变。
 */
export function countryGradient(code: string): string {
  if (!code || code.length !== 2) {
    return "linear-gradient(135deg, #2a2a33 0%, #16161c 100%)";
  }
  const a = code.charCodeAt(0);
  const b = code.charCodeAt(1);
  let h = (a * 73856093) ^ (b * 19349663);
  h = h >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 28) % 360; // 相近色相，保证协调
  const c1 = `hsl(${hue} 34% 22%)`;
  const c2 = `hsl(${hue2} 30% 14%)`;
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
}

/** 将分类 id（如 "movies"）转为展示名。 */
export function prettyCategory(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** 数字带千位分隔符。 */
export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** 当前时间格式化为 HH:MM:SS（24 小时制）。 */
export function clock(d = new Date()): string {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

/** 格式化为广播日期，如 "周一 07月08日 · 14:32"。 */
export function broadcastDate(d = new Date()): string {
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `周${weekday} ${mm}月${dd}日 · ${clock(d)}`;
}

/** 由频道 id 生成稳定的"频道号"（用于频道号美学展示）。 */
export function channelPosition(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  const major = (h % 900) + 100; // 100–999
  const minor = (h >>> 9) % 10;
  return `${major}.${minor}`;
}
