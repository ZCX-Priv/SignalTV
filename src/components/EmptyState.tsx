import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  desc: string;
  /** 紧凑变体：弹窗（如分类/国家选择器）内使用，字号与间距收紧 */
  compact?: boolean;
}

/** 统一空状态：频道网格 / 播放历史 / 选择弹窗共用，样式走 .empty 类（弹窗内加 compact）。 */
export function EmptyState({ icon, title, desc, compact }: EmptyStateProps) {
  return (
    <div className={`empty ${compact ? "empty--compact" : ""}`}>
      {icon}
      <h3 className="display">{title}</h3>
      <p>{desc}</p>
    </div>
  );
}
