// 时区解析与激活时区管理（与 i18n 的 currentLocale 同风格的模块级状态，
// 供 format.ts 的 dtf() 读取，避免 format.ts 反向依赖 useStore 形成环）。
//
// 用户偏好（useStore.timezonePref，持久化）：
// - "auto"：跟随设备时区（Intl 检测），检测失败回退东八区 Asia/Shanghai
// - number：手动选择的 UTC 整数偏移（-11..12），映射为 Etc/GMT 固定偏移时区

/** 时区偏好：auto 自动检测 | UTC 整数偏移（小时） */
export type TimezonePref = "auto" | number;

/** 检测失败时的兜底时区：东八区 */
const FALLBACK_TIME_ZONE = "Asia/Shanghai";

/** 检测设备 IANA 时区；不可用/异常时回退东八区 */
export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    // 旧引擎/隐私环境可能抛错 → 走兜底
  }
  return FALLBACK_TIME_ZONE;
}

/**
 * UTC 偏移 → IANA Etc/GMT 时区名。
 * 注意 Etc/GMT 符号与直觉相反：UTC+8 → "Etc/GMT-8"，UTC-5 → "Etc/GMT+5"。
 */
export function offsetToIana(offset: number): string {
  return `Etc/GMT${offset <= 0 ? "+" : "-"}${Math.abs(offset)}`;
}

/** 偏移展示名：UTC+8 / UTC-3 / UTC±0 */
export function formatOffsetLabel(offset: number): string {
  if (offset === 0) return "UTC±0";
  return `UTC${offset > 0 ? "+" : "-"}${Math.abs(offset)}`;
}

/** 分钟级偏移展示名（auto 模式可能检到半小时时区）：UTC+5:30 / UTC-3 */
export function offsetMinutesLabel(mins: number): string {
  if (mins === 0) return "UTC±0";
  const sign = mins > 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/**
 * 取某 IANA 时区当前的 UTC 偏移（分钟），用于 auto 模式在地图上
 * 高亮检测到的时区带。解析失败返回 null（不高亮）。
 */
export function ianaToOffsetMinutes(timeZone: string): number | null {
  try {
    // longOffset 输出如 "GMT+08:00" / "GMT-03:30"
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part) return null;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
    if (!m) return 0; // "GMT"（无偏移后缀）= UTC±0
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3]));
  } catch {
    return null;
  }
}

// ── 激活时区（模块级，dtf() 每次调用读取） ──
let activeTimeZone: string = detectTimeZone();

/** 当前生效的 IANA 时区名（format.ts 的 dtf() 注入用） */
export function getActiveTimeZone(): string {
  return activeTimeZone;
}

/** 按偏好重算激活时区（store action / rehydrate / main.tsx 启动时调用） */
export function syncActiveTimeZone(pref: TimezonePref): void {
  activeTimeZone = pref === "auto" ? detectTimeZone() : offsetToIana(pref);
}
