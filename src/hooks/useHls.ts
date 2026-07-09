import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type PlayerState = "idle" | "loading" | "ready" | "error";

export function useHls(url: string | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) {
      setState("idle");
      setLatency(null);
      return;
    }

    setState("loading");
    setMessage(null);
    setLatency(null);

    // 延迟采样定时器
    let latencyTimer: ReturnType<typeof setInterval> | null = null;
    function sampleLatency(hls: Hls | null, vid: HTMLVideoElement) {
      if (hls) {
        // hls.js 提供 latency 属性（秒），转毫秒
        const ms = Math.round((hls.latency ?? 0) * 1000);
        setLatency(ms);
      } else if (vid.buffered.length > 0) {
        // 原生 HLS 近似：缓冲末端 - 当前播放点
        const ms = Math.round((vid.buffered.end(vid.buffered.length - 1) - vid.currentTime) * 1000);
        setLatency(ms);
      }
    }

    // 原生 HLS（Safari、iOS）
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      const onLoaded = () => {
        setState("ready");
        latencyTimer = setInterval(() => sampleLatency(null, video), 1000);
      };
      const onError = () => {
        setState("error");
        setMessage("浏览器无法播放此直播流。");
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
      video.play().catch(() => {/* 可能需要用户手势 */});
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
        if (latencyTimer) clearInterval(latencyTimer);
        video.removeAttribute("src");
        video.load();
      };
    }

    // hls.js
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setState("ready");
        video.play().catch(() => {/* 自动播放可能被拦截 */});
        latencyTimer = setInterval(() => sampleLatency(hls, video), 1000);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setState("error");
              setMessage("网络错误——该直播流可能已离线或受地区限制。");
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setState("error");
              setMessage("无法加载此直播流。");
              break;
          }
        }
      });

      return () => {
        if (latencyTimer) clearInterval(latencyTimer);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    setState("error");
    setMessage("当前浏览器不支持 HLS 播放。");
    return;
  }, [url]);

  return { videoRef, state, message, latency };
}
