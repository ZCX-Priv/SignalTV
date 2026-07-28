// Русская локализация. Ключи проверяются по типам исходного словаря zh-CN.
// Формы множественного числа (one/few/many) выбираются через Intl.PluralRules("ru").
import type { Dict, VidstackDict } from "./zh-CN";

export const dict: Dict = {
  // ── Общее ──
  "common.channelPos": "Канал {pos}",
  "common.live": "ЭФИР",
  "common.liveNow": "В ЭФИРЕ",
  "common.favAdd": "Добавить в избранное",
  "common.favRemove": "Убрать из избранного",
  "common.fav": "В избранное",
  "common.faved": "В избранном",
  "common.independent": "Независимый",
  "common.retry": "Повторить",
  "common.close": "Закрыть",
  "common.clear": "Очистить",
  "common.channel": "Канал",

  // ── Шапка ──
  "header.menuClose": "Закрыть меню",
  "header.menuOpen": "Открыть меню",
  "header.sidebarExpand": "Развернуть боковую панель",
  "header.sidebarCollapse": "Свернуть боковую панель",
  "header.searchPlaceholder": "Поиск каналов, телесетей, стран…",
  "header.searchAria": "Поиск каналов",
  "header.searchClear": "Очистить поиск",
  "header.search": "Поиск",
  "header.liveCountSuffix": "сигналов в эфире",

  // ── Боковая панель ──
  "sidebar.home": "Главная",
  "sidebar.favorites": "Избранное",
  "sidebar.history": "История",
  "sidebar.categories": "Категории",
  "sidebar.countries": "Страны",
  "sidebar.all": "Все",
  "sidebar.allCategoriesAria": "Показать все категории",
  "sidebar.allCountriesAria": "Показать все страны",
  "sidebar.status": "Статус",
  "sidebar.settings": "Настройки",

  // ── Уведомления ──
  "toast.backHome": "Вы на главной",
  "toast.gotoFavorites": "Открыто избранное",
  "toast.gotoHistory": "Открыта история просмотров",
  "toast.gotoStatus": "Открыта страница статуса",
  "toast.gotoSettings": "Открыты настройки",
  "toast.switchedChannel": "Показаны каналы: {name}",
  "toast.favAdded": "Добавлено в избранное",
  "toast.favRemoved": "Убрано из избранного",
  "toast.categoryCleared": "Фильтр категории сброшен",
  "toast.categorySet": "Категория: {name}",
  "toast.countryCleared": "Фильтр страны сброшен",
  "toast.countrySet": "Страна: {name}",
  "toast.sortSet": "Сортировка: {name}",
  "toast.nsfwOn": "Контент для взрослых показан",
  "toast.nsfwOff": "Контент для взрослых скрыт",
  "toast.historyCleared": "История просмотров очищена",
  "toast.themeSwitched": "Включён режим «{name}»",
  "toast.langSwitched": "Язык переключён: {name}",
  "toast.updateModeSwitched": "Режим обновления: {name}",
  "toast.tzSwitched": "Часовой пояс: {name}",
  "toast.streamFailover": "Поток недоступен, включён резервный сигнал",
  "toast.welcome": "Добро пожаловать в SignalTV",
  "toast.loading": "Загрузка",

  // ── Главный экран ──
  "hero.title1": "Весь мир,",
  "hero.title2": "в прямом эфире.",
  "hero.lede1": "Собрано",
  "hero.lede2":
    "бесплатных телеканалов со всего мира: новости, кино, спорт, музыка, документалистика и не только. Без регистрации — включайте и смотрите.",
  "hero.tuneIn": "Включить рекомендуемое",
  "hero.featured": "ВЫБОР",
  "hero.rec": "● ЗАПИСЬ",
  "hero.nowPlaying": "СЕЙЧАС В ЭФИРЕ",

  // ── Панель фильтров ──
  "filter.eyebrow": "Программа передач",
  "filter.searchResults": "Результаты по запросу «{q}»",
  "filter.allChannels": "Все каналы",
  "filter.categoryFallback": "Категория",
  "filter.countryFallback": "Страна",
  "filter.favorites": "Избранное",
  "filter.countFavorites": {
    one: "{count} избранный",
    few: "{count} избранных",
    many: "{count} избранных",
    other: "{count} избранных",
  },
  "filter.countSignals": {
    one: "{count} сигнал",
    few: "{count} сигнала",
    many: "{count} сигналов",
    other: "{count} сигналов",
  },
  "filter.categoryAria": "Фильтр по категории",
  "filter.countryAria": "Фильтр по стране",
  "filter.sortAria": "Порядок сортировки",
  "filter.allCategories": "Все категории",
  "filter.allCountries": "Все страны",
  "filter.nsfwTitle": "Включая контент для взрослых",
  "filter.nsfwShown": "Контент 18+ показан",
  "filter.nsfwHidden": "Контент 18+ скрыт",

  // ── Сортировка ──
  "sort.default": "По умолчанию",
  "sort.country": "По стране",
  "sort.recent": "Недавно просмотренные",
  "sort.latencyAsc": "Задержка: по возрастанию",
  "sort.latencyDesc": "Задержка: по убыванию",
  "sort.nsfwFirst": "Сначала контент 18+",

  // ── Сетка каналов ──
  "grid.emptyTitle": "Нет сигнала",
  "grid.emptyDesc": "Ни один канал не подходит под фильтры. Попробуйте расширить поиск.",
  "grid.loadingMore": {
    one: "Загружается ещё {count} сигнал…",
    few: "Загружается ещё {count} сигнала…",
    many: "Загружается ещё {count} сигналов…",
    other: "Загружается ещё {count} сигналов…",
  },
  "grid.footer": "Показано {shown} из {total} сигналов",

  // ── Карточка канала ──
  "card.nsfw": "18+",

  // ── История ──
  "history.eyebrow": "Журнал просмотров",
  "history.title": "История просмотров",
  "history.countRecords": {
    one: "{count} запись",
    few: "{count} записи",
    many: "{count} записей",
    other: "{count} записей",
  },
  "history.clear": "Очистить историю",
  "history.emptyTitle": "Истории просмотров пока нет",
  "history.emptyDesc":
    "Включите любой канал — каждый просмотр появится здесь в виде хронологии.",
  "history.noMatchTitle": "Нет подходящих записей",
  "history.noMatchDesc":
    "Под текущие фильтры не подходит ни одна запись. Попробуйте другую категорию или страну.",
  "history.replay": "Смотреть {name} снова",
  "history.gone": "Канал отключён",

  // ── Страница статуса ──
  "status.eyebrow": "Источник сигнала",
  "status.title": "Статус",
  "status.connError": "Сбой аплинка",
  "status.connLoading": "Установка аплинка",
  "status.connOk": "Аплинк установлен",
  "status.connIdle": "Ожидание",
  "status.connection": "Соединение",
  "status.connectionDesc": "Текущее состояние загрузки источников сигнала.",
  "status.connSub": "Публичные ТВ-источники · iptv-org",
  "status.data": "Данные",
  "status.dataDesc": "Загружено каналов, категорий и стран.",
  "status.statChannels": "каналов",
  "status.statCategories": "категорий",
  "status.statCountries": "стран",
  "status.probe": "Замер задержки",
  "status.probeDesc": "Измеряет задержку видимых каналов для сортировки по задержке.",
  "status.probeStatus": "Состояние",
  "status.probeReady": "Готово",
  "status.probeIdle": "Не запущено",
  "status.probed": "Проверено",
  "status.probedCount": {
    one: "{count} канал",
    few: "{count} канала",
    many: "{count} каналов",
    other: "{count} каналов",
  },
  "status.reachable": "Доступно",
  "status.reachableValue": {
    one: "{count} канал ({pct}%)",
    few: "{count} канала ({pct}%)",
    many: "{count} каналов ({pct}%)",
    other: "{count} каналов ({pct}%)",
  },

  // ── Настройки ──
  "settings.eyebrow": "Консоль",
  "settings.title": "Настройки",
  "settings.appearance": "Оформление",
  "settings.appearanceDesc": "Выберите режим темы — общую палитру и атмосферу.",
  "settings.language": "Язык",
  "settings.languageDesc":
    "Выберите язык интерфейса. По умолчанию язык браузера определяется автоматически.",
  "settings.langAuto": "Автоопределение",
  "settings.langAutoDesc": "Следовать языку браузера",
  "settings.about": "О приложении",
  "settings.githubAria": "Репозиторий GitHub",
  "settings.tagline": "Публичные ТВ-сигналы · Бесплатный прямой эфир",
  "settings.channelsCount": {
    one: "{count} канал",
    few: "{count} канала",
    many: "{count} каналов",
    other: "{count} каналов",
  },
  "settings.noSignup": "Без регистрации · Без рекламы · Без слежки",
  "settings.dataSource":
    "Данные каналов взяты из открытого проекта iptv-org. Сайт не хранит и не ретранслирует видеопотоки.",
  "settings.updates": "Обновления",
  "settings.updatesDesc": "Выберите, как обрабатывать новые версии.",
  "settings.timezone": "Часовой пояс",
  "settings.timezoneDesc": "Выберите часовой пояс для отображения времени, по умолчанию определяется автоматически.",
  "settings.tzAuto": "Автоопределение",
  "settings.tzAutoDesc": "Следовать часовому поясу устройства",

  // ── Карта часовых поясов ──
  "tz.mapAria": "Выбор часового пояса на карте мира",
  "tz.bandAria": "Выбрать {name}",

  // ── Параметры обновления и уведомление об обновлении ──
  "update.auto": "Автообновление",
  "update.autoDesc": "Тихая установка в фоне, применяется при следующем запуске",
  "update.manual": "Ручное обновление",
  "update.manualDesc": "Показывать уведомление о новой версии, решаете вы",
  "update.off": "Обновления отключены",
  "update.offDesc": "Не проверять новые версии",
  "update.available": "Доступна новая версия. Обновить?",
  "update.actionUpdate": "Обновить",
  "update.actionIgnore": "Игнорировать",
  "update.downloading": "Загрузка новой версии…",
  "update.ready": "Новая версия готова",
  "update.actionReload": "Обновить страницу ({s}с)",

  // ── Темы ──
  "theme.system": "Как в системе",
  "theme.systemDesc": "Автоматически следовать настройкам ОС",
  "theme.light": "День",
  "theme.lightDesc": "Тёплый кремовый фон, светло и комфортно",
  "theme.dark": "Ночь",
  "theme.darkDesc": "Эфирный чёрный, атмосфера погружения",

  // ── Названия языков ──
  "lang.zh-CN": "Китайский (упрощённый)",
  "lang.en": "Английский",
  "lang.de": "Немецкий",
  "lang.fr": "Французский",
  "lang.ja": "Японский",
  "lang.ru": "Русский",
  "lang.es": "Испанский",
  "lang.ko": "Корейский",

  // ── Окно плеера ──
  "player.dialogAria": "Сейчас играет {name}",
  "player.signalLocked": "Сигнал захвачен",
  "player.connecting": "Подключение",
  "player.connectFailed": "Сбой подключения",
  "player.closeAria": "Закрыть плеер",
  "player.website": "Сайт",
  "player.factChannel": "Номер канала",
  "player.factCountry": "Страна",
  "player.factStreams": "Потоков",
  "player.factLaunched": "В эфире с",
  "player.related": "Похожие сигналы",
  "player.loadFailed": "Не удалось загрузить плеер. Закройте и попробуйте снова.",

  // ── Оверлеи плеера ──
  "tv.acquiring": "Приём сигнала…",
  "tv.tapToPlayAria": "Нажмите, чтобы начать воспроизведение",
  "tv.tapToPlay": "Нажмите для воспроизведения",
  "tv.tapToPlayHint": "Политика браузера требует запуска вручную",
  "tv.signalLost": "Сигнал потерян",
  "tv.mixedContent":
    "Браузер заблокировал незашифрованный (http) источник по соображениям безопасности — воспроизведение на этой странице невозможно.",
  "tv.unavailable": "Этот прямой эфир недоступен.",
  "tv.triedStreams": "Проверено потоков: {tried}/{total} — ни один не воспроизводится.",
  "tv.regionHint":
    "Многие бесплатные сигналы ограничены по региону или периодически недоступны. Попробуйте другой канал той же телесети.",
  "tv.startFailed": "Не удалось начать воспроизведение. Повторите или смените канал.",

  // ── Уведомления (контейнер) ──
  "toaster.region": "Уведомления",
  "toaster.closeAria": "Закрыть уведомление",

  // ── Экран загрузки ──
  "loader.sub": "Установка аплинка · Публичные ТВ-источники",
  "loader.logConnect": "Подключение к источникам сигнала",
  "loader.logChannels": "Получение таблицы каналов",
  "loader.logStreams": "Получение таблицы потоков",
  "loader.logSync": "Синхронизация эфирной сетки",
  "loader.size": "Загружено {size}",
  "loader.speed": "Скорость {speed}",
  "loader.failTitle1": "Аплинк ",
  "loader.failTitle2": "не удался",
  "loader.retryConnection": "Повторить подключение",

  // ── Этапы загрузки ──
  "stage.merging": "Объединение таблиц сигналов…",

  // ── ErrorBoundary ──
  "errb.title1": "Сигнал ",
  "errb.title2": "прерван",
  "errb.unknown": "Неизвестная ошибка отрисовки",

  // ── Окна выбора ──
  "picker.recent": "Недавно выбранные",
  "picker.searchCategories": "Поиск категорий…",
  "picker.searchCategoriesAria": "Поиск категорий",
  "picker.noCategories": "Подходящих категорий не найдено",
  "picker.searchCountries": "Поиск стран или кодов регионов…",
  "picker.searchCountriesAria": "Поиск стран",
  "picker.noCountries": "Подходящих стран не найдено",
  "picker.noMatchDesc": "Попробуйте другое ключевое слово.",

  // ── Ошибки API ──
  "api.requestFailed": "Сбой запроса {url}: {status}",
  "api.timeout": "Тайм-аут запроса {url}",
  "api.cancelled": "Запрос отменён",
  "api.readFailed": "Не удалось прочитать ответ {url}",
  "api.parseFailed": "Не удалось разобрать ответ {url} (не JSON)",
  "api.loadFailed": "Не удалось загрузить данные эфира.",

  // ── Формат даты ──
  "format.today": "Сегодня",
  "format.yesterday": "Вчера",

  // ── SEO ──
  "seo.homeTitle": "SignalTV — бесплатное прямое ТВ онлайн",
  "seo.homeDesc":
    "SignalTV — бесплатный сайт для просмотра прямого телеэфира онлайн: тысячи каналов со всего мира — новости, кино, спорт, музыка, документалистика и не только. Без регистрации.",
  "seo.categoryTitle": "SignalTV | Каналы: {name}",
  "seo.categoryDescCount":
    "Смотрите онлайн бесплатно {count} прямых ТВ-каналов категории {name} — мгновенный запуск, контент {name} со всего мира.",
  "seo.categoryDesc":
    "Смотрите онлайн бесплатно прямые ТВ-каналы категории {name} — мгновенный запуск, контент {name} со всего мира.",
  "seo.countryTitle": "SignalTV | ТВ-каналы: {name}",
  "seo.countryDescCount":
    "Смотрите онлайн бесплатно {count} прямых ТВ-каналов из страны {name} — мгновенный запуск.",
  "seo.countryDesc": "Смотрите онлайн бесплатно прямые ТВ-каналы из страны {name}.",
  "seo.favoritesTitle": "SignalTV | Мои избранные каналы",
  "seo.favoritesDesc": "Ваши избранные телеканалы на SignalTV — продолжайте просмотр в один клик.",
  "seo.historyTitle": "SignalTV | История просмотров",
  "seo.historyDesc":
    "Хронология просмотров на SignalTV — возвращайтесь к просмотренным каналам (хранится только локально).",
  "seo.statusTitle": "SignalTV | Статус источников сигнала",
  "seo.statusDesc":
    "Статус источников SignalTV: соединение, статистика каналов, ход замера задержки и сведения об источнике данных.",
  "seo.settingsTitle": "SignalTV | Настройки",
  "seo.settingsDesc": "Настройки SignalTV: режим темы, язык интерфейса и сведения о приложении.",
  "seo.searchTitle": "SignalTV | ТВ-каналы по запросу «{q}»",
  "seo.searchDesc": "Прямые ТВ-каналы по запросу «{q}» на SignalTV — смотрите онлайн бесплатно.",
};

// Русский перевод vidstack DefaultVideoLayout
export const vidstack: VidstackDict = {
  "Announcements": "Объявления",
  "Accessibility": "Специальные возможности",
  "AirPlay": "AirPlay",
  "Audio": "Аудио",
  "Auto": "Авто",
  "Boost": "Усиление",
  "Captions": "Субтитры",
  "Caption Styles": "Стили субтитров",
  "Captions look like this": "Субтитры выглядят так",
  "Chapters": "Главы",
  "Closed-Captions Off": "Субтитры выключены",
  "Closed-Captions On": "Субтитры включены",
  "Connected": "Подключено",
  "Continue": "Продолжить",
  "Connecting": "Подключение",
  "Default": "По умолчанию",
  "Disabled": "Отключено",
  "Disconnected": "Отключено от устройства",
  "Display Background": "Фон отображения",
  "Download": "Скачать",
  "Enter Fullscreen": "Во весь экран",
  "Enter PiP": "Включить «картинку в картинке»",
  "Exit Fullscreen": "Выйти из полноэкранного режима",
  "Exit PiP": "Выключить «картинку в картинке»",
  "Font": "Шрифт",
  "Family": "Гарнитура",
  "Fullscreen": "Полный экран",
  "Google Cast": "Google Cast",
  "Keyboard Animations": "Анимации клавиатуры",
  "LIVE": "ЭФИР",
  "Loop": "Повтор",
  "Mute": "Выключить звук",
  "Normal": "Обычный",
  "Off": "Выкл.",
  "Pause": "Пауза",
  "Play": "Воспроизвести",
  "Playback": "Воспроизведение",
  "PiP": "Картинка в картинке",
  "Quality": "Качество",
  "Replay": "Смотреть снова",
  "Reset": "Сбросить",
  "Seek Backward": "Перемотать назад",
  "Seek Forward": "Перемотать вперёд",
  "Seek": "Перемотка",
  "Settings": "Настройки",
  "Skip To Live": "К прямому эфиру",
  "Speed": "Скорость",
  "Size": "Размер",
  "Color": "Цвет",
  "Opacity": "Непрозрачность",
  "Shadow": "Тень",
  "Text": "Текст",
  "Text Background": "Фон текста",
  "Track": "Дорожка",
  "Unmute": "Включить звук",
  "Volume": "Громкость",
};
