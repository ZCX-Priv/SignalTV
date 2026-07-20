import type { ReactNode } from "react";
import {
  Settings as SettingsIcon,
  Monitor,
  Sun,
  Moon,
  Check,
  Radio,
} from "lucide-react";
import { useStore } from "../store/useStore";
import type { ThemeMode } from "../store/useStore";
import { fmt } from "../lib/format";
import { toast } from "../lib/toast";

// 主题模式选项：跟随系统 / 白昼 / 夜间，每项配 SVG 图标 + 名称 + 简短描述
const THEME_OPTIONS: {
  value: ThemeMode;
  label: string;
  icon: ReactNode;
  desc: string;
}[] = [
  {
    value: "system",
    label: "跟随系统",
    icon: <Monitor size={16} />,
    desc: "随操作系统自动切换",
  },
  {
    value: "light",
    label: "白昼",
    icon: <Sun size={16} />,
    desc: "暖米色底，明亮舒适",
  },
  {
    value: "dark",
    label: "夜间",
    icon: <Moon size={16} />,
    desc: "广播黑底，沉浸氛围",
  },
];

export function SettingsPanel() {
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const channels = useStore((s) => s.channels);

  return (
    <div className="settings">
      <div className="settings__head">
        <div className="eyebrow">
          <SettingsIcon size={11} /> 控制台
        </div>
        <h1 className="settings__title display">设置</h1>
      </div>

      <section className="settings__section">
        <header className="settings__section-head">
          <h2>外观</h2>
          <p>选择主题模式，影响整体配色与氛围。</p>
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
                  toast.success(`已切换至${opt.label}模式`);
                }}
                aria-pressed={active}
              >
                <span className="settings__option-icon">{opt.icon}</span>
                <span className="settings__option-text">
                  <span className="settings__option-name">{opt.label}</span>
                  <span className="settings__option-desc">{opt.desc}</span>
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
          <h2>关于</h2>
        </header>
        <div className="settings__about">
          <div className="settings__about-logo">
            <Radio size={20} strokeWidth={2.2} />
            <span className="dot" aria-hidden />
          </div>
          <div className="settings__about-body">
            <div className="settings__about-name">SignalTV</div>
            <div className="settings__about-tagline mono">
              公共电视信号源 · 免费在线直播
            </div>
            <div className="settings__about-meta mono">
              <span>{fmt(channels.size)} 路频道</span>
              <span>·</span>
              <span>无注册 · 无广告 · 无追踪</span>
            </div>
            <div className="settings__about-source">
              频道数据来自公开的 iptv-org 开源项目，本站不存储、不转发任何视频流。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
