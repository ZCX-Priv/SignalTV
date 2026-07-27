import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { useStore } from "../store/useStore";
import { toast } from "../lib/toast";
import { catIcon } from "../lib/categoryIcon";
import { PickerModal, type PickerItem } from "./PickerModal";

interface CategoryPickerModalProps {
  open: boolean;
  onClose: () => void;
}

/** 全部分类选择弹窗：PickerModal 的薄包装，仅准备数据与 onPick 行为。 */
export function CategoryPickerModal({ open, onClose }: CategoryPickerModalProps) {
  const categories = useStore((s) => s.categories);
  const channels = useStore((s) => s.channels);
  const recentCategories = useStore((s) => s.recentCategories);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  // 每分类非 NSFW 频道数（与侧边栏 topCats 同口径）
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of channels.values()) {
      if (c.is_nsfw) continue;
      for (const cat of c.categories) m.set(cat, (m.get(cat) ?? 0) + 1);
    }
    return m;
  }, [channels]);

  // 候选集：count > 0 的分类，按频道数降序
  const items = useMemo<PickerItem[]>(() => {
    return categories
      .map((c) => {
        const Icon = catIcon(c.id);
        return {
          key: c.id,
          name: c.name,
          count: catCounts.get(c.id) ?? 0,
          leading: <Icon size={14} />,
        };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [categories, catCounts]);

  return (
    <PickerModal
      open={open}
      onClose={onClose}
      title="全部分类"
      titleIcon={<LayoutGrid size={14} />}
      searchPlaceholder="搜索分类…"
      searchAriaLabel="搜索分类"
      emptyText="未找到匹配的分类"
      sectionLabel="全部分类"
      items={items}
      recentKeys={recentCategories}
      activeKey={view.kind === "category" ? view.id : null}
      onPick={(item) => {
        setView({ kind: "category", id: item.key });
        toast.info(`已切换至${item.name}频道`);
        onClose();
      }}
    />
  );
}
