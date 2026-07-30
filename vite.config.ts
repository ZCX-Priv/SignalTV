import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 部署域名：构建时由 SITE_ORIGIN 环境变量注入，未设置时回退占位域名
//（与 src/lib/seo.ts 的 PLACEHOLDER_ORIGIN 一致）。页内 meta/JSON-LD 由
// seo.ts 运行时覆写为真实 origin，但 sitemap.xml/robots.txt 是静态文件
// 无运行时可填充，且 Sitemap 协议强制要求 <loc> 为绝对 URL（相对路径
// 会被 Google 直接拒绝解析），故在构建产物阶段完成域名注入
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://signaltv.netlify.app'

// 构建后处理：用绝对 URL 重写 dist/sitemap.xml 的 <loc>，并在
// dist/robots.txt 末尾追加 Sitemap 指令（源文件保持占位设计不动）；
// 同时在 HTML 转换阶段把页内占位域名（og:url/og:image/canonical/hreflang/
// JSON-LD）替换为 SITE_ORIGIN —— 分享卡片抓取器（微信/Facebook/Twitter）
// 不执行 JS，seo.ts 的运行时覆写对它们无效，必须在构建产物中完成注入
// （运行时覆写保留作兜底，两者同源同变量不会漂移）
function seoFilesPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'signaltv:seo-files',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    transformIndexHtml(html) {
      // 占位域即目标域时跳过（split/join 全量替换，含 JSON-LD 内的 URL）
      if (SITE_ORIGIN === 'https://signaltv.netlify.app') return html
      return html.split('https://signaltv.netlify.app').join(SITE_ORIGIN)
    },
    closeBundle() {
      const sitemapPath = resolve(outDir, 'sitemap.xml')
      const robotsPath = resolve(outDir, 'robots.txt')
      try {
        const sitemap = readFileSync(sitemapPath, 'utf-8')
        // 占位 <loc>/</loc>（及历史上可能的占位域名）→ 真实绝对 URL
        writeFileSync(
          sitemapPath,
          sitemap.replace(/<loc>[^<]*<\/loc>/, `<loc>${SITE_ORIGIN}/</loc>`),
        )
      } catch {
        // sitemap 不存在时跳过（不阻断构建）
      }
      try {
        const robots = readFileSync(robotsPath, 'utf-8')
        if (!/^Sitemap:/im.test(robots)) {
          writeFileSync(
            robotsPath,
            `${robots.trimEnd()}\n\n# Sitemap 位置（构建时注入绝对 URL）\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
          )
        }
      } catch {
        // robots 不存在时跳过
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    seoFilesPlugin(),
    VitePWA({
      // prompt 模式：新 SW 安装后进入 waiting，由 src/lib/updater.ts 决定何时激活
      registerType: 'prompt',
      // 关闭插件自动注入的注册脚本，注册统一由 updater.ts 手动接管
      injectRegister: false,
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'SignalTV',
        short_name: 'SignalTV',
        description: '免费在线看电视直播。聚合全球数千路电视频道，无需注册即开即看。',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'any',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-1024x1024.png',
            sizes: '1024x1024',
            type: 'image/png',
          },
          {
            src: '/pwa-1024x1024-maskable.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Google Fonts CSS：内容随 Google 端 UA/优化策略更新，
            // 用 SWR 保鲜（字体二进制仍是 CacheFirst 一年，见下条）
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-css-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts 文件
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // iptv-org API —— StaleWhileRevalidate，离线可读上次频道列表。
            // 过期 30 天：Workbox 对过期条目读取时直接判失效，24h 会使
            // 离线超一天的用户完全无列表；SWR 在线时后台自动刷新，
            // 长过期无新鲜度代价
            urlPattern: /^https:\/\/iptv-org\.github\.io\/api\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'iptv-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // flagcdn 国旗。<img> 无 crossorigin 时响应为 opaque（status 0），
            // Chromium 对每条 opaque 缓存按 ~7MB 计入配额；purgeOnQuotaError
            // 让配额超限时优先清本缓存，而非放任浏览器整源驱逐存储
            //（IndexedDB 里的收藏/历史会被连带清空）
            urlPattern: /^https:\/\/flagcdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'flagcdn-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 频道 logo 图片（png/jpg/webp/svg，允许带 query 的 URL 也命中缓存）。
            // logo 分布在数百个任意第三方主机、几乎全是 opaque 响应（配额
            // 虚胀见上条注释），且 opaque 无法区分成败——上游 404 也会被
            // CacheFirst 缓存，故条目数与过期时长都收敛（7 天自愈坏响应）
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|webp|svg)(\?.*)?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'channel-logos-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
})
