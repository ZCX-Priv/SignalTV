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
  <a href="https://github.com/pmndrs/zustand"><img alt="Zustand" src="https://img.shields.io/badge/Zustand-5.0-000000"></a>
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
- 多视图导航：首页 / 分类 / 国家 / 收藏夹 / 搜索
- 筛选与排序：分类、国家、A-Z、最近观看、NSFW 开关
- 流延迟探测：no-cors GET + 批量并发 8 路，绿/黄/红/灰四级延迟标签
- 双引擎播放器：hls.js 优先，原生 HLS 回退（Safari/iOS），ESC 关闭，相关频道推荐
- 收藏与最近观看：IndexedDB 持久化（zustand persist，DB=`signaltv-db`，key=`signaltv-iptv`）
- 深浅色主题：首次访问跟随系统 `prefers-color-scheme`，手动切换后持久化覆盖
- 响应式布局：桌面侧栏可折叠，移动端抽屉式侧栏
- 全局快捷键：⌘K / Ctrl+K 一键聚焦搜索框
- 无限滚动：IntersectionObserver，每页 60 条
- 播放器懒加载：`lazy()` + `Suspense`，hls.js 仅在打开频道时加载（约 250KB）
- 频道号美学：基于频道 id 哈希生成稳定的 `100.0 ~ 999.9` 频道号

## 技术栈

| 类别 | 技术 | 版本 | 用途 |
|---|---|---|---|
| 框架 | React | 19.2 | UI 渲染 |
| 语言 | TypeScript | 6.0 | 类型安全 |
| 构建 | Vite | 8.1 | 开发服务器 + 打包 |
| 状态 | Zustand | 5.0 | 全局状态 + persist 持久化 |
| 流媒体 | hls.js | 1.6 | HLS 直播流播放 |
| 图标 | lucide-react | 1.23 | 矢量图标 |
| 路由 | react-router-dom | 7.18 | 导航（预留） |
| Lint | Oxlint | 1.71 | 代码检查 |

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
│   └── favicon.png              # 站点图标（Radio 信号塔）
├── src/
│   ├── components/              # UI 组件
│   │   ├── ChannelCard.tsx      # 频道卡片
│   │   ├── ChannelGrid.tsx      # 频道网格 + 无限滚动
│   │   ├── FilterBar.tsx        # 筛选与排序工具栏
│   │   ├── Header.tsx           # 顶栏（Logo / 搜索 / 时钟）
│   │   ├── Hero.tsx             # 首屏精选 + ticker
│   │   ├── LatencyTag.tsx       # 延迟标签（绿/黄/红/灰）
│   │   ├── Loader.tsx           # 加载与错误态
│   │   ├── Logo.tsx             # 品牌 Logo
│   │   ├── PlayerModal.tsx      # 播放器模态
│   │   └── Sidebar.tsx          # 侧边栏（分类/国家/主题）
│   ├── hooks/
│   │   ├── useChannels.ts       # 频道筛选与查询
│   │   └── useHls.ts            # HLS 播放 Hook（hls.js + 原生）
│   ├── lib/
│   │   ├── api.ts               # iptv-org API 封装
│   │   ├── format.ts            # 格式化（时钟/国旗/频道号）
│   │   └── latency.ts           # 流延迟探测
│   ├── store/
│   │   └── useStore.ts          # Zustand 全局状态
│   ├── App.tsx                  # 应用外壳
│   ├── App.css                  # 组件样式
│   ├── index.css                # 设计系统 + 全局样式
│   ├── main.tsx                 # 入口
│   └── types.ts                 # iptv-org 类型定义
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .oxlintrc.json
```

## 架构说明

### 数据流

```text
iptv-org API ──▶ Zustand store ──▶ React 组件
   (fetch)        (channels Map)     (useStore selector)
```

应用启动时，`useStore.init()` 并发拉取 `channels / streams / categories / countries` 四份 JSON，合并为以频道 id 为键的 `Map<string, ChannelWithStream>`，跳过无流的频道，并保留每个频道的流数量。

### 状态管理

使用 Zustand + `persist` 中间件，通过 `src/lib/idb.ts` 自定义 IndexedDB 适配器（DB=`signaltv-db`，store=`kv`），仅持久化以下字段（key=`signaltv-iptv`）：

- `favorites` — 收藏的频道 id
- `recents` — 最近观看（最多 24 条，最新在前）
- `sidebarCollapsed` — 桌面端侧栏折叠状态
- `theme` — 主题（dark / light）

主题初始化逻辑：`main.tsx` 在 React 渲染前 `await` 从 IndexedDB 读取持久化值并同步 `<html data-theme>`，避免首帧深色闪烁；若无持久化值则跟随系统 `prefers-color-scheme`。

数据迁移：首次启动若检测到旧版 localStorage 数据（key=`signaltv-iptv`），自动迁移到 IndexedDB 并清理旧 key，老用户无感知升级。

### 播放器

`useHls` Hook 实现双引擎：

1. 优先检测 `video.canPlayType("application/vnd.apple.mpegurl")`，使用原生 HLS（Safari/iOS）
2. 否则使用 `Hls.isSupported()` 检测，回退到 hls.js（启用 Worker，关闭低延迟模式）
3. 网络错误标记为 fatal 并提示「信号丢失」，媒体错误尝试 `recoverMediaError()`

播放器组件通过 `lazy()` 懒加载，hls.js（约 250KB）仅在打开频道时才进入主包。

### 延迟探测

`probeLatency` 使用 `fetch(url, { mode: "no-cors" })` 测量 TTFB 近似延迟：

- 超时 5 秒返回 `-1`
- `probeBatch` 维护一个并发为 8 的 worker 池，串行消费所有频道
- 结果写入 `store.latency: Map<id, ms>`，由 `LatencyTag` 组件渲染为四级标签：
  - 绿 `< 300ms` / 黄 `300–1000ms` / 红 `> 1000ms` / 灰 `未知或失败`

### 性能

- 播放器懒加载（`lazy` + `Suspense`）
- 频道卡片 `React.memo`，仅在自身 props 变化时重渲染
- IntersectionObserver 无限滚动，每页 60 条，rootMargin 600px 预加载
- 频道 logo 图片 `loading="lazy"`，加载失败时回退到占位符
- 全局快捷键 ⌘K / Ctrl+K 通过 `document.querySelector` 直接聚焦搜索框

## 数据源与致谢

- [iptv-org](https://github.com/iptv-org) — 全球免费 IPTV 频道索引
- [flagcdn.com](https://flagcdn.com) — 国旗图片
- 字体（Google Fonts）：
  - [Fraunces](https://fonts.google.com/specimen/Fraunces) — 衬线 display
  - [Geist](https://fonts.google.com/specimen/Geist) — 无衬线 sans
  - [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — 等宽 mono
  - [Noto Serif SC](https://fonts.google.com/specimen/Noto+Serif+SC) / [Noto Sans SC](https://fonts.google.com/specimen/Noto+Sans+SC) — 中文
- [lucide-react](https://lucide.dev) — 矢量图标

## 许可证

[MIT License](./LICENSE) © 2025 Thinker
