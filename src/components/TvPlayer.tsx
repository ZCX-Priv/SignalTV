import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  MediaPlayer,
  MediaProvider,
  type MediaPlayerInstance,
  isHLSProvider,
} from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { Loader2, AlertTriangle, Play } from "lucide-react";
import { useStore } from "../store/useStore";
import { getVidstackTranslations, useI18n } from "../i18n";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

type PlayerState = "idle" | "loading" | "ready" | "paused" | "error";

interface TvPlayerProps {
  url: string | null;
  onStateChange?: (s: PlayerState) => void;
  onMessageChange?: (m: string | null) => void;
  onLatencyChange?: (ms: number | null) => void;
  /**
   * 当前流播放失败时调用；返回 true 表示父组件已切换到下一路流
   * （url 即将变化，保持 loading），返回 false 表示已无备用流 → 显示错误。
   */
  onStreamError?: () => boolean;
  /** 已尝试的流数（含当前），用于错误面板展示 */
  streamTried?: number;
  /** 该频道的流总数 */
  streamTotal?: number;
}

export function TvPlayer({
  url,
  onStateChange,
  onMessageChange,
  onLatencyChange,
  onStreamError,
  streamTried,
  streamTotal,
}: TvPlayerProps) {
  const { t } = useI18n();
  const [state, setState] = useState<PlayerState>("idle");
  // message 当前无 UI 消费者：错误详情展示/上抛链路的预留设计
  //（onMessageChange 同为预留 API 面），勿当死代码删除
  const [message, setMessage] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const latencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<MediaPlayerInstance>(null);
  // handlePlayFail 的 setTimeout handle，用于卸载/切换时清理
  const autoPlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 每路 url 仅首次 canplay 自动播放：rebuffer 后的 canplay 不再强制 play()，
  // 避免覆盖用户手动暂停的意图
  const hasAutoPlayedRef = useRef(false);

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
    hasAutoPlayedRef.current = false;
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
      const player = playerRef.current;
      if (!player) return;
      // 暂停期间不采样（延迟对静止画面无意义），恢复播放后自然继续
      if (player.state.paused) return;
      // 限定在本实例的 DOM 子树内取 video：全局选择器在多实例场景会取错元素
      const v = player.el?.querySelector("video") ?? null;
      // 前置过滤：视频元素不存在 / 未就绪 / 未开始播放 → 保持 null，避免误判
      if (!v || v.readyState < 2 || v.currentTime <= 0) return;

      // 优先：通过 vidstack provider 获取 hls.js 实例，读取真实直播延迟
      // hls.latency = estimateLiveEdge() - currentTime（秒），加载前为 0
      const provider = player.provider;
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

  // canPlay 触发后主动调用 play()：绕过 vidstack autoPlay 的 reduced motion 拦截，
  // 直接走浏览器原生自动播放策略（依赖用户点击 ChannelCard 产生的粘性激活 hasBeenActive）。
  // 失败由 onPlayFail 处理（注意不是 onAutoPlayFail，因为 autoPlaying signal 始终为 false）。
  // 仅首次 canplay 自动播放：rebuffer 恢复后的 canplay 不再强制 play()。
  function handleCanPlay() {
    // "点击播放"覆盖层显示中时不覆写为 ready，避免覆盖层消失但视频未播放
    setState((s) => (s === "paused" ? s : "ready"));
    startLatencySampling();
    if (hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    const player = playerRef.current;
    if (!player) return;
    // remoteControl.play() 仅 dispatch media-play-request 事件（返回 void），
    // 实际 play() 由 vidstack 内部异步执行，失败时触发 play-fail 事件 → onPlayFail
    player.remoteControl.play();
  }

  // play() 失败（非 autoPlay 流程）：直接显示"点击播放"覆盖层。
  // 依据 CCTV 报告 §3.3：不自动静音重试，等用户点击覆盖层后带声音播放。
  function handlePlayFail() {
    const player = playerRef.current;
    if (!player) return;

    // 清理上一个 timeout，避免快速连续触发时叠加
    if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    // 延迟到下一个事件循环，让 play() 的 promise 有机会 resolve
    autoPlayTimeoutRef.current = setTimeout(() => {
      autoPlayTimeoutRef.current = null;
      // 组件已卸载或 url 已切换（player 实例变化）→ 不再操作
      if (!playerRef.current || playerRef.current !== player) return;

      // 误判保护：如果 player 实际已经在播放，不显示 paused 覆盖层
      if (!playerRef.current.state.paused) {
        setState("ready");
        return;
      }

      // 真的没在播放 → 显示"点击播放"覆盖层
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
        setMessage(t("tv.startFailed"));
      }
    }
  }

  return (
    <div className={`player__video ${state === "error" ? "is-error" : ""}`}>
      <MediaPlayer
        ref={playerRef}
        src={url ?? ""}
        streamType="live"
        // 不设 autoPlay：绕过 vidstack 内部的 throwIfAutoplayingWithReducedMotion 检测
        // （vidstack 1.15.6 在 prefers-reduced-motion: reduce 时会直接抛 "[vidstack] autoplay blocked"）。
        // 改在 onCanPlay 中手动调用 player.remoteControl.play()，走浏览器原生自动播放策略，
        // 等价于 CCTV 报告 §3.1 中 video.autoplay = true 的乐观策略。
        playsInline
        load="eager"
        onProviderChange={(provider) => {
          if (isHLSProvider(provider)) {
            // 使用本地 hls.js,避免 vidstack 默认从 CDN 加载
            provider.library = Hls;
            // 弱网友好配置：按播放器尺寸封顶清晰度，缓冲区保守，
            // slow 网络（首屏实测 < 500KB/s）下进一步缩小缓冲长度
            const slow = useStore.getState().networkProfile === "slow";
            // 加载策略：hls.js 默认超时/重试偏宽松，弱网下 fatal 判定
            // 过晚导致故障转移（切下一路流）等待过长，收紧超时与重试上限
            const loadPolicy = (timeoutMs: number) => ({
              default: {
                maxTimeToFirstByteMs: timeoutMs,
                maxLoadTimeMs: timeoutMs * 2,
                timeoutRetry: {
                  maxNumRetry: 1,
                  retryDelayMs: 500,
                  maxRetryDelayMs: 1000,
                },
                errorRetry: {
                  maxNumRetry: slow ? 1 : 2,
                  retryDelayMs: 500,
                  maxRetryDelayMs: 2000,
                },
              },
            });
            provider.config = {
              capLevelToPlayerSize: true,
              maxBufferLength: slow ? 10 : 15,
              maxMaxBufferLength: 30,
              startLevel: -1,
              manifestLoadPolicy: loadPolicy(slow ? 8000 : 10000),
              playlistLoadPolicy: loadPolicy(slow ? 8000 : 10000),
              fragLoadPolicy: loadPolicy(slow ? 12000 : 20000),
            };
          }
        }}
        onError={(detail) => {
          if (latencyTimerRef.current) {
            clearInterval(latencyTimerRef.current);
            latencyTimerRef.current = null;
          }
          // 先尝试故障转移：父组件切到下一路流（url 即将变化 → 重新 loading）
          if (onStreamError?.()) {
            setState("loading");
            setMessage(null);
            return;
          }
          setState("error");
          setMessage(detail.message ?? t("tv.unavailable"));
        }}
        onCanPlay={handleCanPlay}
        onPlayFail={handlePlayFail}
        onPlay={() => {
          // 用户手动播放成功后，从 paused 状态恢复到 ready
          if (state === "paused") setState("ready");
        }}
      >
        <MediaProvider />
        {/* 控件词汇随当前语言切换（英文返回 undefined → vidstack 内置英文） */}
        <DefaultVideoLayout icons={defaultLayoutIcons} translations={getVidstackTranslations()} />
      </MediaPlayer>

      {state === "loading" && (
        <div className="player__overlay">
          <Loader2 size={28} className="spin" />
          <p className="mono">{t("tv.acquiring")}</p>
        </div>
      )}

      {state === "paused" && (
        <button
          type="button"
          className="player__overlay player__overlay--paused"
          onClick={handleManualPlay}
          aria-label={t("tv.tapToPlayAria")}
        >
          <Play size={48} fill="currentColor" />
          <span className="display">{t("tv.tapToPlay")}</span>
          <span className="mono">{t("tv.tapToPlayHint")}</span>
        </button>
      )}

      {state === "error" && (
        <div className="player__overlay player__overlay--error">
          <AlertTriangle size={28} />
          <h3 className="display">{t("tv.signalLost")}</h3>
          {streamTried !== undefined && streamTotal !== undefined && streamTotal > 1 && (
            <p className="mono player__error-note">
              {t("tv.triedStreams", { tried: streamTried, total: streamTotal })}
            </p>
          )}
          <p className="player__error-note mono">
            {t("tv.regionHint")}
          </p>
        </div>
      )}

      <div className="player__scan" />
    </div>
  );
}
