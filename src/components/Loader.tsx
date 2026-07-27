import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { LOG_STAGGER_END_MS, useStore } from "../store/useStore";
import { useI18n } from "../i18n";

export function Loader() {
  const { t } = useI18n();
  // 固定五行进度（全部原地更新，不滚动不重挂载）：
  // 第2、3行下载中显示 [n%]，完成时原地换 [OK]；
  // 第4、5行合计大小/速率纯文本原地刷新；
  // 合并阶段经 JS 门控：必须等五行错峰入场全部完成后，
  // 才清掉大小/速率两行并打印"合并信号表"行
  const progress = useStore((s) => s.loadProgress);
  // 进度日志分支（五行）首次挂载时间，错峰延迟以此为起点
  const logMountAt = useRef<number | null>(null);
  const [mergeVisible, setMergeVisible] = useState(false);

  useEffect(() => {
    if (progress && logMountAt.current === null) {
      logMountAt.current = Date.now();
    }
  }, [progress]);

  const merging = progress?.merging ?? false;
  useEffect(() => {
    if (!merging || mergeVisible) return;
    // 加载快时 merging 可能早于错峰入场结束，补足剩余等待时间
    const elapsed = Date.now() - (logMountAt.current ?? Date.now());
    const remain = LOG_STAGGER_END_MS - elapsed;
    if (remain <= 0) {
      setMergeVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setMergeVisible(true), remain);
    return () => window.clearTimeout(timer);
  }, [merging, mergeVisible]);

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
              <p className="loader__l1">{`> ${t("loader.logConnect")}`}</p>
              <p className="loader__l2">
                {`> ${t("loader.logChannels")}`}
                {progress.channelsReady ? (
                  <span className="loader__ok"> [OK]</span>
                ) : (
                  progress.channelsPct !== undefined && ` [${progress.channelsPct}%]`
                )}
              </p>
              <p className="loader__l3">
                {`> ${t("loader.logStreams")}`}
                {progress.streamsReady ? (
                  <span className="loader__ok"> [OK]</span>
                ) : (
                  progress.streamsPct !== undefined && ` [${progress.streamsPct}%]`
                )}
              </p>
              {mergeVisible ? (
                // 门控通过后：清掉大小/速率两行，原位打印合并行
                // （不加延迟类，挂载即淡入）
                <p>
                  {`> ${t("stage.merging")}`}
                  {cursor}
                </p>
              ) : (
                <>
                  <p className="loader__l4">{`> ${t("loader.size", { size: progress.size ?? "0KB" })}`}</p>
                  <p className="loader__l5">
                    {`> ${t("loader.speed", { speed: progress.speed ?? "--" })}`}
                    {cursor}
                  </p>
                </>
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
