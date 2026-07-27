import type { ReactNode } from "react";
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
import {
  NATIVE_LOCALE_NAMES,
  SUPPORTED_LOCALES,
  detectLocale,
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

export function SettingsPanel() {
  const { t } = useI18n();
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const updateMode = useStore((s) => s.updateMode);
  const setUpdateMode = useStore((s) => s.setUpdateMode);
  const channels = useStore((s) => s.channels);

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
                onClick={() => {
                  setThemeMode(opt.value);
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
            // 描述：自动检测项展示当前检测结果；语言项展示其在当前界面语言下的名称
            const desc = isAuto
              ? t("settings.langAutoDesc", { name: NATIVE_LOCALE_NAMES[detectLocale()] })
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
          <h2>{t("settings.updates")}</h2>
          <p>{t("settings.updatesDesc")}</p>
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
                  toast.success(
                    t("toast.updateModeSwitched", { name: t(opt.labelKey) }),
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
