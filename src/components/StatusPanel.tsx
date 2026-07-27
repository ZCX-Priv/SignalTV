import {
  Radio,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Database,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { fmt } from "../lib/format";
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
              {probedCount > 0 ? t("status.probeReady") : t("status.probeIdle")}
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
        </div>
      </section>
    </div>
  );
}
