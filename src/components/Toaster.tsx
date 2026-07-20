import {
  CircleCheck,
  CircleX,
  Info,
  Loader2,
  MessageSquare,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast, useToastState } from "../lib/toast";
import type { ToastItem, ToastType } from "../lib/toast";

// 类型 → 图标映射：所有 toast 都渲染对应图标，颜色由 CSS 按类型着色
const TOAST_ICONS: Record<ToastType, LucideIcon> = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
  loading: Loader2,
  message: MessageSquare,
};

/**
 * 全局 Toast 容器——自实现，适配 Broadcast Noir 设计系统。
 *
 * 用法（任意组件）：
 *   import { toast } from "../lib/toast";
 *   toast.success("已加入收藏");
 *   toast.error("信号中断");
 *   toast.warning("已开启成人内容");
 *   toast.promise(asyncFn, { loading: "加载中", success: "完成", error: "失败" });
 *
 * 主题：复用项目 CSS 变量（挂在 <html data-theme> 上），toast 作为后代自动继承。
 * 位置：top-center——顶部居中，从上往下滑入。
 * 关闭按钮：toast 内部右侧（flex 布局，与内容同行），非浮在角上。
 */
export function Toaster() {
  const toasts = useToastState();
  return (
    <div className="signaltv-toaster" role="region" aria-label="通知">
      {toasts.map((t) => (
        <ToastView key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const Icon = TOAST_ICONS[item.type];
  return (
    <div
      className="signaltv-toast"
      data-type={item.type}
      data-closing={item.closing ? "true" : "false"}
      role={item.type === "error" ? "alert" : "status"}
      aria-live={item.type === "error" ? "assertive" : "polite"}
    >
      <span className="signaltv-toast__bar" aria-hidden="true" />
      <span className="signaltv-toast__icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="signaltv-toast__content">
        <span className="signaltv-toast__title">{item.title}</span>
        {item.description && (
          <span className="signaltv-toast__desc">{item.description}</span>
        )}
      </span>
      <button
        type="button"
        className="signaltv-toast__close"
        onClick={() => toast.dismiss(item.id)}
        aria-label="关闭通知"
      >
        <X size={14} />
      </button>
    </div>
  );
}
