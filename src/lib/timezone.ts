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

// 中文数字表（1..12）：中文区名「东八区」用，不出现 UTC 字样
const CN_NUMERALS = [
  "", "一", "二", "三", "四", "五", "六",
  "七", "八", "九", "十", "十一", "十二",
] as const;

/** 整点偏移的中文区名：东八区 / 西五区 / 中时区 */
function cnZoneName(offset: number): string {
  if (offset === 0) return "中时区";
  return `${offset > 0 ? "东" : "西"}${CN_NUMERALS[Math.abs(offset)]}区`;
}

/**
 * 偏移展示名（随界面语言）：
 * - zh*：东八区 / 西五区 / 中时区
 * - 其他：UTC+8 / UTC-3 / UTC±0
 */
export function formatOffsetLabel(offset: number, locale: string): string {
  if (locale.startsWith("zh")) return cnZoneName(offset);
  if (offset === 0) return "UTC±0";
  return `UTC${offset > 0 ? "+" : "-"}${Math.abs(offset)}`;
}

/**
 * 分钟级偏移展示名（auto 模式可能检到半小时时区）：
 * - zh*：整点复用中文区名；非整点无通行中文名 → 东5.5区（避免 UTC 字样）
 * - 其他：UTC+5:30 / UTC-3
 */
export function offsetMinutesLabel(mins: number, locale: string): string {
  if (locale.startsWith("zh")) {
    if (mins % 60 === 0) return cnZoneName(mins / 60);
    return `${mins > 0 ? "东" : "西"}${Math.abs(mins) / 60}区`;
  }
  if (mins === 0) return "UTC±0";
  const sign = mins > 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

// ── IANA 名中文翻译表（仅 zh 界面用；其他语言直接显示原始 IANA 名）──

/** 区域前缀 → 中文 */
const CN_REGIONS: Record<string, string> = {
  Asia: "亚洲",
  Europe: "欧洲",
  America: "美洲",
  Africa: "非洲",
  Pacific: "太平洋",
  Atlantic: "大西洋",
  Indian: "印度洋",
  Australia: "澳大利亚",
  Antarctica: "南极洲",
  Arctic: "北极",
};

/** 常见时区城市 → 中文（未收录城市回退原始 IANA 名，避免中英混排） */
const CN_CITIES: Record<string, string> = {
  Shanghai: "上海",
  Urumqi: "乌鲁木齐",
  Hong_Kong: "香港",
  Macau: "澳门",
  Taipei: "台北",
  Tokyo: "东京",
  Seoul: "首尔",
  Pyongyang: "平壤",
  Singapore: "新加坡",
  Kuala_Lumpur: "吉隆坡",
  Bangkok: "曼谷",
  Ho_Chi_Minh: "胡志明市",
  Jakarta: "雅加达",
  Manila: "马尼拉",
  Yangon: "仰光",
  Dhaka: "达卡",
  Kolkata: "加尔各答",
  Karachi: "卡拉奇",
  Kathmandu: "加德满都",
  Colombo: "科伦坡",
  Dubai: "迪拜",
  Riyadh: "利雅得",
  Tehran: "德黑兰",
  Jerusalem: "耶路撒冷",
  Istanbul: "伊斯坦布尔",
  Almaty: "阿拉木图",
  Tashkent: "塔什干",
  London: "伦敦",
  Dublin: "都柏林",
  Lisbon: "里斯本",
  Paris: "巴黎",
  Berlin: "柏林",
  Madrid: "马德里",
  Rome: "罗马",
  Amsterdam: "阿姆斯特丹",
  Zurich: "苏黎世",
  Vienna: "维也纳",
  Warsaw: "华沙",
  Stockholm: "斯德哥尔摩",
  Athens: "雅典",
  Helsinki: "赫尔辛基",
  Kyiv: "基辅",
  Moscow: "莫斯科",
  Cairo: "开罗",
  Lagos: "拉各斯",
  Nairobi: "内罗毕",
  Johannesburg: "约翰内斯堡",
  Casablanca: "卡萨布兰卡",
  New_York: "纽约",
  Chicago: "芝加哥",
  Denver: "丹佛",
  Los_Angeles: "洛杉矶",
  Anchorage: "安克雷奇",
  Vancouver: "温哥华",
  Toronto: "多伦多",
  Mexico_City: "墨西哥城",
  Bogota: "波哥大",
  Lima: "利马",
  Santiago: "圣地亚哥",
  Sao_Paulo: "圣保罗",
  Buenos_Aires: "布宜诺斯艾利斯",
  Pago_Pago: "帕果帕果",
  South_Georgia: "南乔治亚",
  Azores: "亚速尔群岛",
  Noumea: "努美阿",
  Honolulu: "檀香山",
  Auckland: "奥克兰",
  Fiji: "斐济",
  Guam: "关岛",
  Sydney: "悉尼",
  Melbourne: "墨尔本",
  Brisbane: "布里斯班",
  Perth: "珀斯",
  Adelaide: "阿德莱德",
  Darwin: "达尔文",
};

/**
 * IANA 时区名的界面语言翻译：
 * - zh*：「区域/城市」逐段翻译（Asia/Shanghai → 亚洲/上海），
 *   区域或城市未收录（含 Etc/GMT 等非地理名）→ 原样返回
 * - 其他语言：原样返回 IANA 名（本身即英文形态）
 */
export function translateIana(timeZone: string, locale: string): string {
  if (!locale.startsWith("zh")) return timeZone;
  const slash = timeZone.indexOf("/");
  if (slash < 0) return timeZone;
  const region = CN_REGIONS[timeZone.slice(0, slash)];
  // 城市段取最后一级（兼容 America/Argentina/Buenos_Aires 三段式）
  const city = CN_CITIES[timeZone.slice(timeZone.lastIndexOf("/") + 1)];
  return region && city ? `${region}/${city}` : timeZone;
}

// 代表城市表（offset -11..12）：手动选区无城市语义（Etc/GMT 固定偏移），
// 状态行用知名城市作地点标识；个别城市有夏令时，仅作地标提示，
// 不影响实际时间计算（时间仍按固定偏移显示）。
const REPRESENTATIVE_ZONES: Record<number, string> = {
  [-11]: "Pacific/Pago_Pago",
  [-10]: "Pacific/Honolulu",
  [-9]: "America/Anchorage",
  [-8]: "America/Los_Angeles",
  [-7]: "America/Denver",
  [-6]: "America/Chicago",
  [-5]: "America/New_York",
  [-4]: "America/Santiago",
  [-3]: "America/Sao_Paulo",
  [-2]: "Atlantic/South_Georgia",
  [-1]: "Atlantic/Azores",
  [0]: "Europe/London",
  [1]: "Europe/Paris",
  [2]: "Europe/Athens",
  [3]: "Europe/Moscow",
  [4]: "Asia/Dubai",
  [5]: "Asia/Karachi",
  [6]: "Asia/Dhaka",
  [7]: "Asia/Bangkok",
  [8]: "Asia/Shanghai",
  [9]: "Asia/Tokyo",
  [10]: "Australia/Sydney",
  [11]: "Pacific/Noumea",
  [12]: "Pacific/Auckland",
};

/** 时区带的代表城市 IANA 名（表外偏移回退 Etc/GMT 名，实际不会出现） */
export function representativeIana(offset: number): string {
  return REPRESENTATIVE_ZONES[offset] ?? offsetToIana(offset);
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
