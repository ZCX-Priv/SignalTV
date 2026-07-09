import { Radio } from "lucide-react";

export function Loader() {
  return (
    <div className="loader">
      <div className="loader__inner">
        <div className="loader__mark">
          <Radio size={26} strokeWidth={2} />
          <span className="dot" />
        </div>
        <div className="loader__title display">
          SignalTV<em>·直播</em>
        </div>
        <div className="loader__sub mono">
          正在建立上行链路 · IPTV-ORG 索引
        </div>

        <div className="loader__bar">
          <span />
        </div>

        <div className="loader__log mono">
          <p>{"> 正在解析 iptv-org.github.io"}</p>
          <p>{"> 正在获取 channels.json"}</p>
          <p>{"> 正在获取 streams.json"}</p>
          <p>{"> 正在合并信号表"}</p>
          <p>{"> 正在同步广播网格"}<span className="loader__cursor">_</span></p>
        </div>
      </div>

      <div className="loader__scan" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="loader">
      <div className="loader__inner">
        <div className="loader__mark loader__mark--err">
          <Radio size={26} strokeWidth={2} />
        </div>
        <div className="loader__title display">
          上行链路<em>失败</em>
        </div>
        <div className="loader__sub mono">{message}</div>
        <button
          className="btn btn--primary"
          onClick={() => window.location.reload()}
          style={{ marginTop: 18 }}
        >
          重试连接
        </button>
      </div>
    </div>
  );
}
