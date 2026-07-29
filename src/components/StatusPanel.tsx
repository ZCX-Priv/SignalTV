import {
  Radio,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Database,
  X,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { fmt } from "../lib/format";
import { toast } from "../lib/toast";
import { useI18n } from "../i18n";

export function StatusPanel() {
  const { t } = useI18n();
  const loaded = useStore((s) => s.loaded);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const channels = useStore((s) => s.channels);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const latency = useStore((s) => s.latency);
  const probeRun = useStore((s) => s.probeRun);
  const runFullProbe = useStore((s) => s.runFullProbe);
  const cancelFullProbe = useStore((s) => s.cancelFullProbe);

  // 派生连接状态
  const status = error
    ? { kind: "error" as const, label: t("status.connError"), Icon: AlertTriangle }
    : loading && !loaded
      ? { kind: "loading" as const, label: t("status.connLoading"), Icon: Loader2 }
      : loaded
        ? { kind: "ok" as const, label: t("status.connOk"), Icon: CheckCircle2 }
        : { kind: "idle" as const, label: t("status.connIdle"), Icon: Radio };

  // 延迟探测统计
  const probedCount = latency.size;
  const successCount = Array.from(latency.values()).filter((v) => v >= 0).length;

  // 手动全量检测：完成后按实际完成量汇总可达率；取消时提示已取消
  const probing = probeRun?.running ?? false;
  const probePct = probeRun && probeRun.total > 0
    ? Math.round((probeRun.done / probeRun.total) * 100)
    : 0;

  async function handleProbeClick() {
    if (probing) {
      cancelFullProbe();
      return;
    }
    const res = await runFullProbe();
    if (!res) return;
    if (res.aborted) {
      toast.info(t("status.probeCancelled"));
    } else {
      toast.success(
        t("status.probeDone", {
          count: res.ok,
          pct: res.done > 0 ? Math.round((res.ok / res.done) * 100) : 0,
        }),
      );
    }
  }

  return (
    <div className="status">
      <div className="status__head">
        <div className="eyebrow">
          <Radio size={11} /> {t("status.eyebrow")}
        </div>
        <h1 className="status__title display">{t("status.title")}</h1>
      </div>

      {/* 信号源状态区块 */}
      <section className="status__section">
        <header className="status__section-head">
          <h2>{t("status.connection")}</h2>
          <p>{t("status.connectionDesc")}</p>
        </header>
        <div className="status__connection">
          <span className={`status__indicator status__indicator--${status.kind}`}>
            <status.Icon size={16} className={status.kind === "loading" ? "spin" : ""} />
          </span>
          <div className="status__connection-body">
            <div className="status__connection-label">{status.label}</div>
            <div className="status__connection-sub mono">
              {error ? t(error.key, error.params) : t("status.connSub")}
            </div>
          </div>
        </div>
      </section>

      {/* 数据统计区块 */}
      <section className="status__section">
        <header className="status__section-head">
          <h2>{t("status.data")}</h2>
          <p>{t("status.dataDesc")}</p>
        </header>
        <div className="status__stats">
          <div className="status__stat">
            <Database size={14} />
            <span className="status__stat-value mono">{fmt(channels.size)}</span>
            <span className="status__stat-label">{t("status.statChannels")}</span>
          </div>
          <div className="status__stat">
            <Radio size={14} />
            <span className="status__stat-value mono">{fmt(categories.length)}</span>
            <span className="status__stat-label">{t("status.statCategories")}</span>
          </div>
          <div className="status__stat">
            <Activity size={14} />
            <span className="status__stat-value mono">{fmt(countries.length)}</span>
            <span className="status__stat-label">{t("status.statCountries")}</span>
          </div>
        </div>
      </section>

      {/* 延迟探测区块 */}
      <section className="status__section">
        <header className="status__section-head">
          <h2>{t("status.probe")}</h2>
          <p>{t("status.probeDesc")}</p>
        </header>
        <div className="status__probe">
          <div className="status__probe-row">
            <span className="status__probe-label">{t("status.probeStatus")}</span>
            <span className="status__probe-value mono">
              {probing
                ? t("status.probeRunning")
                : probedCount > 0
                  ? t("status.probeReady")
                  : t("status.probeIdle")}
            </span>
          </div>
          <div className="status__probe-row">
            <span className="status__probe-label">{t("status.probed")}</span>
            <span className="status__probe-value mono">{t("status.probedCount", { count: probedCount })}</span>
          </div>
          {probedCount > 0 && (
            <div className="status__probe-row">
              <span className="status__probe-label">{t("status.reachable")}</span>
              <span className="status__probe-value mono">
                {t("status.reachableValue", { count: successCount, pct: Math.round((successCount / probedCount) * 100) })}
              </span>
            </div>
          )}

          {/* 手动全量检测：运行中按钮变“取消”，下方展示实时进度条 */}
          <div className="status__probe-actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm status__probe-btn"
              onClick={() => void handleProbeClick()}
              disabled={!loaded}
            >
              {probing ? (
                <>
                  <X size={12} /> {t("status.probeCancel")}
                </>
              ) : (
                <>
                  <Activity size={13} /> {t("status.probeStart")}
                </>
              )}
            </button>
            {probeRun && (
              <span className="status__probe-count mono">
                {fmt(probeRun.done)} / {fmt(probeRun.total)} · {probePct}%
              </span>
            )}
          </div>
          {probeRun && (
            <div
              className="status__probe-progress"
              role="progressbar"
              aria-label={t("status.probeProgressAria")}
              aria-valuemin={0}
              aria-valuemax={probeRun.total}
              aria-valuenow={probeRun.done}
            >
              <span
                className="status__probe-progress-fill"
                style={{ width: `${probePct}%` }}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
