import type {
  Category,
  Channel,
  ChannelWithStream,
  Country,
  CountryInfo,
  Stream,
} from "../types";
import type { MsgKey, TParams } from "../i18n";

const BASE = "https://iptv-org.github.io/api";
const DEFAULT_TIMEOUT_MS = 15_000;
// channels.json / streams.json 较大（1-2MB），单独放宽超时
const LARGE_FILE_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
// body 读取的 chunk 间隔停滞超时：fetchWithTimeout 的超时只覆盖响应头阶段，
// 弱网下 body 中途停滞（stall）需单独判定——60s 无新 chunk 即视为网络中断
const BODY_STALL_TIMEOUT_MS = 60_000;

/** 面向 UI 的错误描述：存文案 key + 插值参数，展示时再翻译（切语言后仍正确） */
export interface ApiErrorInfo {
  key: MsgKey;
  params?: TParams;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  /** UI 展示用的文案 key（message 保留英文便于控制台排查） */
  readonly info: ApiErrorInfo;
  constructor(
    message: string,
    info: ApiErrorInfo,
    status?: number,
    retryable: boolean = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.info = info;
    this.status = status;
    this.retryable = retryable;
  }
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) return err.retryable;
  // TypeError 通常是网络错误（fetch 失败）
  return err instanceof TypeError;
}

/**
 * 带超时的 fetch：AbortController + setTimeout。
 * 支持外部 AbortSignal 联动，任一触发即取消请求。
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 联动外部 signal：外部 abort 时同步 abort 内部 controller；
  // settle 后移除监听，避免重试循环对同一共享 signal 反复堆积闭包
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // 优先使用浏览器缓存（PWA 已配 StaleWhileRevalidate）
      cache: "default",
    });
    if (!res.ok) {
      // 仅 5xx 与 429 视为可重试，4xx 不重试
      const retryable = res.status >= 500 || res.status === 429;
      throw new ApiError(
        `Request failed ${url}: ${res.status}`,
        { key: "api.requestFailed", params: { url, status: res.status } },
        res.status,
        retryable,
      );
    }
    return res;
  } catch (err) {
    // AbortError 通常是超时，视为可重试
    if (err instanceof DOMException && err.name === "AbortError") {
      // 若是外部 signal 触发的 abort，不包装为可重试
      if (signal?.aborted) throw err;
      throw new ApiError(
        `Request timed out ${url}`,
        { key: "api.timeout", params: { url } },
        undefined,
        true,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * 手动读流并回报进度：通过 onProgress 回报已下载（解压后）字节数与
 * Content-Length（供 Loader 显示进度；百分比分母优先由 store 侧用上次
 * 会话实测体积提供 —— gzip 传输下 Content-Length 是压缩后大小，与解压后
 * 字节比值失真，仅供 store 侧在首访无实测基准时按估算比率兜底分母）。
 * 无 body（极端环境）时回退 res.text()。
 * chunk 间隔停滞超时：连接中途停滞时 reader.read() 会无限挂起
 * （fetchWithTimeout 的超时在收到响应头后已解除），60s 无新数据即
 * cancel reader 使 read() 以 reject 结束，由 fetchJson 按可重试错误处理。
 */
async function readBodyMeasured(
  res: Response,
  onProgress?: (bytes: number, contentLength?: number) => void,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  // Content-Length 属 CORS 安全响应头可直接读取；无效或缺失时回报 undefined
  const lenRaw = Number(res.headers.get("content-length"));
  const contentLength = Number.isFinite(lenRaw) && lenRaw > 0 ? lenRaw : undefined;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let stalled = false;
  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      // cancel 后进行中的 read() 以 reject/done 结束，跳出读取循环
      void reader.cancel(new Error("body stalled")).catch(() => {});
    }, BODY_STALL_TIMEOUT_MS);
  };
  try {
    armStallTimer();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // cancel 触发的 read() 可能以 done 而非 reject 结束：
        // 停滞超时路径必须抛错，否则截断的 body 会进入 JSON.parse
        if (stalled) throw new Error("body stalled");
        break;
      }
      if (stalled) throw new Error("body stalled");
      armStallTimer();
      if (value) {
        chunks.push(value);
        bytes += value.length;
        onProgress?.(bytes, contentLength);
      }
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
  const buf = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(buf);
}

interface FetchJsonOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 手动读流计量下载速度（仅大文件开启） */
  measure?: boolean;
  /** 下载进度回调（仅 measure 时生效；回报解压后已下载字节数与压缩后 Content-Length） */
  onProgress?: (bytes: number, contentLength?: number) => void;
}

/**
 * 完整的 JSON 请求：超时 + 指数退避重试 + JSON 解析保护。
 * measure 模式下手动读流产出测速样本（功能与 res.json() 等价）。
 */
async function fetchJson<T>(url: string, opts: FetchJsonOpts = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, measure, onProgress } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 外部 signal 已 abort 时直接退出
    if (signal?.aborted) {
      throw new ApiError("Request cancelled", { key: "api.cancelled" }, undefined, false);
    }
    try {
      const res = await fetchWithTimeout(url, timeoutMs, signal);
      let text: string;
      try {
        text = measure
          ? await readBodyMeasured(res, onProgress)
          : await res.text();
      } catch {
        // 外部取消导致的读取中断：保留取消语义，不包装为可重试的读取失败
        if (signal?.aborted) {
          throw new ApiError("Request cancelled", { key: "api.cancelled" }, undefined, false);
        }
        // body 读取中断（网络闪断/停滞超时）：视为可重试的网络错误
        throw new ApiError(
          `Failed to read response ${url}`,
          { key: "api.readFailed", params: { url } },
          undefined,
          true,
        );
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        // JSON 解析失败（如 CDN 返回 HTML 错误页）：不重试
        throw new ApiError(
          `Failed to parse response ${url} (not JSON)`,
          { key: "api.parseFailed", params: { url } },
          undefined,
          false,
        );
      }
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) break;
      if (!isRetryableError(err)) break;
      if (signal?.aborted) break;

      // 指数退避：500ms → 1000ms
      const delay = 500 * Math.pow(2, attempt);
      await new Promise<void>((resolve) => {
        // 支持外部 signal 提前取消等待；结束后移除监听避免闭包堆积
        const onAbort = () => {
          clearTimeout(t);
          resolve();
        };
        const t = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, delay);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new ApiError("Failed to load broadcast data.", { key: "api.loadFailed" });
}

export const api = {
  channels: (signal?: AbortSignal, onProgress?: (bytes: number, contentLength?: number) => void) =>
    fetchJson<Channel[]>(`${BASE}/channels.json`, {
      timeoutMs: LARGE_FILE_TIMEOUT_MS,
      signal,
      measure: true,
      onProgress,
    }),
  streams: (signal?: AbortSignal, onProgress?: (bytes: number, contentLength?: number) => void) =>
    fetchJson<Stream[]>(`${BASE}/streams.json`, {
      timeoutMs: LARGE_FILE_TIMEOUT_MS,
      signal,
      measure: true,
      onProgress,
    }),
  categories: (signal?: AbortSignal) =>
    fetchJson<Category[]>(`${BASE}/categories.json`, { signal }),
  countries: (signal?: AbortSignal) =>
    fetchJson<Country[]>(`${BASE}/countries.json`, { signal }),
};

const HLS_URL_RE = /\.m3u8(\?|$|#)/i;

// 流 URL 协议白名单：第三方数据集可能被污染，伪协议（javascript: 等）
// 不得进入 video src / hls.js / 延迟探测的消费链路
const STREAM_PROTOCOL_RE = /^https?:\/\//i;

/**
 * 流优先级评分（越大越优）：
 * - https 优先于 http（页面为 https 时 http 流必被混合内容拦截）
 * - 无 referrer/user_agent 要求的优先（浏览器无法设置这些头，带要求的流大概率失败）
 * - .m3u8 优先（hls.js 可靠播放路径）
 */
function streamPriority(s: Stream): number {
  let score = 0;
  if (s.url.startsWith("https://")) score += 4;
  if (!s.referrer && !s.user_agent) score += 2;
  if (HLS_URL_RE.test(s.url)) score += 1;
  return score;
}

/**
 * 合并频道与流，返回以频道 id 为键的 Map。
 * 部分频道有多路流——按优先级排序后全部保留（streamUrls），
 * 首选流放入 streamUrl，播放失败时可按序故障转移到后续流。
 */
export function buildChannelIndex(
  channels: Channel[],
  streams: Stream[],
): Map<string, ChannelWithStream> {
  const streamMap = new Map<string, Stream[]>();
  for (const s of streams) {
    // 只接受 http/https 协议的流 URL（阻断伪协议注入）
    if (!s.url || !STREAM_PROTOCOL_RE.test(s.url)) continue;
    const arr = streamMap.get(s.channel);
    if (arr) arr.push(s);
    else streamMap.set(s.channel, [s]);
  }

  const out = new Map<string, ChannelWithStream>();
  for (const ch of channels) {
    const arr = streamMap.get(ch.id);
    if (!arr || arr.length === 0) continue; // 跳过没有流的频道
    if (arr.length > 1) {
      arr.sort((a, b) => streamPriority(b) - streamPriority(a));
    }
    const urls = arr.map((s) => s.url);
    out.set(ch.id, {
      ...ch,
      // 字段归一化：API 数据个别记录可能缺失/为 null，
      // 消除下游 .includes / .toLowerCase 的崩溃点
      country: typeof ch.country === "string" ? ch.country : "",
      categories: Array.isArray(ch.categories) ? ch.categories : [],
      streamUrl: urls[0],
      streamUrls: urls,
      streamCount: urls.length,
    });
  }
  return out;
}

export function buildCountryInfo(
  countries: Country[],
  channels: Map<string, ChannelWithStream>,
): CountryInfo[] {
  const counts = new Map<string, number>();
  for (const ch of channels.values()) {
    counts.set(ch.country, (counts.get(ch.country) ?? 0) + 1);
  }
  return countries
    .map((c) => ({ ...c, channelCount: counts.get(c.code) ?? 0 }))
    .filter((c) => c.channelCount > 0)
    .sort((a, b) => b.channelCount - a.channelCount);
}
