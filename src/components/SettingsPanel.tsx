import { useEffect, useState, type ReactNode } from "react";
import {
  Settings as SettingsIcon,
  Monitor,
  Sun,
  Moon,
  Check,
  Radio,
  Languages,
  RefreshCw,
  Bell,
  BellOff,
} from "lucide-react";
import { useStore } from "../store/useStore";
import type { ThemeMode, UpdateMode } from "../store/useStore";
import { toast } from "../lib/toast";
import { checkForUpdates } from "../lib/updater";
import { TimezoneMap } from "./TimezoneMap";
import {
  NATIVE_LOCALE_NAMES,
  SUPPORTED_LOCALES,
  useI18n,
  type LanguagePref,
  type MsgKey,
} from "../i18n";

// lucide-react 1.x 移除了品牌图标，此处内联 GitHub 图标 SVG（来自 lucide 旧版品牌图标）
function GithubIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

// 主题模式选项：跟随系统 / 白昼 / 夜间，每项配 SVG 图标 + 名称/描述文案 key
const THEME_OPTIONS: {
  value: ThemeMode;
  labelKey: MsgKey;
  icon: ReactNode;
  descKey: MsgKey;
}[] = [
  {
    value: "system",
    labelKey: "theme.system",
    icon: <Monitor size={16} />,
    descKey: "theme.systemDesc",
  },
  {
    value: "light",
    labelKey: "theme.light",
    icon: <Sun size={16} />,
    descKey: "theme.lightDesc",
  },
  {
    value: "dark",
    labelKey: "theme.dark",
    icon: <Moon size={16} />,
    descKey: "theme.darkDesc",
  },
];

// 语言选项：自动检测 + 8 种语言（label 固定用本族语名，desc 用当前界面语言）
const LANGUAGE_OPTIONS: LanguagePref[] = ["system", ...SUPPORTED_LOCALES];

// 更新方式选项：自动 / 手动 / 关闭，与主题选项同构（图标 + 名称/描述文案 key）
const UPDATE_OPTIONS: {
  value: UpdateMode;
  labelKey: MsgKey;
  icon: ReactNode;
  descKey: MsgKey;
}[] = [
  {
    value: "auto",
    labelKey: "update.auto",
    icon: <RefreshCw size={16} />,
    descKey: "update.autoDesc",
  },
  {
    value: "manual",
    labelKey: "update.manual",
    icon: <Bell size={16} />,
    descKey: "update.manualDesc",
  },
  {
    value: "off",
    labelKey: "update.off",
    icon: <BellOff size={16} />,
    descKey: "update.offDesc",
  },
];

// 手动检查更新提示的最短展示时长：检查通常瞬间完成，
// 不补足时长则「正在检查更新…」一闪而过不可感知
const CHECK_TOAST_MIN_MS = 1200;

// 检查更新按钮冷却时长：一次检查收尾后 10s 内不可再点，避免连点狂检
const CHECK_COOLDOWN_MS = 10_000;
// 冷却截止时间戳（模块级：设置页关闭重开不重置冷却）
let checkCooldownUntil = 0;

export function SettingsPanel() {
  const { t } = useI18n();
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const updateMode = useStore((s) => s.updateMode);
  const setUpdateMode = useStore((s) => s.setUpdateMode);
  const timezonePref = useStore((s) => s.timezonePref);
  const setTimezonePref = useStore((s) => s.setTimezonePref);
  const channels = useStore((s) => s.channels);
  // 手动检查更新进行中：按钮禁用 + 图标旋转
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  // 冷却剩余秒数（0 = 不在冷却，仅禁用不转圈以区别检查中的旋转态）：挂载时
  // 按模块级截止时间戳初始化，冷却期内关闭重开设置页不会提前解锁
  const [cooldownRemain, setCooldownRemain] = useState(() =>
    Math.max(0, Math.ceil((checkCooldownUntil - Date.now()) / 1000)),
  );
  const coolingDown = cooldownRemain > 0;
  useEffect(() => {
    if (!coolingDown) return;
    // 每秒按实时时间戳重算剩余秒数（自校正，后台切走再切回也准确）
    const timer = setInterval(() => {
      setCooldownRemain(
        Math.max(0, Math.ceil((checkCooldownUntil - Date.now()) / 1000)),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [coolingDown]);

  // 点「检查更新」：info 提示（不转圈）至少展示 CHECK_TOAST_MIN_MS 后，
  // 通过同一去重键（key）原地变身为成功/信息/错误结果提示，
  // 避免「先收掉再新弹」的双 toast 硬切换（info 退场与结果弹出同帧，
  // 观感为突然消失）；available（manual 交互式 toast）与 handled
  //（auto 单条进度 toast 全程接管）由 updater 弹出，此处只收掉检查中
  // 提示、不再叠加任何 toast（避免双 toast）
  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    // 去重键：结果提示复用同 key，命中 toastStore.add() 的 key 去重路径，
    // 同一条目原地刷新 type/文案/时长（Infinity → 默认 3500ms 自动消失）
    const CHECK_KEY = "update-check";
    const checkingId = toast.info(t("update.checking"), {
      duration: Infinity,
      key: CHECK_KEY,
    });
    const startedAt = Date.now();
    const result = await checkForUpdates().catch(() => "failed" as const);
    // 补足最短展示时长，按钮旋转态与提示同步持续到结果弹出
    const remain = CHECK_TOAST_MIN_MS - (Date.now() - startedAt);
    if (remain > 0) await new Promise((r) => setTimeout(r, remain));
    if (result === "latest") toast.success(t("update.latest"), { key: CHECK_KEY });
    else if (result === "failed") toast.error(t("update.checkFailed"), { key: CHECK_KEY });
    else toast.dismiss(checkingId); // available/handled：updater 已弹自家 toast，只收检查中提示
    setCheckingUpdate(false);
    // 检查收尾后进入 10s 冷却，期间按钮不可点并显示逐秒倒计时
    checkCooldownUntil = Date.now() + CHECK_COOLDOWN_MS;
    setCooldownRemain(CHECK_COOLDOWN_MS / 1000);
  };

  return (
    <div className="settings">
      <div className="settings__head">
        <div className="eyebrow">
          <SettingsIcon size={11} /> {t("settings.eyebrow")}
        </div>
        <h1 className="settings__title display">{t("settings.title")}</h1>
      </div>

      <section className="settings__section">
        <header className="settings__section-head">
          <h2>{t("settings.appearance")}</h2>
          <p>{t("settings.appearanceDesc")}</p>
        </header>
        <div className="settings__options">
          {THEME_OPTIONS.map((opt) => {
            const active = themeMode === opt.value;
            return (
              <button
                key={opt.value}
                className={`settings__option ${active ? "is-active" : ""}`}
                onClick={(e) => {
                  // 圆形扩散原点：指针点击用实际坐标；键盘触发（detail === 0，
                  // 坐标不可靠）退回按钮几何中心
                  let origin = { x: e.clientX, y: e.clientY };
                  if (e.detail === 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    origin = {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    };
                  }
                  setThemeMode(opt.value, origin);
                  toast.success(t("toast.themeSwitched", { name: t(opt.labelKey) }));
                }}
                aria-pressed={active}
              >
                <span className="settings__option-icon">{opt.icon}</span>
                <span className="settings__option-text">
                  <span className="settings__option-name">{t(opt.labelKey)}</span>
                  <span className="settings__option-desc">{t(opt.descKey)}</span>
                </span>
                {active && (
                  <span className="settings__option-check">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings__section">
        <header className="settings__section-head">
          <h2>{t("settings.language")}</h2>
          <p>{t("settings.languageDesc")}</p>
        </header>
        <div className="settings__options">
          {LANGUAGE_OPTIONS.map((pref) => {
            const active = language === pref;
            const isAuto = pref === "system";
            // 选项名：自动检测用当前界面语言；具体语言固定用本族语名（国际惯例）
            const label = isAuto ? t("settings.langAuto") : NATIVE_LOCALE_NAMES[pref];
            // 描述：自动检测项展示跟随策略说明；语言项展示其在当前界面语言下的名称
            const desc = isAuto
              ? t("settings.langAutoDesc")
              : t(`lang.${pref}` as MsgKey);
            return (
              <button
                key={pref}
                className={`settings__option ${active ? "is-active" : ""}`}
                onClick={() => {
                  void setLanguage(pref).then(() => {
                    // await 后字典已就绪，toast 直接以新语言展示
                    toast.success(t("toast.langSwitched", { name: label }));
                  });
                }}
                aria-pressed={active}
              >
                <span className="settings__option-icon">
                  {isAuto ? <Monitor size={16} /> : <Languages size={16} />}
                </span>
                <span className="settings__option-text">
                  <span className="settings__option-name">{label}</span>
                  <span className="settings__option-desc">{desc}</span>
                </span>
                {active && (
                  <span className="settings__option-check">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings__section">
        <header className="settings__section-head">
          <h2>{t("settings.timezone")}</h2>
          <p>{t("settings.timezoneDesc")}</p>
        </header>
        <div className="settings__options">
          <button
            className={`settings__option ${timezonePref === "auto" ? "is-active" : ""}`}
            onClick={() => {
              if (timezonePref === "auto") return;
              setTimezonePref("auto");
              toast.success(
                t("toast.tzSwitched", { name: t("settings.tzAuto") }),
              );
            }}
            aria-pressed={timezonePref === "auto"}
          >
            <span className="settings__option-icon">
              <Monitor size={16} />
            </span>
            <span className="settings__option-text">
              <span className="settings__option-name">{t("settings.tzAuto")}</span>
              <span className="settings__option-desc">
                {t("settings.tzAutoDesc")}
              </span>
            </span>
            {timezonePref === "auto" && (
              <span className="settings__option-check">
                <Check size={14} />
              </span>
            )}
          </button>
        </div>
        <TimezoneMap />
      </section>

      <section className="settings__section">
        <header className="settings__section-head settings__section-head--row">
          <div className="settings__section-head-text">
            <h2>{t("settings.updates")}</h2>
            <p>{t("settings.updatesDesc")}</p>
          </div>
          {/* off 模式不渲染检查更新按钮：关闭更新即不提供任何更新入口，
              切回 auto/manual 时随 updateMode 响应式恢复显示 */}
          {updateMode !== "off" && (
            <button
              type="button"
              className="btn btn--ghost btn--sm settings__check-update"
              onClick={() => void handleCheckUpdate()}
              disabled={checkingUpdate || coolingDown}
              aria-label={t("settings.checkUpdate")}
            >
              <RefreshCw size={13} className={checkingUpdate ? "spin" : undefined} />
              {/* 移动端（≤1080px）文字隐藏仅留图标，见 App.css */}
              <span className="settings__check-update-label">
                {t("settings.checkUpdate")}
              </span>
              {/* 倒计时数字独立于文字标签：移动端隐藏文字后仍常显倒计时 */}
              {coolingDown && (
                <span className="settings__check-update-count">
                  {t("settings.checkUpdateCountdown", { s: cooldownRemain })}
                </span>
              )}
            </button>
          )}
        </header>
        <div className="settings__options">
          {UPDATE_OPTIONS.map((opt) => {
            const active = updateMode === opt.value;
            return (
              <button
                key={opt.value}
                className={`settings__option ${active ? "is-active" : ""}`}
                onClick={() => {
                  setUpdateMode(opt.value);
                  // off 用独立文案「已关闭更新」，auto/manual 用「已切换到…」
                  toast.success(
                    opt.value === "off"
                      ? t("toast.updateModeOff")
                      : t("toast.updateModeSwitched", { name: t(opt.labelKey) }),
                  );
                }}
                aria-pressed={active}
              >
                <span className="settings__option-icon">{opt.icon}</span>
                <span className="settings__option-text">
                  <span className="settings__option-name">{t(opt.labelKey)}</span>
                  <span className="settings__option-desc">{t(opt.descKey)}</span>
                </span>
                {active && (
                  <span className="settings__option-check">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings__section">
        <header className="settings__section-head">
          <h2>{t("settings.about")}</h2>
        </header>
        <div className="settings__about">
          <div className="settings__about-logo">
            <Radio size={20} strokeWidth={2.2} />
            <span className="dot" aria-hidden />
          </div>
          <div className="settings__about-body">
            <div className="settings__about-name">
              <span>SignalTV</span>
              <a
                href="https://github.com/ZCX-Priv/SignalTV"
                target="_blank"
                rel="noopener noreferrer"
                className="settings__about-github"
                aria-label={t("settings.githubAria")}
              >
                <GithubIcon size={18} />
              </a>
            </div>
            <div className="settings__about-tagline mono">
              {t("settings.tagline")}
            </div>
            <div className="settings__about-meta mono">
              <span>{t("settings.channelsCount", { count: channels.size })}</span>
              <span>·</span>
              <span>{t("settings.noSignup")}</span>
            </div>
            <div className="settings__about-source">
              {t("settings.dataSource")}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
