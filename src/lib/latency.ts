// 流延迟探测模块
// 用 no-cors GET 测量 IPTV 流的连通延迟（TTFB 近似）

/**
 * 探测单个流 URL 的延迟。
 * 使用 no-cors GET 请求，响应为 opaque，但 Promise resolve 时间可作连通延迟参考。
 * @returns 延迟毫秒数；失败/超时返回 -1
 */
export function probeLatency(url: string, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
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
        clearTimeout(timer);
        resolve(Math.round(performance.now() - start));
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(-1);
      });
  });
}

/**
 * 批量并发探测流延迟。
 * @param urls 频道id → streamUrl 的映射
 * @param concurrency 最大并发数
 * @param onResult 每条结果回调（id, 延迟ms）
 */
export async function probeBatch(
  urls: Map<string, string>,
  concurrency = 8,
  onResult: (id: string, ms: number) => void,
): Promise<void> {
  const entries = Array.from(urls.entries());
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const idx = cursor++;
      const [id, url] = entries[idx];
      const ms = await probeLatency(url);
      onResult(id, ms);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
  await Promise.all(workers);
}
