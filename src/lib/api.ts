import type {
  Category,
  Channel,
  ChannelWithStream,
  Country,
  CountryInfo,
  Language,
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
 * 完整的 JSON 请求：超时 + 指数退避重试 + JSON 解析保护。
 * @param url 请求 URL
 * @param timeoutMs 单次请求超时（含重试时的每次）
 * @param signal 外部 AbortSignal，触发后立即停止重试
 */
async function fetchJson<T>(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 外部 signal 已 abort 时直接退出
    if (signal?.aborted) {
      throw new ApiError("请求被取消", undefined, false);
    }
    try {
      const res = await fetchWithTimeout(url, timeoutMs, signal);
      try {
        return (await res.json()) as T;
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
  channels: (signal?: AbortSignal) =>
    fetchJson<Channel[]>(`${BASE}/channels.json`, LARGE_FILE_TIMEOUT_MS, signal),
  streams: (signal?: AbortSignal) =>
    fetchJson<Stream[]>(`${BASE}/streams.json`, LARGE_FILE_TIMEOUT_MS, signal),
  categories: (signal?: AbortSignal) =>
    fetchJson<Category[]>(`${BASE}/categories.json`, DEFAULT_TIMEOUT_MS, signal),
  countries: (signal?: AbortSignal) =>
    fetchJson<Country[]>(`${BASE}/countries.json`, DEFAULT_TIMEOUT_MS, signal),
  languages: (signal?: AbortSignal) =>
    fetchJson<Language[]>(`${BASE}/languages.json`, DEFAULT_TIMEOUT_MS, signal),
};

/**
 * 合并频道与流，返回以频道 id 为键的 Map。
 * 部分频道有多路流——保留第一个可用流，并暴露流数量。
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
    out.set(ch.id, {
      ...ch,
      streamUrl: arr[0].url,
      streamCount: arr.length,
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
