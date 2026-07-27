import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  desc: string;
}

/** 统一空状态：频道网格 / 播放历史等共用，样式走现有 .empty 类。 */
export function EmptyState({ icon, title, desc }: EmptyStateProps) {
  return (
    <div className="empty">
      {icon}
      <h3 className="display">{title}</h3>
      <p>{desc}</p>
    </div>
  );
}
