<div align="center">
  <img src="./public/favicon.png" alt="SignalTV" width="96" height="96" />
  <h1>SignalTV</h1>
  <em>一个广播终端，聚合来自开源 iptv-org 索引的数千路免费电视信号。</em>
  <br>
  <br>
  <a href="https://react.dev"><img alt="React" src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://vite.dev"><img alt="Vite" src="https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite&logoColor=white"></a>
  <a href="https://github.com/video-dev/hls.js"><img alt="hls.js" src="https://img.shields.io/badge/hls.js-1.6-ff3b30"></a>
  <a href="https://vidstack.io"><img alt="@vidstack/react" src="https://img.shields.io/badge/@vidstack/react-1.15-5e6ad0"></a>
  <a href="https://github.com/pmndrs/zustand"><img alt="Zustand" src="https://img.shields.io/badge/Zustand-5.0-000000"></a>
  <a href="https://www.radix-ui.com/primitives/docs/components/select"><img alt="@radix-ui/react-select" src="https://img.shields.io/badge/@radix--ui/react_select-2.3-8b5cf6"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-ff3b30"></a>
</div>

---

## 简介

**SignalTV** 是一个纯前端的 IPTV 广播终端。它从开源的 [iptv-org](https://github.com/iptv-org) 索引拉取全球数千路免费直播频道，并以「广播终端」式的视觉语言呈现：信号红、扫描线、噪点、频道号美学。

- 纯前端单页应用，无后端、无密钥、无跟踪
- 数据源：`https://iptv-org.github.io/api`
- 设计系统：Broadcast Noir（深广播黑 `#0a0a0f` + 暖奶油 `#f5f1e8` + 信号红 `#ff3b30`）
- 字体：Fraunces（display）/ Geist（sans）/ JetBrains Mono（mono）/ Noto Serif SC + Noto Sans SC（中文）

## 功能特性

- 聚合 iptv-org 数千路全球直播频道（合并 channels + streams，跳过无流频道，保留多路流数量）
- 首屏 Hero：编辑式大字标题 + 精选频道卡片 + 滚动 ticker
- 多视图导航：首页 / 分类 / 国家 / 收藏夹 / 搜索 / 状态 / 设置
- 筛选与排序：分类、国家、A-Z、最近观看、延迟升序/降序、NSFW 开关
- 流延迟探测：
  - HLS 流用 cors fetch + `#EXTM3U` 校验真实延迟；非 HLS 流用 no-cors 但因无法验证状态码统一返回 -1（标记为"未知"）
  - 按需探测：`probeLatencyForIds` 由 `ChannelGrid` 的 IntersectionObserver 触发，仅探测可见 + 预加载范围内（rootMargin 600px）的频道
  - 弱网检测：`navigator.connection.effectiveType` 为 2g/slow-2g 或 `saveData === true` 时跳过探测
  - 批量节流：200ms 窗口内合并多次 set 为一次，避免 5000 频道 × `new Map(s.latency)` 的 O(n²) 开销
  - 全量探测持有 `AbortController`，组件卸载或视图切换时取消
  - 绿/黄/红/灰四级延迟标签（`< 300ms` / `300–1000ms` / `> 1000ms` / 未知或失败）
- 播放器：基于 `@vidstack/react` 的 `MediaPlayer` + `DefaultVideoLayout`
  - 本地 hls.js 注入（通过 `provider.library = Hls`，避免 vidstack 默认从 CDN 加载）
  - 五状态机：`idle` → `loading` → `ready` / `paused` / `error`
  - 自动播放失败重试：未静音失败 → 强制静音后重试；已静音仍失败 → 进入 `paused` 状态等待用户点击「点击播放」覆盖层（合法 user gesture 可取消静音）
  - 运行时延迟采样：每秒读取 vidstack provider 的 `hls.latency`（= `estimateLiveEdge() - currentTime`），降级用 `seekable.end - currentTime`
  - `DefaultVideoLayout` 全量中文化（覆盖 DefaultLayoutWord 全部词汇）
  - ESC 关闭，相关频道推荐
- 收藏与最近观看：IndexedDB 持久化（zustand persist，DB=`signaltv-db`，key=`signaltv-iptv`），同时持久化最近使用的分类与国家
- 主题三态：跟随系统（`system`）/ 白昼（`light`）/ 夜间（`dark`）
  - `system` 模式下持续监听 `prefers-color-scheme` 变化自动同步
  - 切换瞬间加 `theme-transitioning` 类强制 `transition-duration: 0s`，双 RAF 后恢复（避免扎眼时差）
  - 首次访问跟随系统偏好，手动切换后持久化覆盖
- 信号源状态面板：连接状态、频道/分类/国家统计、延迟探测进度与可达率
- 设置面板：主题模式三态选择 + 关于信息（频道数、数据源声明）
- 分类/国家选择器模态：侧栏「全部」按钮展开，带搜索框
- 运行时 SEO：视图切换动态更新 `title` / `description` / `canonical` / `og:*` / `twitter:*`；JSON-LD 占位 URL 覆写为真实 origin，部署到任意域名无需重新构建
- 站点级 SEO 文件：`robots.txt`、`sitemap.xml`、`llms.txt`（给 LLM 用的站点描述，便于 ChatGPT / Perplexity / Claude 等抓取）
- Toast 提示系统：成功 / 信息 / 警告多级反馈
- 全局 ErrorBoundary：捕获致命渲染异常避免整页白屏
- 响应式布局：桌面侧栏可折叠，移动端抽屉式侧栏
- 全局快捷键：⌘K / Ctrl+K 一键聚焦搜索框；ESC 关闭播放器
- 无限滚动：IntersectionObserver，每页 60 条
- 播放器懒加载：`lazy()` + `Suspense`，hls.js 仅在打开频道时加载（约 250KB）
- 频道号美学：基于频道 id 哈希生成稳定的 `100.0 ~ 999.9` 频道号
- 频道卡片视觉：纯 CSS 背景叠加实现「渐变底色 + 国旗暗纹水印」（多层 background，由 `mediaStyle` 在 `ChannelCard.tsx` 内联生成）
  - 底色：`countryGradient` 由国家代码哈希生成稳定的双色 HSL 渐变（非法代码回退中性高级灰），纯 CSS、无额外请求
  - 暗纹：`flagSvgUrl` 取 flagcdn 的国旗 **SVG 矢量图（远程加载，额外图片请求）**，作为中间层配合 `background-blend-mode: overlay` 融入底色，隐约透出星条/米字/三色旗纹理
  - 顶层信号红径向高光叠加，保证文字可读性
  - 无 logo（`.card__media:not(:has(.card__logo))`）或 logo 加载失败时（`.card__media--empty`）回退显示频道名 + 国家占位文字（`.card__placeholder`，见 `App.css`）
- 启动期 Fraunces italic 字体加载监听：消除伪斜体→真斜体的视觉跳变，带 2s 超时 fallback
- 首次访问欢迎 Toast（用独立 localStorage key 与 zustand persist 解耦，读取同步无时序问题）
- **PWA 支持**：可安装到桌面/主屏幕，离线访问已缓存的频道列表与静态资源（vite-plugin-pwa + Workbox）

## 技术栈

| 类别 | 技术 | 版本 | 用途 |
|---|---|---|---|
| 框架 | React | 19.2 | UI 渲染 |
| 语言 | TypeScript | 6.0 | 类型安全 |
| 构建 | Vite | 8.1 | 开发服务器 + 打包 |
| 状态 | Zustand | 5.0 | 全局状态 + persist 持久化 |
| 流媒体 | hls.js | 1.6 | HLS 直播流播放 |
| 播放器 | @vidstack/react | 1.15 | MediaPlayer + DefaultVideoLayout + 中文化 |
| 选择器 | @radix-ui/react-select | 2.3 | FilterBar 下拉选择组件 |
| 图标 | lucide-react | 1.23 | 矢量图标 |
| Lint | Oxlint | 1.71 | 代码检查 |
| PWA | vite-plugin-pwa | 1.3 | 离线缓存 + 可安装 |

## 快速开始

### 环境要求

- Node.js（建议 18+）
- npm

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

默认在 `http://localhost:5173` 启动。

### 构建生产版本

```bash
npm run build
```

产物输出到 `dist/`（先执行 `tsc -b` 类型检查，再 `vite build` 打包）。

### 预览构建产物

```bash
npm run preview
```

### 代码检查

```bash
npm run lint
```

基于 Oxlint，配置见 `.oxlintrc.json`。

## 项目结构

```text
Signal-TV/
├── public/
│   ├── favicon.png              # 站点图标（Radio 信号塔，1024×1024 源图）
│   ├── pwa-192x192.png          # PWA 图标 192×192
│   ├── pwa-512x512.png          # PWA 图标 512×512
│   ├── pwa-512x512-maskable.png # PWA maskable 图标（自适应裁剪）
│   ├── llms.txt                 # 给 LLM 用的站点描述
│   ├── robots.txt               # 爬虫指令
│   └── sitemap.xml              # 站点地图
├── src/
│   ├── assets/                      # 静态资源目录（预留）
│   ├── components/
│   │   ├── CategoryPickerModal.tsx  # 分类选择模态（带搜索）
│   │   ├── ChannelCard.tsx          # 频道卡片
│   │   ├── ChannelGrid.tsx          # 频道网格 + 无限滚动 + 按需延迟探测
│   │   ├── CountryPickerModal.tsx   # 国家选择模态（带搜索）
│   │   ├── ErrorBoundary.tsx        # 全局错误边界
│   │   ├── FilterBar.tsx            # 筛选与排序工具栏
│   │   ├── Header.tsx               # 顶栏（Logo / 搜索 / 时钟）
│   │   ├── Hero.tsx                 # 首屏精选 + ticker
│   │   ├── LatencyTag.tsx           # 延迟标签（绿/黄/红/灰）
│   │   ├── Loader.tsx               # 加载与错误态
│   │   ├── Logo.tsx                 # 品牌 Logo
│   │   ├── PlayerModal.tsx          # 播放器模态（懒加载）
│   │   ├── Select.tsx               # Radix Select 封装
│   │   ├── SettingsPanel.tsx        # 设置面板（主题模式 / 关于）
│   │   ├── Sidebar.tsx              # 侧边栏（首页 / 收藏 / 分类 / 国家 / 状态 / 设置）
│   │   ├── StatusPanel.tsx          # 信号源状态面板
│   │   ├── Toaster.tsx              # Toast 通知容器
│   │   └── TvPlayer.tsx             # vidstack 播放器（本地 hls.js 注入）
│   ├── hooks/
│   │   └── useChannels.ts           # 频道筛选 / 查询 / 排序
│   ├── lib/
│   │   ├── api.ts                   # iptv-org API 封装（超时 + 重试 + 指数退避）
│   │   ├── categoryIcon.ts          # 分类 id → lucide 图标映射
│   │   ├── format.ts                # 格式化（时钟 / 国旗 / 频道号 / 分类名 / 国旗 SVG 暗纹 / 国家渐变）
│   │   ├── idb.ts                   # IndexedDB 适配器 + 一次性数据迁移
│   │   ├── latency.ts               # 流延迟探测（HLS cors + 非 HLS no-cors）
│   │   ├── seo.ts                   # 运行时 SEO（动态 meta + JSON-LD 覆写）
│   │   └── toast.ts                 # Toast 事件总线
│   ├── store/
│   │   └── useStore.ts              # Zustand 全局状态 + persist
│   ├── App.tsx                      # 应用外壳
│   ├── App.css                      # 组件样式
│   ├── index.css                    # 设计系统 + 全局样式
│   ├── main.tsx                     # 入口（bootstrap：迁移 / 主题 / SEO / 字体 / 挂载）
│   └── types.ts                     # iptv-org 类型定义
├── index.html                       # 含静态 SEO meta + JSON-LD + 主题 FOUC 内联脚本
├── package.json
├── tsconfig.json
├── vite.config.ts                   # Vite + vite-plugin-pwa 配置
└── .oxlintrc.json
```

## 架构说明

### 启动流程

`main.tsx` 的 `bootstrap()` 按以下顺序执行：

1. `initFrauncesItalic()`：尽早启动 Fraunces italic 字体加载监听，与后续初始化并行，不阻塞渲染。就绪后给 `<html>` 添加 `fonts-fraunces-italic-ready` 类，触发 `.loader__title em` / `.hero__title em` 从 normal 切换为 italic（带 2s 超时 fallback）
2. 并行执行 `migrateFromLocalStorage`（旧 localStorage → IDB 一次性迁移）与 `getInitialTheme`（从 IDB 读取持久化主题），比串行快约 2x
3. 通过 `setTheme` action 把 theme 写回 store（action 内部调用 `syncThemeCache` 同步 `<html data-theme>` + localStorage 缓存，所有 theme 变更点走统一路径）
4. `initSeo()`：用真实 origin 覆写 JSON-LD 占位 URL，写入首页默认 meta
5. 挂载 React（全局 `ErrorBoundary` 包裹，捕获致命渲染异常避免整页白屏）

`index.html` 内联同步脚本在 React 渲染前从 localStorage 读取 `signaltv-theme-cache` 并写入 `<html data-theme>`，避免首帧深色闪烁（FOUC）；localStorage 不可用（隐私模式）时静默失败，回落到 `prefers-color-scheme`。

### 数据流

```text
iptv-org API ──▶ Zustand store ──▶ React 组件
   (fetch)        (channels Map)     (useStore selector)
```

应用启动时，`useStore.init()` 并发拉取 `channels / streams / categories / countries` 四份 JSON，合并为以频道 id 为键的 `Map<string, ChannelWithStream>`，跳过无流的频道，并保留每个频道的流数量。

API 请求带超时（默认 15s，`channels.json` / `streams.json` 放宽到 30s）+ 指数退避重试（最多 2 次，500ms → 1000ms）。仅 5xx 与 429 视为可重试，4xx 不重试；JSON 解析失败不重试。

### 状态管理

使用 Zustand + `persist` 中间件，通过 `src/lib/idb.ts` 自定义 IndexedDB 适配器（DB=`signaltv-db`，store=`kv`），仅持久化以下字段（key=`signaltv-iptv`）：

- `favorites` — 收藏的频道 id
- `recents` — 最近观看（最多 24 条，最新在前）
- `recentCategories` — 最近使用的分类 id（最多 24 条，最新在前）
- `recentCountries` — 最近使用的国家 code（最多 24 条，最新在前）
- `sidebarCollapsed` — 桌面端侧栏折叠状态
- `theme` — 实际渲染主题（dark / light），由 `themeMode` 派生
- `themeMode` — 用户主题偏好（system / light / dark）

主题初始化逻辑：

- `index.html` 内联同步脚本：从 localStorage 读取 `signaltv-theme-cache` 写入 `<html data-theme>`，避免 React 挂载前的 FOUC
- `main.tsx` bootstrap：并行执行 `migrateFromLocalStorage` 与 `getInitialTheme`，随后通过 `setTheme` 写回 store
- `syncThemeCache`：所有 theme 变更点（`setTheme` / `setThemeMode` / `onRehydrateStorage`）统一同步 `<html data-theme>` + localStorage 缓存（localStorage 不可用时静默失败，IDB persist 仍是 source of truth）
- `disableTransitionsBriefly`：切换瞬间加 `theme-transitioning` 类强制 `transition-duration: 0s`，双 RAF 后移除（兜底 100ms 强制清理，防止类永久残留导致动画失效）
- `prefers-color-scheme` 监听器：仅 `themeMode === "system"` 时自动同步实际渲染 theme；light/dark 显式偏好不受系统切换影响
- `onRehydrateStorage`：旧版持久化数据没有 `themeMode` → 从 `theme` 推断（保留老用户的实际偏好）

数据迁移：首次启动若检测到旧版 localStorage 数据（key=`signaltv-iptv`），自动迁移到 IndexedDB 并清理旧 key，老用户无感知升级。

### 播放器

`src/components/TvPlayer.tsx` 基于 `@vidstack/react`：

1. 使用 `MediaPlayer` + `DefaultVideoLayout` 组件，`streamType="live"` + `autoPlay` + `muted`
2. `onProviderChange` 中检测 `isHLSProvider(provider)` 后注入 `provider.library = Hls`（本地 hls.js 实例，避免 vidstack 默认从 CDN 加载）
3. 五状态机：`idle` → `loading` → `ready` / `paused` / `error`
4. `onCanPlay`：进入 `ready` 状态，启动每秒一次的延迟采样
5. `onAutoPlayFail`：未静音失败 → 强制静音后重试；已静音仍失败 → 进入 `paused` 状态等待用户点击「点击播放」覆盖层（合法 user gesture 可取消静音）。延迟到下一个事件循环检查 player 实际状态，避免「播放成功但 `onAutoPlayFail` 仍被触发」的误判
6. `onError`：进入 `error` 状态，显示「信号丢失」覆盖层 + 错误消息（许多免费信号受地区限制或间歇性离线）
7. 延迟采样：优先读 vidstack provider 的 `hls.latency`（= `estimateLiveEdge() - currentTime`），降级用 `seekable.end - currentTime`；视频未就绪或未播放时保持 null 避免误判
8. `DefaultVideoLayout` 全量中文化（覆盖 DefaultLayoutWord 全部词汇）

播放器组件 `PlayerModal` 通过 `lazy()` 懒加载，hls.js（约 250KB）仅在打开频道时才进入主包。`PlayerModal` 还负责 ESC 关闭、收藏快捷操作、相关频道推荐（同主分类、不同 id）。

### 延迟探测

`src/lib/latency.ts` 的 `probeLatency` 根据流类型走双路径探测：

- HLS 流（`.m3u8`）：`fetch(url, { mode: "cors" })` 校验状态码 + 前 16 字节是否 `#EXTM3U`，超时 3 秒返回 `-1`
- 非 HLS 流（`.mp4`/`.flv` 等）：`fetch(url, { mode: "no-cors" })`，因 opaque 响应无法区分 404/200，统一返回 `-1`（标记为"未知"），避免把死链标记为低延迟误导用户

`probeBatch` 维护一个并发为 16 的 worker 池，串行消费所有频道，结果写入 `store.latency: Map<id, ms>`，由 `LatencyTag` 组件渲染为四级标签：

- 绿 `< 300ms` / 黄 `300–1000ms` / 红 `> 1000ms` / 灰 `未知或失败`

探测调度策略：

- **按需探测**：`probeLatencyForIds` 由 `ChannelGrid` 的 IntersectionObserver 触发，仅探测可见 + 预加载范围内（rootMargin 600px）的频道，避免全量探测挤占首屏带宽
- **弱网检测**：`navigator.connection.effectiveType` 为 `slow-2g` / `2g` 或 `saveData === true` 时跳过探测（Safari/Firefox 不支持 Network Information API 时不阻断功能）
- **全量探测**：`runLatencyProbe` 持有 `AbortController`，组件卸载或视图切换时取消；与 `probeLatencyForIds` 共享 `existing` 检查避免重复探测
- **批量节流**：`batchSetLatency` 在 200ms 窗口内合并多次 `setLatency` 为一次 `set`，避免 5000 频道 × `new Map(s.latency)` 的 O(n²) 开销
- **外部取消**：`probeLatency` 接受可选 `AbortSignal`，与内部超时控制器联动，外部 abort 时立即返回 `-1`

### 性能

- 播放器懒加载（`lazy` + `Suspense`）
- 频道卡片 `React.memo`，仅在自身 props 变化时重渲染
- IntersectionObserver 无限滚动，每页 60 条，rootMargin 600px 预加载
- 频道 logo 图片 `loading="lazy"`，加载失败时回退到占位符
- 全局快捷键 ⌘K / Ctrl+K 通过 `document.querySelector` 直接聚焦搜索框
- **条件订阅 latency Map**：`useFilteredChannels` 仅在 `sort` 为 `latency-asc` / `latency-desc` 时才订阅整个 `latency` Map，避免 200ms flush 引发 O(n²) 重渲染
- **`sort=recent` 优化**：用 Map 索引替代 `indexOf` O(n) 查找
- **`useCallback` 稳定 Picker Modal 的 `onClose` 引用**：避免 Sidebar 重渲染时清空搜索框（useState 返回的 setter 引用永不变化，依赖数组可空）
- **批量节流 latency 更新**：见上方「延迟探测」

### SEO

应用在 `index.html` 中静态写入完整 SEO 元信息（`title` / `description` / `keywords` / Open Graph / Twitter Card / JSON-LD `WebApplication` + `Organization` + `FAQPage`），并在运行时通过 `src/lib/seo.ts` 动态维护：

- `initSeo()`：应用启动时调用一次，用真实 `window.location.origin` 覆写 JSON-LD 中的占位 URL `https://signaltv.app/`，同步 `canonical` / `og:url` / `og:image` / `twitter:image` / `hreflang`，部署到任意域名无需重新构建
- `applySeo(meta)`：视图切换时由 `useStore.setView` 调用，动态更新 `title` / `description` / `canonical` / `og:*` / `twitter:*`
- `describeView(view, filter, ctx)`：根据当前视图（home / category / country / favorites / search / status / settings）生成对应的 title / description / canonical，包含频道数等动态文案
- 站点级 SEO 文件：
  - `public/robots.txt` — 爬虫指令
  - `public/sitemap.xml` — 站点地图
  - `public/llms.txt` — 给 LLM 用的站点描述，便于 ChatGPT / Perplexity / Claude 等抓取

### PWA 与离线缓存

应用通过 [vite-plugin-pwa](https://vite-plugin-pwa.netlify.app/) 配置为渐进式 Web 应用：

- **可安装**：支持添加到桌面/主屏幕，独立窗口运行（`display: standalone`）
- **Service Worker**：`registerType: 'autoUpdate'`，新版本自动激活
- **预缓存**：构建产物（JS/CSS/HTML/图标/字体文件）首次访问后离线可用
- **运行时缓存策略**：

  | 资源 | 策略 | 缓存时长 | 说明 |
  |---|---|---|---|
  | Google Fonts CSS/字体 | CacheFirst | 1 年 | 字体不变，长期缓存 |
  | iptv-org API | StaleWhileRevalidate | 1 天 | 离线可读上次频道列表，在线时后台更新 |
  | flagcdn 国旗 | CacheFirst | 30 天 | 国旗图片稳定 |
  | 频道 logo | CacheFirst | 30 天 | 频道 logo 较稳定 |

- **HLS 实时流不缓存**：.m3u8/.ts 不匹配任何缓存规则，避免占用存储
- **主题色**：`#0a0a0f`（深广播黑），与 `index.html` 的 `<meta name="theme-color">` 一致
- **开发模式支持**：`npm run dev` 下也启用开发用 Service Worker，便于实时调试 PWA 行为（生产构建用 `npm run build` 生成最终 SW）

## 数据源与致谢

- [iptv-org](https://github.com/iptv-org) — 全球免费 IPTV 频道索引
- [flagcdn.com](https://flagcdn.com) — 国旗图片
- 字体（Google Fonts）：
  - [Fraunces](https://fonts.google.com/specimen/Fraunces) — 衬线 display
  - [Geist](https://fonts.google.com/specimen/Geist) — 无衬线 sans
  - [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — 等宽 mono
  - [Noto Serif SC](https://fonts.google.com/specimen/Noto+Serif+SC) / [Noto Sans SC](https://fonts.google.com/specimen/Noto+Sans+SC) — 中文
- [@vidstack/react](https://vidstack.io) — 播放器框架（MediaPlayer + DefaultVideoLayout）
- [@radix-ui/react-select](https://www.radix-ui.com/primitives/docs/components/select) — Select 下拉组件
- [hls.js](https://github.com/video-dev/hls.js) — HLS 流媒体引擎
- [lucide-react](https://lucide.dev) — 矢量图标
- [vite-plugin-pwa](https://vite-plugin-pwa.netlify.app/) — PWA 集成（Service Worker + Web App Manifest）
- [Workbox](https://developer.chrome.com/docs/workbox) — 运行时缓存策略

## 许可证

[MIT License](./LICENSE) © 2025 Thinker
