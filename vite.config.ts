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
// dist/robots.txt 末尾追加 Sitemap 指令（源文件保持占位设计不动）
function seoFilesPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'signaltv:seo-files',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
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
            src: '/pwa-512x512-maskable.png',
            sizes: '512x512',
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
            // flagcdn 国旗
            urlPattern: /^https:\/\/flagcdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'flagcdn-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 频道 logo 图片（png/jpg/webp/svg，允许带 query 的 URL 也命中缓存）
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|webp|svg)(\?.*)?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'channel-logos-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
