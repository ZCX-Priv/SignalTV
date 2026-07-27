// iptv-org API 类型定义
// https://github.com/iptv-org/api

export interface Channel {
  id: string;
  name: string;
  alt_names?: string[] | null;
  network?: string | null;
  owners?: string[] | null;
  country: string;
  subdivision?: string | null;
  city?: string | null;
  categories: string[];
  is_nsfw: boolean;
  launched?: string | null;
  closed?: string | null;
  replaced_by?: string | null;
  website?: string | null;
  logo: string;
}

export interface Stream {
  channel: string;
  feed?: string | null;
  title?: string | null;
  url: string;
  referrer?: string | null;
  user_agent?: string | null;
}

export interface Category {
  id: string;
  name: string;
}

export interface Country {
  name: string;
  code: string;
  languages: string[];
  flag: string;
}

// UI 中使用的合并视图
export interface ChannelWithStream extends Channel {
  /** 首选流（streamUrls[0]），保留字段兼容现有调用 */
  streamUrl?: string;
  /** 按优先级排序的全部可用流（https 优先、无 referrer/user_agent 要求优先、m3u8 优先） */
  streamUrls: string[];
  streamCount: number;
}

export interface CountryInfo extends Country {
  channelCount: number;
}
