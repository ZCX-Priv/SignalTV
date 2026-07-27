import { Radio } from "lucide-react";
import { useStore } from "../store/useStore";
import { useI18n } from "../i18n";

export function Loader() {
  const { t } = useI18n();
  // 真实加载阶段（init 更新，存文案 key）：弱网下让用户看到实际进度
  //（含已下载字节数），而非静态文案死等；渲染时翻译，中途切语言也正确
  const loadStage = useStore((s) => s.loadStage);
  const stageText = loadStage
    ? t(loadStage.key, {
        label: loadStage.labelKey ? t(loadStage.labelKey) : "",
        done: loadStage.done ?? 0,
        size: loadStage.size ?? "",
      })
    : t("loader.logSync");
  return (
    <div className="loader">
      <div className="loader__inner">
        <div className="loader__mark">
          <Radio size={26} strokeWidth={2} />
          <span className="dot" />
        </div>
        <div className="loader__title display">
          SignalTV
        </div>
        <div className="loader__sub mono">
          {t("loader.sub")}
        </div>

        <div className="loader__bar">
          <span />
        </div>

        <div className="loader__log mono">
          <p>{`> ${t("loader.logConnect")}`}</p>
          <p>{`> ${t("loader.logChannels")}`}</p>
          <p>{`> ${t("loader.logStreams")}`}</p>
          <p>{`> ${stageText}`}<span className="loader__cursor">_</span></p>
        </div>
      </div>

      <div className="loader__scan" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="loader">
      <div className="loader__inner">
        <div className="loader__mark loader__mark--err">
          <Radio size={26} strokeWidth={2} />
        </div>
        <div className="loader__title display">
          {t("loader.failTitle1")}<em>{t("loader.failTitle2")}</em>
        </div>
        <div className="loader__sub mono">{message}</div>
        <button
          className="btn btn--primary"
          onClick={() => window.location.reload()}
          style={{ marginTop: 18 }}
        >
          {t("loader.retryConnection")}
        </button>
      </div>
    </div>
  );
}
