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

export interface Language {
  code: string;
  name: string;
}

// UI 中使用的合并视图
export interface ChannelWithStream extends Channel {
  streamUrl?: string;
  streamCount: number;
}

export interface CountryInfo extends Country {
  channelCount: number;
}
