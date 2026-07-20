// 运行时 SEO 工具：在 SPA 视图切换时动态更新 title/description/canonical/og:*
// 并把 index.html 中静态 JSON-LD 的占位 URL（https://signaltv.app/）覆写为真实 origin
// 让部署到任意域名都能输出正确的绝对 URL，无需重新构建

import type { Category, ChannelWithStream, CountryInfo } from "../types";
import type { Filter, View } from "../store/useStore";

export const SITE_NAME = "SignalTV";
export const SITE_TAGLINE = "免费在线看电视直播";

/** index.html 中静态写入的占位 origin，运行时会被覆写为真实 origin */
export const PLACEHOLDER_ORIGIN = "https://signaltv.app";

/** 运行时获取真实 origin（SSR / 构建环境回落到占位符） */
export function getSiteOrigin(): string {
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return PLACEHOLDER_ORIGIN;
}

/** 首页基础文案（与 index.html 中的 meta 保持一致） */
const HOME_TITLE = "SignalTV - 免费在线看电视直播频道";
const HOME_DESCRIPTION =
  "SignalTV 是一个免费在线看电视直播的网站，聚合全球数千路电视频道，涵盖新闻、电影、体育、音乐、纪录片等分类，无需注册即开即看。";

export interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
}

/** describeView 所需的上下文数据，由调用方从 store 中传入，避免循环依赖 */
export interface SeoContext {
  categories: Category[];
  countries: CountryInfo[];
  channels: Map<string, ChannelWithStream>;
}

/** 数字带千位分隔符 */
function fmtCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** 统计某分类下的频道数 */
function countByCategory(catId: string, channels: Map<string, ChannelWithStream>): number {
  let n = 0;
  for (const c of channels.values()) {
    if (c.is_nsfw) continue;
    if (c.categories.includes(catId)) n++;
  }
  return n;
}

/** 统计某国家下的频道数 */
function countByCountry(code: string, channels: Map<string, ChannelWithStream>): number {
  let n = 0;
  for (const c of channels.values()) {
    if (c.is_nsfw) continue;
    if (c.country === code) n++;
  }
  return n;
}

/** 根据当前视图生成对应的 title / description / canonical */
export function describeView(
  view: View,
  _filter: Filter,
  ctx: SeoContext,
): SeoMeta {
  const origin = getSiteOrigin();
  const canonical = `${origin}/`;

  switch (view.kind) {
    case "home": {
      return { title: HOME_TITLE, description: HOME_DESCRIPTION, canonical };
    }

    case "category": {
      const cat = ctx.categories.find((c) => c.id === view.id);
      const name = cat?.name ?? view.id;
      const count = countByCategory(view.id, ctx.channels);
      const title =
        count > 0
          ? `${name}频道 - 免费在线看${name}电视直播 | ${SITE_NAME}`
          : `${name}频道 - 免费在线看电视直播 | ${SITE_NAME}`;
      const description =
        count > 0
          ? `在线观看 ${fmtCount(count)} 路${name}电视直播频道，免费即开即看，覆盖全球${name}内容。`
          : `在线观看${name}电视直播频道，免费即开即看，覆盖全球${name}内容。`;
      return { title, description, canonical };
    }

    case "country": {
      const country = ctx.countries.find((c) => c.code === view.code);
      const name = country?.name ?? view.code;
      const count = countByCountry(view.code, ctx.channels);
      const title =
        count > 0
          ? `${name}电视频道 - 在线看${name}直播电视 | ${SITE_NAME}`
          : `${name}电视频道 - 在线看电视直播 | ${SITE_NAME}`;
      const description =
        count > 0
          ? `在线观看来自${name}的 ${fmtCount(count)} 路电视直播频道，免费即开即看。`
          : `在线观看来自${name}的电视直播频道，免费即开即看。`;
      return { title, description, canonical };
    }

    case "favorites": {
      return {
        title: `我的收藏频道 | ${SITE_NAME}`,
        description: `在 ${SITE_NAME} 收藏的电视频道列表，可一键继续观看。`,
        canonical,
      };
    }

    case "search": {
      const q = view.q.trim().slice(0, 60);
      return {
        title: q ? `搜索"${q}"的电视频道结果 | ${SITE_NAME}` : `${SITE_NAME} - 免费在线看电视直播`,
        description: q
          ? `在 ${SITE_NAME} 中搜索"${q}"匹配的电视直播频道，免费在线观看。`
          : HOME_DESCRIPTION,
        canonical,
      };
    }

    case "status": {
      return {
        title: `信号源状态 | ${SITE_NAME}`,
        description: `${SITE_NAME} 信号源状态：连接状态、频道统计、延迟探测进度与数据源说明。`,
        canonical,
      };
    }

    case "settings": {
      return {
        title: `设置 | ${SITE_NAME}`,
        description: `${SITE_NAME} 设置中心：主题模式（跟随系统 / 白昼 / 夜间）与应用信息。`,
        canonical,
      };
    }
  }
}

/** 找到或创建一个 meta 标签并设置 content */
function setMeta(selector: string, attr: "name" | "property", key: string, content: string): void {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** 找到或更新一个 link 标签的 href */
function setLinkHref(rel: string, href: string): void {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** 将 SEO 元信息写入 DOM：title、description、canonical、og:*、twitter:* */
export function applySeo(meta: SeoMeta): void {
  if (typeof document === "undefined") return;

  document.title = meta.title;

  setMeta('meta[name="description"]', "name", "description", meta.description);

  // canonical
  setLinkHref("canonical", meta.canonical);

  // Open Graph
  setMeta('meta[property="og:title"]', "property", "og:title", meta.title);
  setMeta('meta[property="og:description"]', "property", "og:description", meta.description);
  setMeta('meta[property="og:url"]', "property", "og:url", meta.canonical);

  // Twitter Card
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);
}

/** 把 JSON-LD 中的占位 URL 替换为真实 origin（覆盖 index.html 中的静态值） */
export function rewriteJsonLdUrls(): void {
  if (typeof document === "undefined") return;
  const origin = getSiteOrigin();
  if (origin === PLACEHOLDER_ORIGIN) return;

  const scripts = document.head.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  scripts.forEach((script) => {
    const raw = script.textContent;
    if (!raw) return;
    if (!raw.includes(PLACEHOLDER_ORIGIN)) return;
    const next = raw.split(PLACEHOLDER_ORIGIN).join(origin);
    if (next !== raw) script.textContent = next;
  });
}

/**
 * 应用启动时调用一次：
 * 1) 用真实 origin 覆写 JSON-LD 中的占位 URL
 * 2) 同步 og:url / canonical / og:image / twitter:image / hreflang 为真实 origin
 * 3) 写入首页默认 SEO 元信息
 */
export function initSeo(): void {
  if (typeof document === "undefined") return;

  rewriteJsonLdUrls();

  const origin = getSiteOrigin();
  if (origin !== PLACEHOLDER_ORIGIN) {
    // 同步静态 link/meta 中的绝对 URL
    setLinkHref("canonical", `${origin}/`);
    setLinkHref("alternate", `${origin}/`);
    // hreflang="x-default" 的 link 也需要更新——通过遍历所有 alternate
    const alternates = document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="alternate"][hreflang]',
    );
    alternates.forEach((el) => el.setAttribute("href", `${origin}/`));

    // OG / Twitter 图像 URL
    setMeta('meta[property="og:url"]', "property", "og:url", `${origin}/`);
    setMeta('meta[property="og:image"]', "property", "og:image", `${origin}/pwa-512x512.png`);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", `${origin}/pwa-512x512.png`);
  }

  // 写入首页默认 SEO（与 index.html 中的静态值保持一致，确保动态注入路径就绪）
  applySeo({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    canonical: `${origin}/`,
  });
}
