// English locale. Keys are type-checked against the zh-CN source dictionary.
import type { Dict } from "./zh-CN";

export const dict: Dict = {
  // ── Common ──
  "common.channelPos": "CH {pos}",
  "common.live": "LIVE",
  "common.liveNow": "ON AIR",
  "common.favAdd": "Add to favorites",
  "common.favRemove": "Remove from favorites",
  "common.fav": "Favorite",
  "common.faved": "Favorited",
  "common.independent": "Independent",
  "common.retry": "Retry",
  "common.close": "Close",
  "common.clear": "Clear",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.channel": "Channel",
  "common.backToTop": "Back to top",

  // ── Header ──
  "header.menuClose": "Close menu",
  "header.menuOpen": "Open menu",
  "header.sidebarExpand": "Expand sidebar",
  "header.sidebarCollapse": "Collapse sidebar",
  "header.searchPlaceholder": "Search channels, networks, countries…",
  "header.searchAria": "Search channels",
  "header.searchClear": "Clear search",
  "header.search": "Search",
  "header.liveCountSuffix": "signals on air",

  // ── Search history dropdown ──
  "searchHistory.aria": "Search history",
  "searchHistory.title": "Search history",
  "searchHistory.manage": "Manage",
  "searchHistory.done": "Done",
  "searchHistory.selectAll": "Select all",
  "searchHistory.selectNone": "Deselect all",
  "searchHistory.delete": "Delete",
  "searchHistory.deleteConfirmTitle": "Delete search history",
  "searchHistory.deleteConfirmDesc": "This will delete the {count} selected search entries. This cannot be undone.",

  // ── Sidebar ──
  "sidebar.home": "Home",
  "sidebar.favorites": "Favorites",
  "sidebar.history": "History",
  "sidebar.categories": "Categories",
  "sidebar.countries": "Countries",
  "sidebar.all": "All",
  "sidebar.allCategoriesAria": "Browse all categories",
  "sidebar.allCountriesAria": "Browse all countries",
  "sidebar.status": "Status",
  "sidebar.settings": "Settings",

  // ── Toasts ──
  "toast.backHome": "Back to home",
  "toast.gotoFavorites": "Switched to favorites",
  "toast.gotoHistory": "Switched to watch history",
  "toast.gotoStatus": "Switched to status page",
  "toast.gotoSettings": "Switched to settings",
  "toast.switchedChannel": "Switched to {name} channels",
  "toast.favAdded": "Added to favorites",
  "toast.favRemoved": "Removed from favorites",
  "toast.categoryCleared": "Category filter cleared",
  "toast.categorySet": "Category: {name}",
  "toast.countryCleared": "Country filter cleared",
  "toast.countrySet": "Country: {name}",
  "toast.sortSet": "Sort: {name}",
  "toast.nsfwOn": "Adult content is now shown",
  "toast.nsfwOff": "Adult content hidden",
  "toast.viewGrid": "Switched to card view",
  "toast.viewList": "Switched to list view",
  "toast.historyDeleted": {
    one: "Deleted {count} history record",
    other: "Deleted {count} history records",
  },
  "toast.themeSwitched": "Switched to {name} mode",
  "toast.langSwitched": "Language switched to {name}",
  "toast.updateModeSwitched": "Switched to {name}",
  "toast.updateModeOff": "Updates disabled",
  "toast.tzSwitched": "Time zone: {name}",
  "toast.streamFailover": "Stream unavailable, switched to backup signal",
  "toast.streamRefreshed": "Signal source refreshed",
  "toast.welcome": "Welcome to SignalTV",
  "toast.loading": "Loading",

  // ── Hero ──
  "hero.title1": "The world,",
  "hero.title2": "tuned in live.",
  "hero.lede1": "Aggregating",
  "hero.lede2":
    "free TV channels worldwide — news, movies, sports, music, documentaries and more. No sign-up, just watch.",
  "hero.tuneIn": "Tune in to featured",
  "hero.featured": "FEATURED",
  "hero.rec": "● REC",
  "hero.nowPlaying": "NOW PLAYING",

  // ── Filter bar ──
  "filter.eyebrow": "Program guide",
  "filter.searchResults": "Results for “{q}”",
  "filter.allChannels": "All channels",
  "filter.categoryFallback": "Category",
  "filter.countryFallback": "Country",
  "filter.favorites": "Favorites",
  "filter.countFavorites": { one: "{count} favorite", other: "{count} favorites" },
  "filter.countSignals": { one: "{count} signal", other: "{count} signals" },
  "filter.categoryAria": "Filter by category",
  "filter.countryAria": "Filter by country",
  "filter.sortAria": "Sort order",
  "filter.allCategories": "All categories",
  "filter.allCountries": "All countries",
  "filter.nsfwTitle": "Include adult content",
  "filter.nsfwShown": "Adult content shown",
  "filter.nsfwHidden": "Adult content hidden",
  "filter.viewAria": "View mode",
  "filter.viewGrid": "Card view",
  "filter.viewList": "List view",

  // ── Sort options ──
  "sort.default": "Default",
  "sort.recent": "Recently watched",
  "sort.latencyAsc": "Latency: low → high",
  "sort.latencyDesc": "Latency: high → low",
  "sort.nsfwFirst": "Adult content first",

  // ── Channel grid ──
  "grid.emptyTitle": "No signal",
  "grid.emptyDesc": "No channels match the current filters. Try widening your search.",
  "grid.favEmptyTitle": "No favorites yet",
  "grid.favEmptyDesc": "Tap the favorite button while browsing channels and they'll show up here.",
  "grid.footer": "Showing {shown} of {total} signals",

  // ── Channel card ──
  "card.nsfw": "18+",

  // ── History ──
  "history.eyebrow": "Watch log",
  "history.title": "Watch history",
  "history.countRecords": { one: "{count} record", other: "{count} records" },
  "history.manage": "Manage",
  "history.exitManage": "Done",
  "history.selectAll": "Select all",
  "history.selectNone": "Deselect all",
  "history.selectedCount": { one: "{count} selected", other: "{count} selected" },
  "history.deleteSelected": "Delete selected",
  "history.deleteConfirmTitle": "Delete history records",
  "history.deleteConfirmDesc": {
    one: "This will delete the selected {count} history record. This cannot be undone.",
    other: "This will delete the selected {count} history records. This cannot be undone.",
  },
  "history.emptyTitle": "No watch history yet",
  "history.emptyDesc": "Play any channel and every viewing will be logged here as a timeline.",
  "history.noMatchTitle": "No matching records",
  "history.noMatchDesc":
    "No history entries match the current filters. Try a different category or country.",
  "history.replay": "Replay {name}",
  "history.gone": "Channel offline",

  // ── Status page ──
  "status.eyebrow": "Signal source",
  "status.title": "Status",
  "status.connError": "Uplink error",
  "status.connLoading": "Establishing uplink",
  "status.connOk": "Uplink established",
  "status.connIdle": "Standby",
  "status.connection": "Connection",
  "status.connectionDesc": "Current signal-source loading state.",
  "status.connSub": "Public TV signal sources · iptv-org",
  "status.data": "Data",
  "status.dataDesc": "Loaded channels, categories and countries.",
  "status.statChannels": "channels",
  "status.statCategories": "categories",
  "status.statCountries": "countries",
  "status.probe": "Latency probe",
  "status.probeDesc": "Measures latency of visible channels for latency-based sorting.",
  "status.probeStatus": "Status",
  "status.probeReady": "Ready",
  "status.probeIdle": "Not started",
  "status.probed": "Probed",
  "status.probedCount": { one: "{count} channel", other: "{count} channels" },
  "status.reachable": "Reachable",
  "status.reachableValue": { one: "{count} channel ({pct}%)", other: "{count} channels ({pct}%)" },
  "status.probeStart": "Start test",
  "status.probeCancel": "Cancel test",
  "status.probeRunning": "Testing",
  "status.probeProgressAria": "Test progress",
  "status.probeDone": "Test complete: {count} reachable ({pct}%)",
  "status.probeCancelled": "Test cancelled",

  // ── Settings page ──
  "settings.eyebrow": "Console",
  "settings.title": "Settings",
  "settings.appearance": "Appearance",
  "settings.appearanceDesc": "Choose a theme mode to set the overall palette and mood.",
  "settings.language": "Language",
  "settings.languageDesc": "Choose the interface language. Auto-detects your browser by default.",
  "settings.langAuto": "Auto detect",
  "settings.langAutoDesc": "Follow browser language",
  "settings.about": "About",
  "settings.githubAria": "GitHub repository",
  "settings.tagline": "Public TV signals · Free live streaming",
  "settings.channelsCount": { one: "{count} channel", other: "{count} channels" },
  "settings.noSignup": "No sign-up · No ads · No tracking",
  "settings.dataSource":
    "Channel data comes from the public iptv-org open-source project. This site does not store or relay any video streams.",
  "settings.updates": "Updates",
  "settings.updatesDesc": "Choose how new versions are handled.",
  "settings.timezone": "Time zone",
  "settings.timezoneDesc": "Choose the time zone used for time display, auto-detected by default.",
  "settings.tzAuto": "Auto detect",
  "settings.tzAutoDesc": "Follow device time zone",

  // ── Time zone map ──
  "tz.mapAria": "World map time zone picker",
  "tz.bandAria": "Select {name}",

  // ── Update options & update toast ──
  "update.auto": "Auto update",
  "update.autoDesc": "Install silently in the background, applied on next launch",
  "update.manual": "Manual update",
  "update.manualDesc": "Show a prompt when a new version is found, you decide",
  "update.off": "Updates off",
  "update.offDesc": "Do not check for new versions",
  "update.available": "A new version is available. Update now?",
  "update.actionUpdate": "Update",
  "update.actionIgnore": "Ignore",
  "update.downloading": "Downloading new version…",
  "update.ready": "New version ready",
  "update.actionReload": "Reload page ({s}s)",
  "settings.checkUpdate": "Check for updates",
  "settings.checkUpdateCountdown": "({s}s)",
  "update.checking": "Checking for updates…",
  "update.latest": "You're on the latest version",
  "update.foundDownloading": "New version found, downloading in the background…",
  "update.installing": "Installing…",
  "update.done": "Update completed",
  "update.checkFailed": "Update check failed. Check your network and try again.",
  "update.deferredReload": "New version ready. The page will refresh automatically after playback ends.",

  // ── Theme options ──
  "theme.system": "System",
  "theme.systemDesc": "Follow the operating system",
  "theme.light": "Daylight",
  "theme.lightDesc": "Warm cream base, bright and easy",
  "theme.dark": "Night",
  "theme.darkDesc": "Broadcast black, immersive mood",

  // ── Language names (shown in the current UI language) ──
  "lang.zh-CN": "Chinese (Simplified)",
  "lang.en": "English",
  "lang.de": "German",
  "lang.fr": "French",
  "lang.ja": "Japanese",
  "lang.ru": "Russian",
  "lang.es": "Spanish",
  "lang.ko": "Korean",

  // ── Player modal ──
  "player.dialogAria": "Now playing {name}",
  "player.signalLocked": "Signal locked",
  "player.connecting": "Connecting",
  "player.connectFailed": "Connection failed",
  "player.closeAria": "Close player",
  "player.website": "Website",
  "player.factChannel": "Channel no.",
  "player.factCountry": "Country",
  "player.factStreams": "Streams",
  "player.factLaunched": "Launched",
  "player.related": "Related signals",
  "player.loadFailed": "Player failed to load. Close and try again.",

  // ── Player overlays ──
  "tv.acquiring": "Acquiring signal…",
  "tv.tapToPlayAria": "Tap to start playback",
  "tv.tapToPlay": "Tap to play",
  "tv.tapToPlayHint": "Browser policy requires a manual start",
  "tv.signalLost": "Signal lost",
  "tv.mixedContent":
    "The browser blocked this unencrypted (http) stream due to its security policy, so it cannot play on this page.",
  "tv.unavailable": "This live stream is unavailable.",
  "tv.triedStreams": "Tried {tried}/{total} streams, none could play.",
  "tv.regionHint":
    "Many free signals are geo-restricted or intermittently offline. Try another channel from the same network.",
  "tv.startFailed": "Could not start playback. Retry or switch channels.",

  // ── Toaster ──
  "toaster.region": "Notifications",
  "toaster.closeAria": "Dismiss notification",

  // ── Loader ──
  "loader.sub": "Establishing uplink · Public TV signal sources",
  "loader.logConnect": "Connecting to signal sources",
  "loader.logChannels": "Fetching channel table",
  "loader.logStreams": "Fetching stream table",
  "loader.logSync": "Syncing broadcast grid",
  "loader.size": "Downloaded {size}",
  "loader.speed": "Speed {speed}",
  "loader.failTitle1": "Uplink ",
  "loader.failTitle2": "failed",
  "loader.retryConnection": "Retry connection",

  // ── Load stages ──
  "stage.merging": "Merging signal tables…",

  // ── ErrorBoundary ──
  "errb.title1": "Signal ",
  "errb.title2": "interrupted",
  "errb.unknown": "Unknown rendering error",

  // ── Picker modals ──
  "picker.recent": "Recently used",
  "picker.searchCategories": "Search categories…",
  "picker.searchCategoriesAria": "Search categories",
  "picker.noCategories": "No matching categories",
  "picker.searchCountries": "Search countries or region codes…",
  "picker.searchCountriesAria": "Search countries",
  "picker.noCountries": "No matching countries",
  "picker.noMatchDesc": "Try a different keyword.",

  // ── API errors ──
  "api.requestFailed": "Request failed {url}: {status}",
  "api.timeout": "Request timed out {url}",
  "api.cancelled": "Request cancelled",
  "api.readFailed": "Failed to read response {url}",
  "api.parseFailed": "Failed to parse response {url} (not JSON)",
  "api.loadFailed": "Failed to load broadcast data.",

  // ── Date formatting ──
  "format.today": "Today",
  "format.yesterday": "Yesterday",

  // ── SEO ──
  "seo.homeTitle": "SignalTV - Free Live TV Channels Online",
  "seo.homeDesc":
    "SignalTV is a free website for watching live TV online, aggregating thousands of channels worldwide across news, movies, sports, music, documentaries and more. No sign-up required.",
  "seo.categoryTitle": "SignalTV | {name} channels",
  "seo.categoryDescCount":
    "Watch {count} live {name} TV channels online for free — instant playback, {name} content from around the world.",
  "seo.categoryDesc":
    "Watch live {name} TV channels online for free — instant playback, {name} content from around the world.",
  "seo.countryTitle": "SignalTV | TV channels from {name}",
  "seo.countryDescCount": "Watch {count} live TV channels from {name} online, free and instant.",
  "seo.countryDesc": "Watch live TV channels from {name} online, free and instant.",
  "seo.favoritesTitle": "SignalTV | My favorite channels",
  "seo.favoritesDesc": "Your favorited TV channels on SignalTV — continue watching with one click.",
  "seo.historyTitle": "SignalTV | Watch history",
  "seo.historyDesc":
    "Your watch history timeline on SignalTV — revisit and replay channels you've watched (stored locally only).",
  "seo.statusTitle": "SignalTV | Signal source status",
  "seo.statusDesc":
    "SignalTV source status: connection state, channel statistics, latency probe progress and data source notes.",
  "seo.settingsTitle": "SignalTV | Settings",
  "seo.settingsDesc": "SignalTV settings: theme mode, interface language and app info.",
  "seo.searchTitle": "SignalTV | TV channel results for “{q}”",
  "seo.searchDesc": "Live TV channels matching “{q}” on SignalTV — watch online for free.",
};

// vidstack ships English by default — no translation map needed
export const vidstack = undefined;
