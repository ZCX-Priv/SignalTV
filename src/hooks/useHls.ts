import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type PlayerState = "idle" | "loading" | "ready" | "error";

export function useHls(url: string | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) {
      setState("idle");
      return;
    }

    setState("loading");
    setMessage(null);

    // 原生 HLS（Safari、iOS）
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      const onLoaded = () => setState("ready");
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
        hls.destroy();
        hlsRef.current = null;
      };
    }

    setState("error");
    setMessage("当前浏览器不支持 HLS 播放。");
    return;
  }, [url]);

  return { videoRef, state, message };
}
