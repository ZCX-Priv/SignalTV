import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  MediaPlayer,
  MediaProvider,
  type MediaPlayerInstance,
  type MediaAutoPlayFailEventDetail,
  isHLSProvider,
} from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { Loader2, AlertTriangle, Play } from "lucide-react";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

// vidstack DefaultVideoLayout 中文翻译（覆盖 DefaultLayoutWord 全部词汇）
const zhCNLayoutTranslations = {
  "Announcements": "通知",
  "Accessibility": "无障碍",
  "AirPlay": "AirPlay",
  "Audio": "音频",
  "Auto": "自动",
  "Boost": "增益",
  "Captions": "字幕",
  "Caption Styles": "字幕样式",
  "Captions look like this": "字幕看起来像这样",
  "Chapters": "章节",
  "Closed-Captions Off": "关闭字幕",
  "Closed-Captions On": "开启字幕",
  "Connected": "已连接",
  "Continue": "继续",
  "Connecting": "连接中",
  "Default": "默认",
  "Disabled": "已禁用",
  "Disconnected": "已断开",
  "Display Background": "显示背景",
  "Download": "下载",
  "Enter Fullscreen": "进入全屏",
  "Enter PiP": "进入画中画",
  "Exit Fullscreen": "退出全屏",
  "Exit PiP": "退出画中画",
  "Font": "字体",
  "Family": "字体族",
  "Fullscreen": "全屏",
  "Google Cast": "Google 投屏",
  "Keyboard Animations": "键盘动画",
  "LIVE": "直播",
  "Loop": "循环",
  "Mute": "静音",
  "Normal": "正常",
  "Off": "关闭",
  "Pause": "暂停",
  "Play": "播放",
  "Playback": "播放",
  "PiP": "画中画",
  "Quality": "画质",
  "Replay": "重播",
  "Reset": "重置",
  "Seek Backward": "快退",
  "Seek Forward": "快进",
  "Seek": "跳转",
  "Settings": "设置",
  "Skip To Live": "跳至直播",
  "Speed": "速度",
  "Size": "大小",
  "Color": "颜色",
  "Opacity": "不透明度",
  "Shadow": "阴影",
  "Text": "文字",
  "Text Background": "文字背景",
  "Track": "音轨",
  "Unmute": "取消静音",
  "Volume": "音量",
} as const;

type PlayerState = "idle" | "loading" | "ready" | "paused" | "error";

interface TvPlayerProps {
  url: string | null;
  onStateChange?: (s: PlayerState) => void;
  onMessageChange?: (m: string | null) => void;
  onLatencyChange?: (ms: number | null) => void;
}

export function TvPlayer({
  url,
  onStateChange,
  onMessageChange,
  onLatencyChange,
}: TvPlayerProps) {
  const [state, setState] = useState<PlayerState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const latencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<MediaPlayerInstance>(null);
  // 防止 onAutoPlayFail 与 onCanPlay 之间形成无限重试循环
  const autoPlayRetryRef = useRef(false);
  // handleAutoPlayFail 的 setTimeout handle，用于卸载/切换时清理
  const autoPlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      autoPlayRetryRef.current = false;
      return;
    }
    setState("loading");
    setMessage(null);
    setLatency(null);
    autoPlayRetryRef.current = false;
    return () => {
      if (latencyTimerRef.current) {
        clearInterval(latencyTimerRef.current);
        latencyTimerRef.current = null;
      }
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
        autoPlayTimeoutRef.current = null;
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
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
        autoPlayTimeoutRef.current = null;
      }
    };
  }, []);

  function startLatencySampling() {
    if (latencyTimerRef.current) clearInterval(latencyTimerRef.current);
    latencyTimerRef.current = setInterval(() => {
      const v = document.querySelector<HTMLVideoElement>(
        ".player__video [data-media-player] video"
      );
      // 前置过滤：视频元素不存在 / 未就绪 / 未开始播放 → 保持 null，避免误判
      if (!v || v.readyState < 2 || v.currentTime <= 0) return;

      // 优先：通过 vidstack provider 获取 hls.js 实例，读取真实直播延迟
      // hls.latency = estimateLiveEdge() - currentTime（秒），加载前为 0
      const provider = playerRef.current?.provider;
      if (provider && isHLSProvider(provider)) {
        const hls = provider.instance;
        const latencySec = hls?.latency ?? 0;
        if (latencySec > 0) {
          setLatency(Math.round(latencySec * 1000));
          return;
        }
      }

      // 降级：用 seekable.end（直播边缘）- currentTime 计算延迟
      // 不用 buffered.end，因为缓冲区为空时会误判为 0ms
      if (v.seekable.length > 0) {
        const ms = Math.round(
          (v.seekable.end(v.seekable.length - 1) - v.currentTime) * 1000
        );
        if (ms >= 0) setLatency(ms);
      }
    }, 1000);
  }

  // canPlay 触发后仅更新状态并启动延迟采样
  // 不主动调用 play()，避免与 vidstack autoPlay 机制冲突导致 onAutoPlayFail 误触发
  function handleCanPlay() {
    setState("ready");
    startLatencySampling();
  }

  // 自动播放失败时：延迟检查 player 实际状态，避免"播放成功但 onAutoPlayFail 仍被触发"的误判
  function handleAutoPlayFail(detail: MediaAutoPlayFailEventDetail) {
    const player = playerRef.current;
    if (!player) return;

    // 清理上一个 timeout，避免快速连续触发时叠加
    if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    // 延迟到下一个事件循环，让 play() 的 promise 有机会 resolve
    autoPlayTimeoutRef.current = setTimeout(() => {
      autoPlayTimeoutRef.current = null;
      // 组件已卸载或 url 已切换（player 实例变化）→ 不再操作
      if (!playerRef.current || playerRef.current !== player) return;

      // 检查 player 实际状态：如果已经在播放，不要显示 paused 覆盖层
      if (!player.state.paused) {
        setState("ready");
        return;
      }

      // 真的没在播放，执行重试逻辑
      if (autoPlayRetryRef.current) {
        setState("paused");
        return;
      }
      autoPlayRetryRef.current = true;

      // 未静音失败 → 强制静音后重试
      if (!detail.muted) {
        try {
          player.remoteControl.mute();
          player.remoteControl.play();
          return;
        } catch {
          setState("paused");
          return;
        }
      }

      // 已静音仍失败 → 等待用户手动点击
      setState("paused");
    }, 0);
  }

  // 最终层：用户点击"点击播放"覆盖层（合法 user gesture，可取消静音）
  function handleManualPlay() {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.remoteControl.unmute();
      player.remoteControl.play();
      setState("ready");
    } catch {
      // 取消静音失败 → 退回静音播放
      try {
        player.remoteControl.mute();
        player.remoteControl.play();
        setState("ready");
      } catch {
        setState("error");
        setMessage("无法启动播放，请重试或切换频道。");
      }
    }
  }

  return (
    <div className={`player__video ${state === "error" ? "is-error" : ""}`}>
      <MediaPlayer
        ref={playerRef}
        src={url ?? ""}
        streamType="live"
        autoPlay
        muted
        playsInline
        load="eager"
        onProviderChange={(provider) => {
          if (isHLSProvider(provider)) {
            // 使用本地 hls.js,避免 vidstack 默认从 CDN 加载
            provider.library = Hls;
          }
        }}
        onError={(detail) => {
          setState("error");
          setMessage(detail.message ?? "此直播流不可用。");
          if (latencyTimerRef.current) {
            clearInterval(latencyTimerRef.current);
            latencyTimerRef.current = null;
          }
        }}
        onCanPlay={handleCanPlay}
        onAutoPlayFail={handleAutoPlayFail}
        onPlay={() => {
          // 用户手动播放成功后，从 paused 状态恢复到 ready
          if (state === "paused") setState("ready");
        }}
        onWaiting={() => {
          // 缓冲时保持当前状态，不重置
        }}
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} translations={zhCNLayoutTranslations} />
      </MediaPlayer>

      {state === "loading" && (
        <div className="player__overlay">
          <Loader2 size={28} className="spin" />
          <p className="mono">正在获取信号…</p>
        </div>
      )}

      {state === "paused" && (
        <button
          type="button"
          className="player__overlay player__overlay--paused"
          onClick={handleManualPlay}
          aria-label="点击开始播放"
        >
          <Play size={48} fill="currentColor" />
          <span className="display">点击播放</span>
          <span className="mono">浏览器策略要求手动启动</span>
        </button>
      )}

      {state === "error" && (
        <div className="player__overlay player__overlay--error">
          <AlertTriangle size={28} />
          <h3 className="display">信号丢失。</h3>
          <p>{message ?? "此直播流不可用。"}</p>
          <p className="player__error-note mono">
            许多免费信号受地区限制或间歇性离线，请尝试同一电视台的其他频道。
          </p>
        </div>
      )}

      <div className="player__scan" />
    </div>
  );
}
