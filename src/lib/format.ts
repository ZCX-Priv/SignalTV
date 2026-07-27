// 格式化辅助函数

const FLAG_BASE = "https://flagcdn.com";

// 国家代码来自第三方 API 数据，严格校验字符集后才拼接进 URL/CSS
const COUNTRY_CODE_RE = /^[a-z]{2}$/i;

function isValidCountryCode(code: string): boolean {
  return !!code && COUNTRY_CODE_RE.test(code);
}

/** 根据国家代码获取小尺寸国旗图片 URL。 */
export function flagUrl(code: string): string | null {
  if (!isValidCountryCode(code)) return null;
  return `${FLAG_BASE}/w40/${code.toLowerCase()}.png`;
}

/** 获取高分辨率国旗（用于首屏/详情）。 */
export function flagUrlLg(code: string): string | null {
  if (!isValidCountryCode(code)) return null;
  return `${FLAG_BASE}/w80/${code.toLowerCase()}.png`;
}

/**
 * 卡片背景用中等尺寸 PNG 国旗（CSS background 无法懒加载，
 * 改用 w160 PNG 替代整幅 SVG，单张从数百 KB 降到几 KB）。
 */
export function flagPngBgUrl(code: string): string | null {
  if (!isValidCountryCode(code)) return null;
  return `${FLAG_BASE}/w160/${code.toLowerCase()}.png`;
}

/**
 * 由国家代码哈希生成稳定的双色高级渐变。
 * 非法代码回退为中性高级灰渐变。
 */
export function countryGradient(code: string): string {
  if (!isValidCountryCode(code)) {
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

/** 播放历史的日期分组标签：今天 / 昨天 / "MM月DD日"。 */
export function historyDayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(d)) / 86_400_000,
  );
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}月${dd}日`;
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
