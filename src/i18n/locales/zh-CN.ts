// 简体中文语言包（源字典）：
// 所有其他语言包以本文件派生的 Dict / VidstackDict 类型为约束，
// TypeScript 编译期保证 8 种语言 key 完全一致、零遗漏。
//
// 消息值两种形态：
// - string：普通消息，支持 {name} 插值
// - Plural：按 Intl.PluralRules 选择分支（中文无复数，全部用 string）

/** 复数消息：按 CLDR 复数类别取分支，other 为必填兜底 */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type Msg = string | Plural;

export const dict = {
  // ── 通用 ──
  "common.channelPos": "频道 {pos}",
  "common.live": "直播",
  "common.liveNow": "直播中",
  "common.favAdd": "加入收藏",
  "common.favRemove": "移出收藏",
  "common.fav": "收藏",
  "common.faved": "已收藏",
  "common.independent": "独立",
  "common.retry": "重试",
  "common.close": "关闭",
  "common.clear": "清除",
  "common.channel": "频道",

  // ── 顶栏 ──
  "header.menuClose": "关闭菜单",
  "header.menuOpen": "打开菜单",
  "header.sidebarExpand": "展开侧边栏",
  "header.sidebarCollapse": "收起侧边栏",
  "header.searchPlaceholder": "搜索频道、电视台、国家…",
  "header.searchAria": "搜索频道",
  "header.searchClear": "清除搜索",
  "header.search": "搜索",
  "header.liveCountSuffix": "路信号直播中",

  // ── 侧边栏 ──
  "sidebar.home": "首页",
  "sidebar.favorites": "收藏夹",
  "sidebar.history": "播放历史",
  "sidebar.categories": "分类",
  "sidebar.countries": "国家",
  "sidebar.all": "全部",
  "sidebar.allCategoriesAria": "查看全部分类",
  "sidebar.allCountriesAria": "查看全部国家",
  "sidebar.status": "状态",
  "sidebar.settings": "设置",

  // ── toast 提示 ──
  "toast.backHome": "已返回首页",
  "toast.gotoFavorites": "已切换至收藏页",
  "toast.gotoHistory": "已切换至播放历史",
  "toast.gotoStatus": "已切换至状态页",
  "toast.gotoSettings": "已切换至设置页",
  "toast.switchedChannel": "已切换至{name}频道",
  "toast.favAdded": "已加入收藏夹",
  "toast.favRemoved": "已移出收藏夹",
  "toast.categoryCleared": "已清除分类筛选",
  "toast.categorySet": "分类：{name}",
  "toast.countryCleared": "已清除国家筛选",
  "toast.countrySet": "国家：{name}",
  "toast.sortSet": "排序：{name}",
  "toast.nsfwOn": "已开启成人内容显示",
  "toast.nsfwOff": "已隐藏成人内容",
  "toast.historyCleared": "已清空播放历史",
  "toast.themeSwitched": "已切换至{name}模式",
  "toast.langSwitched": "已切换至{name}",
  "toast.updateModeSwitched": "更新方式：{name}",
  "toast.streamFailover": "当前流不可用，已切换备用信号源",
  "toast.welcome": "欢迎来到 SignalTV",
  "toast.loading": "加载中",

  // ── 首屏 Hero ──
  "hero.title1": "世界，",
  "hero.title2": "实时调频。",
  "hero.lede1": "聚合全球",
  "hero.lede2": "路免费电视频道，涵盖新闻、电影、体育、音乐、纪录片等分类，无需注册即开即看。",
  "hero.tuneIn": "调频至精选",
  "hero.featured": "精选",
  "hero.rec": "● 录制",
  "hero.nowPlaying": "正在播放",

  // ── 筛选栏 ──
  "filter.eyebrow": "节目指南",
  "filter.searchResults": "“{q}” 的搜索结果",
  "filter.allChannels": "全部频道",
  "filter.categoryFallback": "分类",
  "filter.countryFallback": "国家",
  "filter.favorites": "收藏夹",
  "filter.countFavorites": "{count} 个收藏",
  "filter.countSignals": "{count} 路信号",
  "filter.categoryAria": "分类筛选",
  "filter.countryAria": "国家筛选",
  "filter.sortAria": "排序方式",
  "filter.allCategories": "全部分类",
  "filter.allCountries": "全部国家",
  "filter.nsfwTitle": "包含成人内容",
  "filter.nsfwShown": "已显示成人内容",
  "filter.nsfwHidden": "已隐藏成人内容",

  // ── 排序选项 ──
  "sort.default": "默认",
  "sort.country": "国家",
  "sort.recent": "最近观看",
  "sort.latencyAsc": "延迟：低 → 高",
  "sort.latencyDesc": "延迟：高 → 低",
  "sort.nsfwFirst": "成人内容优先",

  // ── 频道网格 ──
  "grid.emptyTitle": "无信号。",
  "grid.emptyDesc": "没有频道匹配当前筛选条件，请尝试扩大搜索范围。",
  "grid.loadingMore": "正在加载 {count} 路信号…",
  "grid.footer": "显示 {total} 路信号中的 {shown} 路",

  // ── 频道卡片 ──
  "card.nsfw": "成人",

  // ── 播放历史 ──
  "history.eyebrow": "播放记录",
  "history.title": "播放历史",
  "history.countRecords": "{count} 条记录",
  "history.clear": "清空历史",
  "history.emptyTitle": "暂无播放记录。",
  "history.emptyDesc": "播放任意频道后，这里会以时间线形式实时记录每一次收看。",
  "history.noMatchTitle": "无匹配记录。",
  "history.noMatchDesc": "没有播放记录匹配当前筛选条件，请尝试更换分类或国家。",
  "history.replay": "重新播放 {name}",
  "history.gone": "频道已下线",

  // ── 状态页 ──
  "status.eyebrow": "信号源",
  "status.title": "状态",
  "status.connError": "上行链路异常",
  "status.connLoading": "正在建立上行链路",
  "status.connOk": "上行链路已建立",
  "status.connIdle": "待命",
  "status.connection": "连接",
  "status.connectionDesc": "当前信号源数据加载状态。",
  "status.connSub": "公共电视信号源 · iptv-org",
  "status.data": "数据",
  "status.dataDesc": "已加载的频道、分类与国家数量。",
  "status.statChannels": "路频道",
  "status.statCategories": "个分类",
  "status.statCountries": "个国家",
  "status.probe": "延迟探测",
  "status.probeDesc": "对可见频道进行延迟测量，用于按延迟排序。",
  "status.probeStatus": "状态",
  "status.probeReady": "已就绪",
  "status.probeIdle": "未启动",
  "status.probed": "已探测",
  "status.probedCount": "{count} 路",
  "status.reachable": "可达",
  "status.reachableValue": "{count} 路 ({pct}%)",

  // ── 设置页 ──
  "settings.eyebrow": "控制台",
  "settings.title": "设置",
  "settings.appearance": "外观",
  "settings.appearanceDesc": "选择主题模式，影响整体配色与氛围。",
  "settings.language": "语言",
  "settings.languageDesc": "选择界面语言，默认跟随浏览器自动检测。",
  "settings.langAuto": "自动检测",
  "settings.langAutoDesc": "跟随浏览器语言（当前：{name}）",
  "settings.about": "关于",
  "settings.githubAria": "GitHub 仓库",
  "settings.tagline": "公共电视信号源 · 免费在线直播",
  "settings.channelsCount": "{count} 路频道",
  "settings.noSignup": "无注册 · 无广告 · 无追踪",
  "settings.dataSource": "频道数据来自公开的 iptv-org 开源项目，本站不存储、不转发任何视频流。",
  "settings.updates": "更新",
  "settings.updatesDesc": "选择发现新版本时的处理方式。",

  // ── 更新选项与更新 toast ──
  "update.auto": "自动更新",
  "update.autoDesc": "后台静默安装，下次打开生效",
  "update.manual": "手动更新",
  "update.manualDesc": "发现新版本时弹出提示，由你决定",
  "update.off": "关闭更新",
  "update.offDesc": "不检查新版本",
  "update.available": "有新版本可用，是否更新？",
  "update.actionUpdate": "更新",
  "update.actionIgnore": "忽略",
  "update.downloading": "正在下载新版本…",
  "update.ready": "新版本已就绪",
  "update.actionReload": "刷新页面 ({s}s)",

  // ── 主题选项 ──
  "theme.system": "跟随系统",
  "theme.systemDesc": "随操作系统自动切换",
  "theme.light": "白昼",
  "theme.lightDesc": "暖米色底，明亮舒适",
  "theme.dark": "夜间",
  "theme.darkDesc": "广播黑底，沉浸氛围",

  // ── 语言名称（以当前界面语言显示的各语言名） ──
  "lang.zh-CN": "简体中文",
  "lang.en": "英语",
  "lang.de": "德语",
  "lang.fr": "法语",
  "lang.ja": "日语",
  "lang.ru": "俄语",
  "lang.es": "西班牙语",
  "lang.ko": "韩语",

  // ── 播放器弹窗 ──
  "player.dialogAria": "正在播放 {name}",
  "player.signalLocked": "信号已锁定",
  "player.connecting": "连接中",
  "player.connectFailed": "连接失败",
  "player.closeAria": "关闭播放器",
  "player.website": "官网",
  "player.factChannel": "频道号",
  "player.factCountry": "国家",
  "player.factStreams": "流数量",
  "player.factLaunched": "开播",
  "player.related": "相关信号",
  "player.loadFailed": "播放器加载失败，请关闭后重试。",

  // ── 播放器内核覆盖层 ──
  "tv.acquiring": "正在获取信号…",
  "tv.tapToPlayAria": "点击开始播放",
  "tv.tapToPlay": "点击播放",
  "tv.tapToPlayHint": "浏览器策略要求手动启动",
  "tv.signalLost": "信号丢失",
  "tv.mixedContent": "浏览器安全策略拦截了非加密（http）信号源，无法在当前页面播放。",
  "tv.unavailable": "此直播流不可用。",
  "tv.triedStreams": "已尝试 {tried}/{total} 路流，均无法播放。",
  "tv.regionHint": "许多免费信号受地区限制或间歇性离线，请尝试同一电视台的其他频道。",
  "tv.startFailed": "无法启动播放，请重试或切换频道。",

  // ── 通知容器 ──
  "toaster.region": "通知",
  "toaster.closeAria": "关闭通知",

  // ── 首屏 Loader ──
  "loader.sub": "正在建立上行链路 · 公共电视信号源",
  "loader.logConnect": "正在连接信号源",
  "loader.logChannels": "正在拉取频道表",
  "loader.logStreams": "正在拉取信号流",
  "loader.logSync": "正在同步广播网格",
  "loader.size": "已下载 {size}",
  "loader.speed": "速率 {speed}",
  "loader.failTitle1": "上行链路",
  "loader.failTitle2": "失败",
  "loader.retryConnection": "重试连接",

  // ── 加载阶段（store.init 写入，Loader 渲染时翻译） ──
  "stage.merging": "正在合并信号表…",

  // ── ErrorBoundary ──
  "errb.title1": "信号",
  "errb.title2": "中断",
  "errb.unknown": "未知渲染错误",

  // ── 选择弹窗 ──
  "picker.recent": "最近点击",
  "picker.searchCategories": "搜索分类…",
  "picker.searchCategoriesAria": "搜索分类",
  "picker.noCategories": "未找到匹配的分类",
  "picker.searchCountries": "搜索国家或地区代码…",
  "picker.searchCountriesAria": "搜索国家",
  "picker.noCountries": "未找到匹配的国家",

  // ── API 错误 ──
  "api.requestFailed": "请求失败 {url}: {status}",
  "api.timeout": "请求超时 {url}",
  "api.cancelled": "请求被取消",
  "api.readFailed": "响应读取失败 {url}",
  "api.parseFailed": "响应解析失败 {url}（非 JSON 格式）",
  "api.loadFailed": "加载广播数据失败。",

  // ── 日期格式 ──
  "format.today": "今天",
  "format.yesterday": "昨天",

  // ── SEO（title / description 模板） ──
  "seo.homeTitle": "SignalTV - 免费在线看电视直播频道",
  "seo.homeDesc":
    "SignalTV 是一个免费在线看电视直播的网站，聚合全球数千路电视频道，涵盖新闻、电影、体育、音乐、纪录片等分类，无需注册即开即看。",
  "seo.categoryTitle": "SignalTV | {name}频道",
  "seo.categoryDescCount":
    "在线观看 {count} 路{name}电视直播频道，免费即开即看，覆盖全球{name}内容。",
  "seo.categoryDesc": "在线观看{name}电视直播频道，免费即开即看，覆盖全球{name}内容。",
  "seo.countryTitle": "SignalTV | {name}电视频道",
  "seo.countryDescCount": "在线观看来自{name}的 {count} 路电视直播频道，免费即开即看。",
  "seo.countryDesc": "在线观看来自{name}的电视直播频道，免费即开即看。",
  "seo.favoritesTitle": "SignalTV | 我的收藏频道",
  "seo.favoritesDesc": "在 SignalTV 收藏的电视频道列表，可一键继续观看。",
  "seo.historyTitle": "SignalTV | 播放历史",
  "seo.historyDesc": "在 SignalTV 的播放历史时间线，回顾并重新播放看过的电视频道（仅本地保存）。",
  "seo.statusTitle": "SignalTV | 信号源状态",
  "seo.statusDesc": "SignalTV 信号源状态：连接状态、频道统计、延迟探测进度与数据源说明。",
  "seo.settingsTitle": "SignalTV | 设置",
  "seo.settingsDesc": "SignalTV 设置中心：主题模式、界面语言与应用信息。",
  "seo.searchTitle": "SignalTV | 搜索“{q}”的电视频道结果",
  "seo.searchDesc": "在 SignalTV 中搜索“{q}”匹配的电视直播频道，免费在线观看。",
} satisfies Record<string, Msg>;

/** 全部消息 key（其余语言包以此约束完整性） */
export type MsgKey = keyof typeof dict;

/** 语言包类型：key 必须与 zh-CN 完全一致 */
export type Dict = Record<MsgKey, Msg>;

// vidstack DefaultVideoLayout 中文翻译（覆盖 DefaultLayoutWord 全部词汇）
export const vidstack = {
  "Announcements": "通知",
  "Accessibility": "无障碍",
  "AirPlay": "AirPlay",
  "Audio": "音频",
  "Auto": "自动",
  "Boost": "增益",
  "Captions": "字幕",
  "Caption Styles": "字幕样式",
  "Captions look like this": "字幕看起来像这样",
  "Chapters": "章节",
  "Closed-Captions Off": "关闭字幕",
  "Closed-Captions On": "开启字幕",
  "Connected": "已连接",
  "Continue": "继续",
  "Connecting": "连接中",
  "Default": "默认",
  "Disabled": "已禁用",
  "Disconnected": "已断开",
  "Display Background": "显示背景",
  "Download": "下载",
  "Enter Fullscreen": "进入全屏",
  "Enter PiP": "进入画中画",
  "Exit Fullscreen": "退出全屏",
  "Exit PiP": "退出画中画",
  "Font": "字体",
  "Family": "字体族",
  "Fullscreen": "全屏",
  "Google Cast": "Google 投屏",
  "Keyboard Animations": "键盘动画",
  "LIVE": "直播",
  "Loop": "循环",
  "Mute": "静音",
  "Normal": "正常",
  "Off": "关闭",
  "Pause": "暂停",
  "Play": "播放",
  "Playback": "播放",
  "PiP": "画中画",
  "Quality": "画质",
  "Replay": "重播",
  "Reset": "重置",
  "Seek Backward": "快退",
  "Seek Forward": "快进",
  "Seek": "跳转",
  "Settings": "设置",
  "Skip To Live": "跳至直播",
  "Speed": "速度",
  "Size": "大小",
  "Color": "颜色",
  "Opacity": "不透明度",
  "Shadow": "阴影",
  "Text": "文字",
  "Text Background": "文字背景",
  "Track": "音轨",
  "Unmute": "取消静音",
  "Volume": "音量",
} as const;

/** vidstack 控件词汇表类型：key 必须与 zh-CN 完全一致（英文包例外，传 undefined 走内置英文） */
export type VidstackDict = Record<keyof typeof vidstack, string>;
