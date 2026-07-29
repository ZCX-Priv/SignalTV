// 流延迟探测模块
// 极速版：纯 fetch + #EXTM3U 头校验，抛弃 hls.js 实例化开销。
// 性能：单流开销 < 1ms（原 new Hls() 几十毫秒），超时 3000ms。
// 准确性：cors fetch 与 hls.js 行为等价（hls.js 播放时内部也是 cors fetch），
//         无 CORS 的流 hls.js 同样无法播放，标记 -1 不影响播放体验。
// 非 HLS 流不发请求直接返回 -1：no-cors 探测的 opaque 响应无法区分 404/200，
// 发请求也拿不到任何信息，纯属浪费带宽（弱网下尤其有害）。
//
// 高并发调度：浏览器 socket 池上限约 256、单主机 HTTP/1.1 上限 6 连接，
// 盲目并发上千 fetch 会在浏览器内部排队，排队时间混进 performance.now() 计时
// （跨域流几乎不带 Timing-Allow-Origin，Resource Timing 细分字段归零，无法事后修正）。
// 因此 probeBatch 采用主机感知调度：全局 128 路 + 单主机 4 路双层闸门，
// 保证发包时必有空闲 socket 配额，计时天然不含排队时间；
// 配合死主机熔断（同主机连续 3 次超时/网络错误即快速失败余下流），
// 千路测量总耗时逼近浏览器网络栈的物理下限。

const HLS_URL_RE = /\.m3u8(\?|$|#)/i;
const HLS_TIMEOUT_MS = 3000;
// 全局并发上限：低于 Chromium ~256 socket 池，留余量给页面自身请求
const GLOBAL_CONCURRENCY = 128;
// 单主机并发上限：低于浏览器同主机 6 连接限制，确保发出即建连、不在浏览器内部排队
const PER_HOST_CONCURRENCY = 4;
// 同主机连续超时/网络错误达到此阈值 → 本批次内熔断该主机，余下流立即判 -1
const HOST_FAIL_THRESHOLD = 3;

/** URL 是否为 HLS 流（.m3u8 后缀，可能带 query 或 fragment） */
function isHlsUrl(url: string): boolean {
  return HLS_URL_RE.test(url);
}

/**
 * 单次探测结果。
 * netFail 标记网络级失败（超时 / fetch reject），供主机熔断统计；
 * HTTP 4xx/5xx 与非 m3u8 内容说明主机活着，不算网络级失败。
 */
interface ProbeOutcome {
  ms: number;
  netFail: boolean;
}

/**
 * 用 cors fetch 探测 HLS 流：校验状态码 + 前 16 字节是否 #EXTM3U。
 * 收到响应头后立即 abort，不下载剩余 body。
 * @returns ProbeOutcome；失败/超时/非 m3u8 时 ms 为 -1
 */
function hlsProbe(
  url: string,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;

    // 统一 settle 出口：清理定时器与外部 signal 监听后再 resolve。
    // 共享的批量 signal 上不清理监听器会在一次滚动中堆积上千闭包
    const settle = (ms: number, abort: boolean, netFail = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      if (abort) controller.abort();
      resolve({ ms, netFail });
    };

    // 联动外部 signal：外部 abort 时同步 abort 内部 controller 并立即返回 -1
    // （外部取消不是主机故障，不计入熔断）
    const onExternalAbort = () => settle(-1, true);
    if (externalSignal?.aborted) {
      resolve({ ms: -1, netFail: false });
      return;
    }

    // 超时视为网络级失败，计入主机熔断
    const timer = setTimeout(() => settle(-1, true, true), timeoutMs);
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
        // 404/403/500 等明确不可用（主机活着，不计熔断）
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
            // 非 m3u8 内容（如 404 HTML 错误页）判为不可用（主机活着，不计熔断）
            settle(head.startsWith("#EXTM3U") ? ms : -1, false);
          })
          .catch(() => settle(-1, true, true)); // body 读取中断：网络级失败
      })
      .catch(() => settle(-1, false, true)); // cors 失败/网络错误：网络级失败
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
    return hlsProbe(url, timeoutMs ?? HLS_TIMEOUT_MS, signal).then((o) => o.ms);
  }
  return Promise.resolve(-1);
}

/** 主机桶：同主机任务共享并发限额与熔断状态 */
interface HostBucket {
  queue: { id: string; url: string }[];
  inFlight: number;
  consecFails: number;
  dead: boolean;
}

/** 提取 URL 主机名；解析失败的 URL 各自独立成桶（不与他人共享限额/熔断） */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return `invalid:${url}`;
  }
}

/**
 * 批量并发探测流延迟：主机感知调度 + 死主机熔断。
 * - 双层并发闸门：全局默认 128 路、单主机 4 路，发包时必有空闲 socket 配额，
 *   计时不含浏览器内部排队时间；
 * - 跨主机轮转（round-robin）派发，最大化同时覆盖的主机数，避免大主机霸占槽位；
 * - 同主机连续 3 次超时/网络错误即熔断，余下同主机流立即回调 -1 不再发请求。
 * @param urls 频道id → streamUrl 的映射
 * @param concurrency 全局最大并发数（默认 128）
 * @param onResult 每条结果回调（id, 延迟ms）
 * @param signal 外部 AbortSignal，触发后立即停止探测
 */
export function probeBatch(
  urls: Map<string, string>,
  concurrency: number = GLOBAL_CONCURRENCY,
  onResult: (id: string, ms: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolveAll) => {
    if (signal?.aborted || urls.size === 0) {
      resolveAll();
      return;
    }

    // 按主机分桶；非 HLS 流不发请求，直接同步回调 -1（不占并发槽位）
    let pending = 0;
    const buckets = new Map<string, HostBucket>();
    const ring: HostBucket[] = []; // 轮转环：仅存还有待派任务的桶
    for (const [id, url] of urls) {
      if (!isHlsUrl(url)) {
        onResult(id, -1);
        continue;
      }
      pending++;
      const host = hostOf(url);
      let b = buckets.get(host);
      if (!b) {
        b = { queue: [], inFlight: 0, consecFails: 0, dead: false };
        buckets.set(host, b);
        ring.push(b);
      }
      b.queue.push({ id, url });
    }
    if (pending === 0) {
      resolveAll();
      return;
    }

    let globalInFlight = 0;
    let rrIndex = 0;
    let finished = false;

    const report = (id: string, ms: number) => {
      pending--;
      onResult(id, ms);
    };

    // 结束条件：全部出结果，或已取消且在飞请求都已落地
    const maybeFinish = () => {
      if (finished) return;
      if (pending === 0 || (signal?.aborted && globalInFlight === 0)) {
        finished = true;
        resolveAll();
      }
    };

    const launch = (b: HostBucket, id: string, url: string) => {
      hlsProbe(url, HLS_TIMEOUT_MS, signal).then((out) => {
        globalInFlight--;
        b.inFlight--;
        // 取消后不再回调结果（与旧版 worker 行为一致），只等在飞请求落地后收尾
        if (signal?.aborted) {
          maybeFinish();
          return;
        }
        report(id, out.ms);
        if (out.ms >= 0 || !out.netFail) {
          // 成功、或“主机活着”的失败（4xx / 非 m3u8）都重置连续失败计数
          b.consecFails = 0;
        } else if (!b.dead && ++b.consecFails >= HOST_FAIL_THRESHOLD) {
          // 熔断：同主机余下任务立即判 -1，不再消耗槽位与超时等待
          b.dead = true;
          for (const t of b.queue) report(t.id, -1);
          b.queue.length = 0;
        }
        pump();
        maybeFinish();
      });
    };

    // 派发泵：跨主机轮转填满全局槽位；连续跑满一圈都没可派任务则停，
    // 等下一个请求落地后由其回调再次触发
    const pump = () => {
      let skipped = 0;
      while (
        !signal?.aborted &&
        globalInFlight < concurrency &&
        ring.length > 0 &&
        skipped < ring.length
      ) {
        if (rrIndex >= ring.length) rrIndex = 0;
        const b = ring[rrIndex];
        if (b.queue.length === 0) {
          ring.splice(rrIndex, 1); // 该主机任务已派完，移出轮转环
          skipped = 0;
          continue;
        }
        if (b.inFlight >= PER_HOST_CONCURRENCY) {
          rrIndex++;
          skipped++;
          continue;
        }
        const task = b.queue.shift()!;
        b.inFlight++;
        globalInFlight++;
        launch(b, task.id, task.url);
        rrIndex++;
        skipped = 0;
      }
    };

    pump();
    maybeFinish();
  });
}
