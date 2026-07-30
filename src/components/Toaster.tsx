import { useLayoutEffect, useRef } from "react";
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
import { useI18n } from "../i18n";

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
  const { t } = useI18n();
  const toasts = useToastState();
  return (
    <div className="signaltv-toaster" role="region" aria-label={t("toaster.region")}>
      {toasts.map((item) => (
        <ToastView key={item.id} item={item} />
      ))}
    </div>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const { t } = useI18n();
  const Icon = TOAST_ICONS[item.type];
  const rootRef = useRef<HTMLDivElement>(null);
  // sticky toast（更新 toast）生命周期内出现过的最大渲染宽度
  const maxWidthRef = useRef(0);
  // 宽度锁定（只增不减）：更新 toast 从「按钮阶段」切到「进度条阶段」时
  // 内容变窄，锁定为历史最大宽度避免突然收缩；倒计时按钮 (Ns) 每秒文字
  // 变化的宽度抖动同理被抹平。仅 sticky 生效，普通 toast 观感不变。
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!item.sticky || !el) return;
    const w = el.getBoundingClientRect().width;
    if (w <= maxWidthRef.current) return;
    maxWidthRef.current = w;
    // 覆盖关系：内联 min-width 优先级高于 CSS 的 max-width: 100%（规范定义
    // min-width 胜出），故此处自行用 92vw 钳制 —— 与 .signaltv-toaster 的
    // max-width: min(92vw, 440px) 上限一致，防止窗口缩小后撑出视口
    el.style.minWidth = `min(${Math.ceil(w)}px, 92vw)`;
  });
  return (
    <div
      ref={rootRef}
      className="signaltv-toast"
      data-type={item.type}
      data-closing={item.closing ? "true" : "false"}
      role={item.type === "error" ? "alert" : "status"}
      aria-live={item.type === "error" ? "assertive" : "polite"}
    >
      <span className="signaltv-toast__bar" aria-hidden="true" />
      <span className="signaltv-toast__icon" aria-hidden="true">
        {/* size={14} 会被 CSS .signaltv-toast__icon svg 覆盖为 1.4em，与标题行高等大 */}
        <Icon size={14} />
      </span>
      <span className="signaltv-toast__content">
        <span className="signaltv-toast__title">{item.title}</span>
        {item.description && (
          <span className="signaltv-toast__desc">{item.description}</span>
        )}
        {item.progress !== undefined && (
          <span
            className="signaltv-toast__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(item.progress)}
          >
            <span
              className="signaltv-toast__progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
            />
          </span>
        )}
      </span>
      {item.actions && item.actions.length > 0 && (
        <span className="signaltv-toast__actions">
          {/* key 用索引而非 label：actions 顺序稳定，而不同按钮的文案在
              某些语言下可能相同，同名 label 会撞 key */}
          {item.actions.map((action, index) => (
            <button
              key={index}
              type="button"
              className={`signaltv-toast__btn signaltv-toast__btn--${action.variant ?? "ghost"}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className="signaltv-toast__close"
        onClick={() => {
          // 先回调 onClose（更新 toast 据此记录「本会话已关闭」）再关闭
          item.onClose?.();
          toast.dismiss(item.id);
        }}
        aria-label={t("toaster.closeAria")}
      >
        <X size={14} />
      </button>
    </div>
  );
}
