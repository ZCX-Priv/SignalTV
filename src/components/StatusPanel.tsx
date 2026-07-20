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

export function StatusPanel() {
  const loaded = useStore((s) => s.loaded);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const channels = useStore((s) => s.channels);
  const categories = useStore((s) => s.categories);
  const countries = useStore((s) => s.countries);
  const latency = useStore((s) => s.latency);
  const latencyLoading = useStore((s) => s.latencyLoading);

  // 派生连接状态
  const status = error
    ? { kind: "error" as const, label: "上行链路异常", Icon: AlertTriangle }
    : loading && !loaded
      ? { kind: "loading" as const, label: "正在建立上行链路", Icon: Loader2 }
      : loaded
        ? { kind: "ok" as const, label: "上行链路已建立", Icon: CheckCircle2 }
        : { kind: "idle" as const, label: "待命", Icon: Radio };

  // 延迟探测统计
  const probedCount = latency.size;
  const successCount = Array.from(latency.values()).filter((v) => v >= 0).length;

  return (
    <div className="status">
      <div className="status__head">
        <div className="eyebrow">
          <Radio size={11} /> 信号源
        </div>
        <h1 className="status__title display">状态</h1>
      </div>

      {/* 信号源状态区块 */}
      <section className="status__section">
        <header className="status__section-head">
          <h2>连接</h2>
          <p>当前信号源数据加载状态。</p>
        </header>
        <div className="status__connection">
          <span className={`status__indicator status__indicator--${status.kind}`}>
            <status.Icon size={16} className={status.kind === "loading" ? "spin" : ""} />
          </span>
          <div className="status__connection-body">
            <div className="status__connection-label">{status.label}</div>
            <div className="status__connection-sub mono">
              {error ? error : "公共电视信号源 · iptv-org"}
            </div>
          </div>
        </div>
      </section>

      {/* 数据统计区块 */}
      <section className="status__section">
        <header className="status__section-head">
          <h2>数据</h2>
          <p>已加载的频道、分类与国家数量。</p>
        </header>
        <div className="status__stats">
          <div className="status__stat">
            <Database size={14} />
            <span className="status__stat-value mono">{fmt(channels.size)}</span>
            <span className="status__stat-label">路频道</span>
          </div>
          <div className="status__stat">
            <Radio size={14} />
            <span className="status__stat-value mono">{fmt(categories.length)}</span>
            <span className="status__stat-label">个分类</span>
          </div>
          <div className="status__stat">
            <Activity size={14} />
            <span className="status__stat-value mono">{fmt(countries.length)}</span>
            <span className="status__stat-label">个国家</span>
          </div>
        </div>
      </section>

      {/* 延迟探测区块 */}
      <section className="status__section">
        <header className="status__section-head">
          <h2>延迟探测</h2>
          <p>对可见频道进行延迟测量，用于按延迟排序。</p>
        </header>
        <div className="status__probe">
          <div className="status__probe-row">
            <span className="status__probe-label">状态</span>
            <span className="status__probe-value mono">
              {latencyLoading ? "探测中…" : probedCount > 0 ? "已就绪" : "未启动"}
            </span>
          </div>
          <div className="status__probe-row">
            <span className="status__probe-label">已探测</span>
            <span className="status__probe-value mono">{fmt(probedCount)} 路</span>
          </div>
          {probedCount > 0 && (
            <div className="status__probe-row">
              <span className="status__probe-label">可达</span>
              <span className="status__probe-value mono">
                {fmt(successCount)} 路 ({Math.round((successCount / probedCount) * 100)}%)
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
