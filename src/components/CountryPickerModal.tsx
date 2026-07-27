import { useMemo } from "react";
import { Globe2 } from "lucide-react";
import { useStore } from "../store/useStore";
import { toast } from "../lib/toast";
import { PickerModal, type PickerItem } from "./PickerModal";

interface CountryPickerModalProps {
  open: boolean;
  onClose: () => void;
}

/** 全部国家选择弹窗：PickerModal 的薄包装，支持按名称或地区代码搜索。 */
export function CountryPickerModal({ open, onClose }: CountryPickerModalProps) {
  const countries = useStore((s) => s.countries);
  const recentCountries = useStore((s) => s.recentCountries);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  // 候选集：统一按 name A-Z 排序（countries 原序为频道数降序）
  const items = useMemo<PickerItem[]>(() => {
    return countries
      .map((c) => ({
        key: c.code,
        name: c.name,
        count: c.channelCount,
        leading: <span className="picker__leading">{c.flag}</span>,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries]);

  return (
    <PickerModal
      open={open}
      onClose={onClose}
      title="全部国家"
      titleIcon={<Globe2 size={14} />}
      searchPlaceholder="搜索国家或地区代码…"
      searchAriaLabel="搜索国家"
      emptyText="未找到匹配的国家"
      sectionLabel="全部国家"
      items={items}
      recentKeys={recentCountries}
      activeKey={view.kind === "country" ? view.code : null}
      match={(item, needle) =>
        item.name.toLowerCase().includes(needle) ||
        item.key.toLowerCase().includes(needle)
      }
      onPick={(item) => {
        setView({ kind: "country", code: item.key });
        toast.info(`已切换至${item.name}频道`);
        onClose();
      }}
    />
  );
}
