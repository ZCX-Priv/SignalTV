// 流延迟探测模块
// 用 hls.js 加载 manifest 验证 HLS 流可用性；非 HLS 流降级到 fetch + 立即 abort。
// 修复原 no-cors fetch 方案的两个根本缺陷：
//   1) 连接池耗尽导致活跃直播流被误判为"无信号"
//   2) no-cors 无法区分 404/200 导致死亡流被误判为"低延迟"

import Hls from "hls.js";

const HLS_URL_RE = /\.m3u8(\?|$|#)/i;
const HLS_TIMEOUT_MS = 7000;
const FETCH_TIMEOUT_MS = 4000;
const HLS_CONCURRENCY = 4;
const FETCH_CONCURRENCY = 6;

/** URL 是否为 HLS 流（.m3u8 后缀，可能带 query 或 fragment） */
function isHlsUrl(url: string): boolean {
  return HLS_URL_RE.test(url);
}

/**
 * 用 hls.js 加载 manifest 验证 HLS 流可用性。
 * autoStartLoad: false → 只下载 m3u8 manifest，不下载分片，带宽极低。
 * MANIFEST_PARSED = 流可用；fatal ERROR / 超时 = 流不可用。
 * @returns 延迟毫秒数；失败/超时返回 -1
 */
function hlsProbe(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    if (!Hls.isSupported()) {
      // 浏览器不支持 MSE，降级到 fetch
      void fetchProbe(url, timeoutMs).then(resolve);
      return;
    }
    let settled = false;
    const hls = new Hls({
      autoStartLoad: false, // 只加载 manifest，不下载分片
      enableWorker: false,
      lowLatencyMode: false,
    });
    const start = performance.now();
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      hls.destroy();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(-1);
    }, timeoutMs);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (settled) return;
      const ms = Math.round(performance.now() - start);
      cleanup();
      resolve(ms);
    });
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (settled) return;
      // 仅致命错误判定为不可用；非致命错误允许继续尝试
      if (data?.fatal) {
        cleanup();
        resolve(-1);
      }
    });
    hls.loadSource(url);
  });
}

/**
 * 用 fetch + no-cors 探测非 HLS 流的连通延迟（降级路径）。
 * 收到响应头后立即 abort，释放连接，避免下载 body 导致连接池耗尽。
 * 注意：no-cors 无法区分 404/200，此路径仅用于无法用 hls.js 处理的流。
 * @returns 延迟毫秒数；失败/超时返回 -1
 */
function fetchProbe(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(-1);
    }, timeoutMs);
    const start = performance.now();
    fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    })
      .then(() => {
        if (settled) return;
        const ms = Math.round(performance.now() - start);
        // 收到响应头后立即 abort，释放连接，避免浏览器在后台继续下载 body
        controller.abort();
        clearTimeout(timer);
        settled = true;
        resolve(ms);
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
 * HLS 流用 hls.js 验证 manifest；非 HLS 流降级到 fetch + abort。
 * @returns 延迟毫秒数；失败/超时返回 -1
 */
export function probeLatency(url: string, timeoutMs?: number): Promise<number> {
  if (isHlsUrl(url) && Hls.isSupported()) {
    return hlsProbe(url, timeoutMs ?? HLS_TIMEOUT_MS);
  }
  return fetchProbe(url, timeoutMs ?? FETCH_TIMEOUT_MS);
}

/**
 * 批量并发探测流延迟。
 * 拆分为 HLS 队列（并发 4）与非 HLS 队列（并发 6），两队列并行执行。
 * @param urls 频道id → streamUrl 的映射
 * @param _concurrency 保留参数（为兼容旧签名），实际并发由内部按类型分配
 * @param onResult 每条结果回调（id, 延迟ms）
 */
export async function probeBatch(
  urls: Map<string, string>,
  _concurrency = 8,
  onResult: (id: string, ms: number) => void,
): Promise<void> {
  const hlsEntries: Array<[string, string]> = [];
  const fetchEntries: Array<[string, string]> = [];
  for (const [id, url] of urls.entries()) {
    if (!url) continue;
    if (isHlsUrl(url)) {
      hlsEntries.push([id, url]);
    } else {
      fetchEntries.push([id, url]);
    }
  }

  async function runQueue(
    entries: Array<[string, string]>,
    concurrency: number,
    probe: (url: string) => Promise<number>,
  ): Promise<void> {
    let cursor = 0;
    async function worker() {
      while (cursor < entries.length) {
        const idx = cursor++;
        const [id, url] = entries[idx];
        const ms = await probe(url);
        onResult(id, ms);
      }
    }
    const workers = Array.from(
      { length: Math.min(concurrency, entries.length) },
      () => worker(),
    );
    await Promise.all(workers);
  }

  await Promise.all([
    runQueue(hlsEntries, HLS_CONCURRENCY, (url) => hlsProbe(url, HLS_TIMEOUT_MS)),
    runQueue(fetchEntries, FETCH_CONCURRENCY, (url) => fetchProbe(url, FETCH_TIMEOUT_MS)),
  ]);
}
