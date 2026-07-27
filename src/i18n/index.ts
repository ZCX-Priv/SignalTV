// 轻量 i18n 运行时（0 依赖，与 idb.ts 同风格的手写实现）
//
// 设计要点：
// - zh-CN 为源字典（静态打包，兜底），其余 7 种语言包经 import() 动态加载（Vite 自动分包）
// - t(key, params) 支持 {name} 插值与 Intl.PluralRules 复数分支（俄语 one/few/many 等）
// - 自带极小订阅器（useSyncExternalStore），不依赖 zustand，避免与 useStore 循环引用；
//   语言切换 → notify → 所有 useI18n() 订阅组件重渲染
// - html lang / og:locale 等 DOM 副作用统一走 applyLocaleSideEffects

import { useSyncExternalStore } from "react";
import {
  dict as zhDict,
  vidstack as zhVidstack,
  type Dict,
  type MsgKey,
  type VidstackDict,
} from "./locales/zh-CN";

/** 支持的界面语言 */
export const SUPPORTED_LOCALES = [
  "zh-CN",
  "en",
  "de",
  "fr",
  "ja",
  "ru",
  "es",
  "ko",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** 语言偏好：system 表示跟随浏览器自动检测 */
export type LanguagePref = "system" | Locale;

/** 各语言的本族语名称（语言设置项固定用本族语显示，不随界面语言变化） */
export const NATIVE_LOCALE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  ja: "日本語",
  ru: "Русский",
  es: "Español",
  ko: "한국어",
};

/** og:locale 值映射 */
const OG_LOCALES: Record<Locale, string> = {
  "zh-CN": "zh_CN",
  en: "en_US",
  de: "de_DE",
  fr: "fr_FR",
  ja: "ja_JP",
  ru: "ru_RU",
  es: "es_ES",
  ko: "ko_KR",
};

/** 语言包模块形态：en 的 vidstack 为 undefined（走 vidstack 内置英文） */
interface LocaleModule {
  dict: Dict;
  vidstack?: VidstackDict;
}

// 其余 7 种语言的按需加载器（zh-CN 已静态打包，不走动态导入，避免双重导入告警）
const loaders: Record<Exclude<Locale, "zh-CN">, () => Promise<LocaleModule>> = {
  en: () => import("./locales/en"),
  de: () => import("./locales/de"),
  fr: () => import("./locales/fr"),
  ja: () => import("./locales/ja"),
  ru: () => import("./locales/ru"),
  es: () => import("./locales/es"),
  ko: () => import("./locales/ko"),
};

// 已加载语言包缓存：切回已用过的语言时无需重新网络加载
const loadedModules = new Map<Locale, LocaleModule>([
  ["zh-CN", { dict: zhDict, vidstack: zhVidstack }],
]);

// ── 当前语言状态（模块级，经订阅器驱动 React） ──
let currentLocale: Locale = "zh-CN";
let currentDict: Dict = zhDict;
let currentVidstack: VidstackDict | undefined = zhVidstack;
let pluralRules = new Intl.PluralRules("zh-CN");

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 当前已解析的实际语言（供 format.ts 等非组件代码取用） */
export function getLocale(): Locale {
  return currentLocale;
}

/** 按浏览器语言自动检测：前缀匹配（zh* → zh-CN），无匹配回退 en */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const raw of candidates) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    // 完整匹配优先（zh-cn），否则取主语言子标签
    if (lower === "zh-cn" || lower.startsWith("zh")) return "zh-CN";
    const primary = lower.split("-")[0];
    const hit = SUPPORTED_LOCALES.find(
      (l) => l === primary || l.toLowerCase() === lower,
    );
    if (hit) return hit;
  }
  return "en";
}

/** 语言偏好 → 实际语言 */
export function resolveLocale(pref: LanguagePref): Locale {
  return pref === "system" ? detectLocale() : pref;
}

/**
 * 加载并激活语言包：动态 import（带缓存）→ 更新模块级字典 →
 * 通知订阅组件重渲染。加载失败时保持当前语言不变（静默降级）。
 */
export async function loadLocale(locale: Locale): Promise<void> {
  let mod = loadedModules.get(locale);
  if (!mod) {
    try {
      mod = await loaders[locale as Exclude<Locale, "zh-CN">]();
      loadedModules.set(locale, mod);
    } catch {
      // chunk 加载失败（离线且未缓存）→ 保持现有语言，不中断应用
      return;
    }
  }
  currentLocale = locale;
  currentDict = mod.dict;
  currentVidstack = mod.vidstack;
  pluralRules = new Intl.PluralRules(locale);
  notify();
}

export type TParams = Record<string, string | number>;

/**
 * 翻译函数：
 * - 复数消息按 params.count 经 Intl.PluralRules 选分支（缺分支回退 other）
 * - {name} 插值；数字参数按当前 locale 千分位格式化
 * - 缺 key 回退 zh-CN 源字典，再回退 key 本身
 */
export function t(key: MsgKey, params?: TParams): string {
  const msg = currentDict[key] ?? zhDict[key];
  let text: string;
  if (typeof msg === "string") {
    text = msg;
  } else if (msg) {
    const count = typeof params?.count === "number" ? params.count : NaN;
    const rule = Number.isFinite(count) ? pluralRules.select(count) : "other";
    text = msg[rule] ?? msg.other;
  } else {
    text = key;
  }
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (m, name: string) => {
      if (!(name in params)) return m;
      const v = params[name];
      return typeof v === "number" ? v.toLocaleString(currentLocale) : v;
    });
  }
  return text;
}

/**
 * React hook：订阅当前语言，返回 t 与 locale。
 * 语言切换（loadLocale → notify）时所有使用该 hook 的组件自动重渲染。
 */
export function useI18n(): { t: typeof t; locale: Locale } {
  const locale = useSyncExternalStore(subscribe, getLocale, () => currentLocale);
  return { t, locale };
}

/** 当前语言的 vidstack 播放器控件词汇表（英文返回 undefined，走内置英文） */
export function getVidstackTranslations(): VidstackDict | undefined {
  return currentVidstack;
}

/** 同步 <html lang> 与 og:locale（SEO title/description 的刷新由 store 侧负责） */
export function applyLocaleSideEffects(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  const og = document.head.querySelector<HTMLMetaElement>(
    'meta[property="og:locale"]',
  );
  if (og) og.setAttribute("content", OG_LOCALES[locale]);
}

export type { MsgKey };
