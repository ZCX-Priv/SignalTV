// 流延迟探测模块
// 极速版：纯 fetch + #EXTM3U 头校验，抛弃 hls.js 实例化开销。
// 性能：单流开销 < 1ms（原 new Hls() 几十毫秒），并发 16（原 4），超时 3000ms（原 7000ms）。
// 准确性：cors fetch 与 hls.js 行为等价（hls.js 播放时内部也是 cors fetch），
//         无 CORS 的流 hls.js 同样无法播放，标记 -1 不影响播放体验。

const HLS_URL_RE = /\.m3u8(\?|$|#)/i;
const HLS_TIMEOUT_MS = 3000;
const FETCH_TIMEOUT_MS = 2500;
const DEFAULT_CONCURRENCY = 16;

/** URL 是否为 HLS 流（.m3u8 后缀，可能带 query 或 fragment） */
function isHlsUrl(url: string): boolean {
  return HLS_URL_RE.test(url);
}

/**
 * 用 cors fetch 探测 HLS 流：校验状态码 + 前 16 字节是否 #EXTM3U。
 * 收到响应头后立即 abort，不下载剩余 body。
 * @returns 延迟毫秒数；失败/超时/非 m3u8 返回 -1
 */
function hlsProbe(url: string, timeoutMs: number, externalSignal?: AbortSignal): Promise<number> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;

    // 联动外部 signal：外部 abort 时同步 abort 内部 controller 并立即返回 -1
    const onExternalAbort = () => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(-1);
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        resolve(-1);
        return;
      }
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(-1);
    }, timeoutMs);
    const start = performance.now();
    fetch(url, {
      method: "GET",
      mode: "cors", // cors 模式，能区分 404/200
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    })
      .then((res) => {
        if (settled) return;
        // 404/403/500 等明确不可用
        if (!res.ok) {
          clearTimeout(timer);
          settled = true;
          controller.abort();
          resolve(-1);
          return;
        }
        // 读取前 16 字节校验 #EXTM3U
        if (!res.body) {
          const ms = Math.round(performance.now() - start);
          clearTimeout(timer);
          settled = true;
          controller.abort();
          resolve(ms);
          return;
        }
        const reader = res.body.getReader();
        reader
          .read()
          .then(({ value }) => {
            if (settled) return;
            const ms = Math.round(performance.now() - start);
            clearTimeout(timer);
            settled = true;
            reader.cancel().catch(() => {}); // 主动释放 reader，让浏览器停止下载剩余 body
            const head = new TextDecoder().decode(
              value?.slice(0, 16) ?? new Uint8Array(),
            );
            // 非 m3u8 内容（如 404 HTML 错误页）判为不可用
            if (!head.startsWith("#EXTM3U")) {
              resolve(-1);
              return;
            }
            resolve(ms);
          })
          .catch(() => {
            if (settled) return;
            clearTimeout(timer);
            settled = true;
            controller.abort();
            resolve(-1);
          });
      })
      .catch(() => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        resolve(-1); // cors 失败/超时/网络错误
      });
  });
}

/**
 * 用 fetch + no-cors 探测非 HLS 流（降级路径）。
 * 注意：no-cors 响应是 opaque，无法区分 404/200/500，任何响应都被视为"不可信"。
 * 因此此路径统一返回 -1（标记为"未知延迟"），避免把死链标记为低延迟误导用户。
 * 仅保留探测动作以验证网络可达性（用于未来扩展），当前不产出有效延迟值。
 * @returns 始终返回 -1（opaque 响应无法验证可用性）
 */
function fetchProbe(url: string, timeoutMs: number, externalSignal?: AbortSignal): Promise<number> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;

    const onExternalAbort = () => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(-1);
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        resolve(-1);
        return;
      }
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(-1);
    }, timeoutMs);
    fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    })
      .then(() => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        controller.abort(); // 释放连接
        // no-cors 响应 opaque，无法区分 404/200，统一标记为不可用
        resolve(-1);
      })
      .catch(() => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        resolve(-1);
      });
  });
}

/**
 * 探测单个流 URL 的延迟。
 * HLS 流（.m3u8）用 cors fetch + #EXTM3U 校验真实延迟；
 * 非 HLS 流用 no-cors 探测但因 opaque 响应无法验证可用性，统一返回 -1（标记为"未知"）。
 * @returns 延迟毫秒数；失败/超时/非 HLS 流返回 -1
 */
export function probeLatency(
  url: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<number> {
  if (isHlsUrl(url)) {
    return hlsProbe(url, timeoutMs ?? HLS_TIMEOUT_MS, signal);
  }
  return fetchProbe(url, timeoutMs ?? FETCH_TIMEOUT_MS, signal);
}

/**
 * 批量并发探测流延迟。统一单队列，并发 16。
 * @param urls 频道id → streamUrl 的映射
 * @param concurrency 最大并发数（默认 16）
 * @param onResult 每条结果回调（id, 延迟ms）
 * @param signal 外部 AbortSignal，触发后立即停止探测
 */
export async function probeBatch(
  urls: Map<string, string>,
  concurrency: number = DEFAULT_CONCURRENCY,
  onResult: (id: string, ms: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const entries = Array.from(urls.entries());
  let cursor = 0;

  // 已 abort 直接返回
  if (signal?.aborted) return;

  async function worker() {
    while (cursor < entries.length) {
      if (signal?.aborted) return;
      const idx = cursor++;
      const [id, url] = entries[idx];
      const ms = await probeLatency(url, undefined, signal);
      if (signal?.aborted) return;
      onResult(id, ms);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, entries.length) },
    () => worker(),
  );
  await Promise.all(workers);
}
