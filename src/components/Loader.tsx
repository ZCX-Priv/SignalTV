import { Radio } from "lucide-react";
import { useStore } from "../store/useStore";
import { useI18n } from "../i18n";

export function Loader() {
  const { t } = useI18n();
  // 固定五行进度（init 原地更新，不滚动）：
  // 第2、3行以 done 为 key，每完成一个请求重挂载一次 →
  // 入场动画（delay + both）重播，呈现"先清空后重显"；
  // 第4、5行位置固定，合计大小/速率纯文本原地刷新
  const progress = useStore((s) => s.loadProgress);
  const cursor = <span className="loader__cursor">_</span>;
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
          {progress ? (
            <>
              <p>{`> ${t("loader.logConnect")}`}</p>
              <p key={`ch-${progress.done}`}>
                {`> ${t("loader.logChannels")}`}
                {progress.channelsReady && <span className="loader__ok"> [OK]</span>}
              </p>
              <p key={`st-${progress.done}`}>
                {`> ${t("loader.logStreams")}`}
                {progress.streamsReady && <span className="loader__ok"> [OK]</span>}
              </p>
              <p>{`> ${t("loader.size", { size: progress.size ?? "0KB" })}`}</p>
              <p>
                {`> ${t("loader.speed", { speed: progress.speed ?? "--" })}`}
                {!progress.merging && cursor}
              </p>
              {progress.merging && (
                <p>
                  {`> ${t("stage.merging")}`}
                  {cursor}
                </p>
              )}
            </>
          ) : (
            <p>
              {`> ${t("loader.logSync")}`}
              {cursor}
            </p>
          )}
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
