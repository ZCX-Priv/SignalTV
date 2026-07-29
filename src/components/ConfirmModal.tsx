import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { pushModal, trapFocus } from "../lib/modalStack";
import { useI18n } from "../i18n";

interface ConfirmModalProps {
  open: boolean;
  /** 取消/关闭（ESC、取消按钮、右上角关闭共用） */
  onClose: () => void;
  /** 确认操作；调用方负责在其中关闭模态 */
  onConfirm: () => void;
  title: string;
  /** 补充说明文案（可选） */
  desc?: ReactNode;
  /** 标题左侧图标（可选） */
  icon?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 危险操作：确认按钮走品牌红实底样式，强化警示 */
  danger?: boolean;
}

/**
 * 通用确认模态窗：承载"不可撤销操作"的二次确认（如批量删除）。
 * 模态栈接入（ESC 关栈顶 + body 滚动锁）、Tab 焦点圈定与焦点还原
 * 均与 PickerModal 同一套规范；遮罩不可点关——危险操作必须显式选择。
 * 用 createPortal 挂到 document.body：可复用组件不能假设调用方的祖先链，
 * 若祖先带 transform（如 .view-anim 的 fade-up fill:both 残留 translateY(0)）
 * 会成为 fixed 定位的包含块，导致遮罩被限制在内容区而非全屏。
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  desc,
  icon,
  confirmLabel,
  cancelLabel,
  danger = false,
}: ConfirmModalProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 退出动画：open 翻 false 后保留渲染并加 is-closing，fade-out/scale-out
  // 播完（onAnimationEnd）才真正卸载（与 PlayerModal / PickerModal 同规范）
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
    }
  }, [open, visible]);

  // 关闭动画兜底：animationend 丢失（如标签页后台）时 400ms 后强制卸载
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 400);
    return () => clearTimeout(id);
  }, [closing]);

  // 打开时入模态栈；初始焦点落在"取消"按钮（危险操作默认安全项），关闭还原焦点
  useEffect(() => {
    if (!open) return;
    const release = pushModal(onClose);
    const prevFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      release();
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!visible) return null;

  return createPortal(
    <div
      className={`confirm ${closing ? "is-closing" : ""}`}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onAnimationEnd={(e) => {
        // 只认根节点自身的 fade-out（panel 的 scale-out 会冒泡上来，需过滤）
        if (closing && e.target === e.currentTarget) {
          setVisible(false);
          setClosing(false);
        }
      }}
    >
      <div className="confirm__backdrop" />
      <div
        className="confirm__panel"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (panelRef.current) trapFocus(e.nativeEvent, panelRef.current);
        }}
      >
        <header className="confirm__header">
          <div className="confirm__title">
            {icon}
            <span>{title}</span>
          </div>
          <button
            type="button"
            className="confirm__close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </header>

        {desc && <div className="confirm__desc">{desc}</div>}

        <footer className="confirm__actions">
          <button
            type="button"
            ref={cancelRef}
            className="btn btn--ghost btn--sm"
            onClick={onClose}
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            className={`btn btn--sm${danger ? " btn--primary" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
