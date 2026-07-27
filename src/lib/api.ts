import type {
  Category,
  Channel,
  ChannelWithStream,
  Country,
  CountryInfo,
  Stream,
} from "../types";

const BASE = "https://iptv-org.github.io/api";
const DEFAULT_TIMEOUT_MS = 15_000;
// channels.json / streams.json 较大（1-2MB），单独放宽超时
const LARGE_FILE_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

class ApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  constructor(message: string, status?: number, retryable: boolean = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

// 首屏加载实测速度样本（仅大文件 channels.json / streams.json 产出），
// 用于弱网判定：聚合速度 < 500KB/s 判为弱网。
interface SpeedSample {
  bytes: number;
  ms: number;
}
const speedSamples: SpeedSample[] = [];

// 排除缓存干扰：字节数过小或耗时过短的样本大概率命中 SW/浏览器缓存，不计入
const MIN_SAMPLE_BYTES = 100_000;
const MIN_SAMPLE_MS = 50;

/**
 * 聚合实测下载速度（字节/秒）。无有效样本（全部命中缓存）时返回 null，
 * 调用方应回退到 Network Information API 判定。
 */
export function getMeasuredSpeed(): number | null {
  const valid = speedSamples.filter(
    (s) => s.bytes >= MIN_SAMPLE_BYTES && s.ms >= MIN_SAMPLE_MS,
  );
  if (valid.length === 0) return null;
  const bytes = valid.reduce((sum, s) => sum + s.bytes, 0);
  const ms = valid.reduce((sum, s) => sum + s.ms, 0);
  if (ms <= 0) return null;
  return (bytes / ms) * 1000;
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

  // 联动外部 signal：外部 abort 时同步 abort 内部 controller
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        () => controller.abort(),
        { once: true },
      );
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
      throw new ApiError(`请求失败 ${url}: ${res.status}`, res.status, retryable);
    }
    return res;
  } catch (err) {
    // AbortError 通常是超时，视为可重试
    if (err instanceof DOMException && err.name === "AbortError") {
      // 若是外部 signal 触发的 abort，不包装为可重试
      if (signal?.aborted) throw err;
      throw new ApiError(`请求超时 ${url}`, undefined, true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 手动读流并计量：累计字节数与耗时，产出一条测速样本，
 * 同时通过 onProgress 回报已下载字节数（供 Loader 显示进度）。
 * 无 body（极端环境）时回退 res.text()，不产出样本。
 */
async function readBodyMeasured(
  res: Response,
  onProgress?: (bytes: number) => void,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const start = performance.now();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      bytes += value.length;
      onProgress?.(bytes);
    }
  }
  const ms = performance.now() - start;
  speedSamples.push({ bytes, ms });
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
  /** 下载进度回调（仅 measure 时生效） */
  onProgress?: (bytes: number) => void;
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
      throw new ApiError("请求被取消", undefined, false);
    }
    try {
      const res = await fetchWithTimeout(url, timeoutMs, signal);
      let text: string;
      try {
        text = measure
          ? await readBodyMeasured(res, onProgress)
          : await res.text();
      } catch {
        // body 读取中断（网络闪断）：视为可重试的网络错误
        throw new ApiError(`响应读取失败 ${url}`, undefined, true);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        // JSON 解析失败（如 CDN 返回 HTML 错误页）：不重试
        throw new ApiError(
          `响应解析失败 ${url}（非 JSON 格式）`,
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
        const t = setTimeout(resolve, delay);
        // 支持外部 signal 提前取消等待
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
      });
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("加载广播数据失败。");
}

export const api = {
  channels: (signal?: AbortSignal, onProgress?: (bytes: number) => void) =>
    fetchJson<Channel[]>(`${BASE}/channels.json`, {
      timeoutMs: LARGE_FILE_TIMEOUT_MS,
      signal,
      measure: true,
      onProgress,
    }),
  streams: (signal?: AbortSignal, onProgress?: (bytes: number) => void) =>
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
    if (!s.url) continue;
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
