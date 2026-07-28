// 流延迟探测模块
// 极速版：纯 fetch + #EXTM3U 头校验，抛弃 hls.js 实例化开销。
// 性能：单流开销 < 1ms（原 new Hls() 几十毫秒），超时 3000ms。
// 准确性：cors fetch 与 hls.js 行为等价（hls.js 播放时内部也是 cors fetch），
//         无 CORS 的流 hls.js 同样无法播放，标记 -1 不影响播放体验。
// 非 HLS 流不发请求直接返回 -1：no-cors 探测的 opaque 响应无法区分 404/200，
// 发请求也拿不到任何信息，纯属浪费带宽（弱网下尤其有害）。

const HLS_URL_RE = /\.m3u8(\?|$|#)/i;
const HLS_TIMEOUT_MS = 3000;
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

    // 统一 settle 出口：清理定时器与外部 signal 监听后再 resolve。
    // 共享的批量 signal 上不清理监听器会在一次滚动中堆积上千闭包
    const settle = (ms: number, abort: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      if (abort) controller.abort();
      resolve(ms);
    };

    // 联动外部 signal：外部 abort 时同步 abort 内部 controller 并立即返回 -1
    const onExternalAbort = () => settle(-1, true);
    if (externalSignal?.aborted) {
      resolve(-1);
      return;
    }

    const timer = setTimeout(() => settle(-1, true), timeoutMs);
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
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
          settle(-1, true);
          return;
        }
        // 读取前 16 字节校验 #EXTM3U
        if (!res.body) {
          settle(Math.round(performance.now() - start), true);
          return;
        }
        const reader = res.body.getReader();
        reader
          .read()
          .then(({ value }) => {
            if (settled) return;
            const ms = Math.round(performance.now() - start);
            reader.cancel().catch(() => {}); // 主动释放 reader，让浏览器停止下载剩余 body
            let head = new TextDecoder().decode(
              value?.slice(0, 20) ?? new Uint8Array(),
            );
            // 部分源带 UTF-8 BOM（\uFEFF#EXTM3U），剥离后再校验，避免误判 -1
            if (head.charCodeAt(0) === 0xfeff) head = head.slice(1);
            // 非 m3u8 内容（如 404 HTML 错误页）判为不可用
            settle(head.startsWith("#EXTM3U") ? ms : -1, false);
          })
          .catch(() => settle(-1, true));
      })
      .catch(() => settle(-1, false)); // cors 失败/超时/网络错误
  });
}

/**
 * 探测单个流 URL 的延迟。
 * HLS 流（.m3u8）用 cors fetch + #EXTM3U 校验真实延迟；
 * 非 HLS 流不发请求直接返回 -1（opaque 响应无法验证可用性，发请求纯属浪费带宽）。
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
  return Promise.resolve(-1);
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
