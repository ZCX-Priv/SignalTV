import { useEffect, useRef, useState } from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { Loader2, AlertTriangle, Volume2 } from "lucide-react";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

type PlayerState = "idle" | "loading" | "ready" | "error";

interface TvPlayerProps {
  url: string | null;
  country?: string;
  onStateChange?: (s: PlayerState) => void;
  onMessageChange?: (m: string | null) => void;
  onLatencyChange?: (ms: number | null) => void;
}

export function TvPlayer({
  url,
  country,
  onStateChange,
  onMessageChange,
  onLatencyChange,
}: TvPlayerProps) {
  const [state, setState] = useState<PlayerState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const latencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 状态向上同步
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  useEffect(() => {
    onMessageChange?.(message);
  }, [message, onMessageChange]);

  useEffect(() => {
    onLatencyChange?.(latency);
  }, [latency, onLatencyChange]);

  // url 切换时重置状态并清理上一次的采样定时器
  useEffect(() => {
    if (!url) {
      setState("idle");
      setLatency(null);
      return;
    }
    setState("loading");
    setMessage(null);
    setLatency(null);
    return () => {
      if (latencyTimerRef.current) {
        clearInterval(latencyTimerRef.current);
        latencyTimerRef.current = null;
      }
    };
  }, [url]);

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (latencyTimerRef.current) {
        clearInterval(latencyTimerRef.current);
        latencyTimerRef.current = null;
      }
    };
  }, []);

  function startLatencySampling() {
    if (latencyTimerRef.current) clearInterval(latencyTimerRef.current);
    latencyTimerRef.current = setInterval(() => {
      const v = document.querySelector<HTMLVideoElement>(
        ".player__video [data-media-player] video"
      );
      if (v && v.buffered.length > 0) {
        const ms = Math.round(
          (v.buffered.end(v.buffered.length - 1) - v.currentTime) * 1000
        );
        setLatency(ms);
      }
    }, 1000);
  }

  return (
    <div className={`player__video ${state === "error" ? "is-error" : ""}`}>
      <MediaPlayer
        src={url ?? ""}
        streamType="live"
        autoPlay
        playsInline
        load="visible"
        onError={(detail) => {
          setState("error");
          setMessage(detail.message ?? "此直播流不可用。");
          if (latencyTimerRef.current) {
            clearInterval(latencyTimerRef.current);
            latencyTimerRef.current = null;
          }
        }}
        onCanPlay={() => {
          setState("ready");
          startLatencySampling();
        }}
        onWaiting={() => {
          // 缓冲时保持当前状态，不重置
        }}
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>

      {state === "loading" && (
        <div className="player__overlay">
          <Loader2 size={28} className="spin" />
          <p className="mono">正在获取信号…</p>
        </div>
      )}

      {state === "error" && (
        <div className="player__overlay player__overlay--error">
          <AlertTriangle size={28} />
          <h3 className="display">信号丢失。</h3>
          <p>{message ?? "此直播流不可用。"}</p>
          <p className="player__error-note mono">
            许多免费信号受地区限制或间歇性离线，请尝试同一电视网的其他频道。
          </p>
        </div>
      )}

      {state === "ready" && country && (
        <div className="player__signaltv mono">
          <Volume2 size={11} /> 信号已锁定 · {country}
        </div>
      )}

      <div className="player__scan" />
    </div>
  );
}
