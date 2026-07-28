// 格式化辅助函数

import { getLocale, t } from "../i18n";
import { getActiveTimeZone } from "./timezone";

const FLAG_BASE = "https://flagcdn.com";

// Intl.DateTimeFormat 构造成本较高（HeaderClock 每秒调用），按 locale+选项缓存；
// timeZone 由激活时区统一注入（用户可在设置页切换），已含在 opts JSON key 中，
// 切时区后自然命中新缓存项，无需清理旧条目
const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = getLocale();
  const merged: Intl.DateTimeFormatOptions = {
    timeZone: getActiveTimeZone(),
    ...opts,
  };
  const key = `${locale}|${JSON.stringify(merged)}`;
  let f = dtfCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, merged);
    } catch {
      // 激活时区名非法（持久化数据被污染等极端情况）→ 回退 UTC，
      // 保证 HeaderClock 每秒调用不因 RangeError 崩掉整个应用
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" });
    }
    dtfCache.set(key, f);
  }
  return f;
}

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
 * theme 决定明暗变体：dark 为深色底（默认），light 为中等亮度高饱和的彩色变体，
 * 保持同源色相，避免浅底下泛白发灰。
 */
export function countryGradient(code: string, theme: "dark" | "light" = "dark"): string {
  if (!isValidCountryCode(code)) {
    return theme === "light"
      ? "linear-gradient(135deg, #d9d2c0 0%, #c4bca6 100%)"
      : "linear-gradient(135deg, #2a2a33 0%, #16161c 100%)";
  }
  const a = code.charCodeAt(0);
  const b = code.charCodeAt(1);
  let h = (a * 73856093) ^ (b * 19349663);
  h = h >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 28) % 360; // 相近色相，保证协调
  const c1 = theme === "light" ? `hsl(${hue} 48% 74%)` : `hsl(${hue} 34% 22%)`;
  const c2 = theme === "light" ? `hsl(${hue2} 44% 62%)` : `hsl(${hue2} 30% 14%)`;
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
}

/** 将分类 id（如 "movies"）转为展示名。 */
export function prettyCategory(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** 数字带千位分隔符（随当前界面语言的数字习惯）。 */
export function fmt(n: number): string {
  return n.toLocaleString(getLocale());
}

/** 当前时间格式化为 HH:MM:SS（24 小时制，分隔符随 locale）。 */
export function clock(d = new Date()): string {
  return dtf({
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** 格式化为 HH:MM（24 小时制，无秒）：播放历史卡片的时间角标用。 */
export function clockMinute(ts: number): string {
  return dtf({
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ts);
}

/** 格式化为广播日期（星期+月日按 locale 本地化），如 zh 下 "7月8日周一 · 14:32:05"。 */
export function broadcastDate(d = new Date()): string {
  const datePart = dtf({ weekday: "short", month: "short", day: "numeric" }).format(d);
  return `${datePart} · ${clock(d)}`;
}

/** 播放历史的日期分组标签：今天 / 昨天 / 本地化完整年月日。 */
export function historyDayLabel(ts: number): string {
  // 日界判定时区感知：用激活时区格式化年月日字符串比对，
  // 而非本地 Date 方法（切时区后本地日界与展示时区日界会错位）
  const dayKey = (x: number) =>
    dtf({ year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const now = Date.now();
  const key = dayKey(ts);
  if (key === dayKey(now)) return t("format.today");
  if (key === dayKey(now - 86_400_000)) return t("format.yesterday");
  // 更早的记录显示含年份的完整日期（年月日为历史页大分类）
  return dtf({ year: "numeric", month: "long", day: "numeric" }).format(ts);
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
