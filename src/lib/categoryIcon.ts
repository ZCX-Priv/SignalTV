import {
  Hash,
  Radio,
  Tv,
  Film,
  Newspaper,
  Trophy,
  Music2,
  Baby,
  ShoppingBag,
  GraduationCap,
  Plane,
  Cpu,
  Camera,
  UtensilsCrossed,
  Sprout,
  Activity,
  Globe2,
  type LucideIcon,
} from "lucide-react";

// 将部分 iptv-org 分类映射到合适的图标
const CAT_ICON: Record<string, LucideIcon> = {
  news: Newspaper,
  sports: Trophy,
  movies: Film,
  music: Music2,
  kids: Baby,
  entertainment: Tv,
  documentary: Camera,
  education: GraduationCap,
  shopping: ShoppingBag,
  travel: Plane,
  cooking: UtensilsCrossed,
  religious: Sprout,
  business: Activity,
  culture: Film,
  auto: Cpu,
  family: Baby,
  general: Tv,
  legislative: Hash,
  outdoor: Plane,
  relax: Music2,
  series: Film,
  weather: Globe2,
};

export function catIcon(id: string): LucideIcon {
  // 兜底图标用 Radio（信号塔），呼应项目调性
  return CAT_ICON[id] ?? Radio;
}
