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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`请求失败 ${url}: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  channels: () => fetchJson<Channel[]>(`${BASE}/channels.json`),
  streams: () => fetchJson<Stream[]>(`${BASE}/streams.json`),
  categories: () => fetchJson<Category[]>(`${BASE}/categories.json`),
  countries: () => fetchJson<Country[]>(`${BASE}/countries.json`),
  languages: () => fetchJson<Language[]>(`${BASE}/languages.json`),
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
