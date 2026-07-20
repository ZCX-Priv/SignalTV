import { Toaster as SonnerToaster } from "sonner";
// sonner v2 不再自动注入样式，需手动 import 基础样式（布局、过渡动画、可访问性）。
// 视觉风格（颜色、字体、边框）在 App.css 中通过 .signaltv-toast 选择器覆盖。
import "sonner/dist/styles.css";
import { X } from "lucide-react";
import { useStore } from "../store/useStore";

/**
 * 全局 Toast 容器——基于 sonner 封装，适配 Broadcast Noir 设计系统。
 *
 * 用法（任意组件）：
 *   import { toast } from "../lib/toast";
 *   toast.success("已加入收藏");
 *   toast.error("信号中断");
 *   toast.promise(asyncFn, { loading: "加载中", success: "完成", error: "失败" });
 *
 * 主题：订阅 store.theme，dark/light 自动跟随；richColors 关闭以使用项目自定义色板。
 * 位置：top-center——顶部居中，从上往下滑入。
 */
export function Toaster() {
  const theme = useStore((s) => s.theme);
  return (
    <SonnerToaster
      position="top-center"
      duration={3500}
      closeButton
      theme={theme}
      expand={false}
      richColors={false}
      icons={{ close: <X size={14} /> }}
      toastOptions={{ className: "signaltv-toast" }}
    />
  );
}
