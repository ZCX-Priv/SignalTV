// 自实现 Toast 系统——统一从 ./lib/toast 引入 toast 函数。
// 所有调用方代码无需改动，API 与原 sonner 兼容：
//   toast.success("已加入收藏");
//   toast.error("信号中断");
//   toast.warning("已开启成人内容");
//   toast.info("已切换至xxx频道");
//   toast.loading("加载中");          // 返回 id
//   toast.promise(asyncFn, { loading: "加载中", success: "完成", error: "失败" });
//   toast.dismiss(id?);               // 不传 id 清空所有
//
// 设计要点：
// - 用 zustand vanilla store（createStore）管理状态，可在 React 之外调用
// - <Toaster /> 组件用 useStore(toastStore, selector) 订阅
// - 关闭流程：dismiss(id) → 标记 closing=true → CSS 动画 180ms → remove(id)
// - 自动消失：每个 toast 启动 setTimeout，duration=Infinity 时不启动
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { t } from "../i18n";

export type ToastType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading"
  | "message";

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration: number; // Infinity 表示不自动消失
  createdAt: number;
  closing?: boolean;
  /** 操作按钮行（如更新 toast 的「更新/忽略」），渲染在内容下方 */
  actions?: ToastAction[];
  /** 进度百分比 0-100，存在时在内容下方渲染细条进度条 */
  progress?: number;
  /** 不参与滚动淘汰：连发普通 toast 时不会被挤掉（更新 toast 用） */
  sticky?: boolean;
  /** 用户点 X 关闭时回调（仅 X，不含程序性 dismiss） */
  onClose?: () => void;
  /** 去重键：同 key 的 toast 复用同一条目，连续触发时刷新内容与时长而非叠加新条目 */
  key?: string;
}

export interface ToastOptions {
  description?: string;
  duration?: number;
  /** 去重键：见 ToastItem.key */
  key?: string;
}

export interface ToastPromiseOptions<T> {
  loading?: string;
  success: string | ((data: T) => string);
  error: string | ((err: unknown) => string);
}

interface ToastState {
  toasts: ToastItem[];
  add: (item: Omit<ToastItem, "id" | "createdAt">) => string;
  update: (id: string, patch: Partial<Omit<ToastItem, "id">>) => void;
  dismiss: (id?: string) => void;
  remove: (id: string) => void;
}

// 默认显示时长（与原 sonner 配置一致）
const DEFAULT_DURATION = 3500;
// 关闭动画时长（与 App.css 中 .signaltv-toast[data-closing] 一致）
const CLOSE_ANIMATION_MS = 180;
// 屏幕同时最多显示的 toast 数：超出时滚动淘汰最旧的，只保留最新 5 条
const MAX_VISIBLE_TOASTS = 5;

let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `toast-${Date.now()}-${idCounter}`;
}

// 每个 toast 的自动消失定时器
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function scheduleAutoDismiss(id: string, duration: number): void {
  // 先清掉旧定时器：否则把有限时长 toast 更新为 Infinity 后，
  // 旧定时器仍会触发 dismiss
  clearTimer(id);
  if (duration === Infinity) return;
  const timer = setTimeout(() => {
    toastStore.getState().dismiss(id);
  }, duration);
  timers.set(id, timer);
}

export const toastStore = createStore<ToastState>((set, get) => ({
  toasts: [],
  add: (item) => {
    // 去重复用：同 key 且未在关闭动画中的条目 → 原地刷新内容并重置自动消失定时器
    if (item.key) {
      const existing = get().toasts.find(
        (t) => t.key === item.key && !t.closing,
      );
      if (existing) {
        get().update(existing.id, {
          type: item.type,
          title: item.title,
          description: item.description,
          duration: item.duration,
          createdAt: Date.now(),
        });
        return existing.id;
      }
    }
    const id = genId();
    const toast: ToastItem = {
      ...item,
      id,
      createdAt: Date.now(),
    };
    set((s) => {
      const next = [...s.toasts, toast];
      // 滚动上限：未在关闭中的条目超过 5 条时，从头部（最旧）直接淘汰多余的，
      // 不走 180ms 关闭动画，避免快速连发时动画堆积；
      // sticky 条目（更新 toast）跳过淘汰，不被普通 toast 连发挤掉
      let visible = next.filter((t) => !t.closing).length;
      const kept: ToastItem[] = [];
      for (const t of next) {
        if (!t.closing && !t.sticky && visible > MAX_VISIBLE_TOASTS) {
          visible--;
          clearTimer(t.id);
          continue;
        }
        kept.push(t);
      }
      return { toasts: kept };
    });
    scheduleAutoDismiss(id, item.duration);
    return id;
  },
  update: (id, patch) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
    // 若 patch 中包含新的 duration，重新调度自动消失
    if (patch.duration !== undefined) {
      scheduleAutoDismiss(id, patch.duration);
    }
  },
  dismiss: (id) => {
    if (id === undefined) {
      // 清空所有：直接移除，无动画（避免大量 setTimeout 排队）
      for (const tid of [...timers.keys()]) clearTimer(tid);
      set({ toasts: [] });
      return;
    }
    clearTimer(id);
    // 标记 closing，等 CSS 动画结束后真正移除
    set((s) => ({
      toasts: s.toasts.map((t) =>
        t.id === id && !t.closing ? { ...t, closing: true } : t,
      ),
    }));
    setTimeout(() => {
      get().remove(id);
    }, CLOSE_ANIMATION_MS);
  },
  remove: (id) => {
    clearTimer(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// React hook：供 <Toaster /> 组件订阅
export function useToastState(): ToastItem[] {
  return useStore(toastStore, (s) => s.toasts);
}

// ---- toast 公共 API ----

function push(
  type: ToastType,
  message: string,
  opts?: ToastOptions,
): string {
  return toastStore.getState().add({
    type,
    title: message,
    description: opts?.description,
    duration: opts?.duration ?? DEFAULT_DURATION,
    key: opts?.key,
  });
}

export const toast = {
  success: (message: string, opts?: ToastOptions) =>
    push("success", message, opts),
  error: (message: string, opts?: ToastOptions) =>
    push("error", message, opts),
  warning: (message: string, opts?: ToastOptions) =>
    push("warning", message, opts),
  info: (message: string, opts?: ToastOptions) =>
    push("info", message, opts),
  message: (message: string, opts?: ToastOptions) =>
    push("message", message, opts),
  loading: (message: string, opts?: ToastOptions): string => {
    return toastStore.getState().add({
      type: "loading",
      title: message,
      description: opts?.description,
      duration: opts?.duration ?? Infinity,
      key: opts?.key,
    });
  },
  promise: async <T>(
    p: Promise<T>,
    opts: ToastPromiseOptions<T>,
  ): Promise<T> => {
    const id = toastStore.getState().add({
      type: "loading",
      title: opts.loading ?? t("toast.loading"),
      duration: Infinity,
    });
    try {
      const data = await p;
      const successMsg =
        typeof opts.success === "function" ? opts.success(data) : opts.success;
      toastStore.getState().update(id, {
        type: "success",
        title: successMsg,
        duration: DEFAULT_DURATION,
      });
      return data;
    } catch (err) {
      const errMsg =
        typeof opts.error === "function" ? opts.error(err) : opts.error;
      toastStore.getState().update(id, {
        type: "error",
        title: errMsg,
        duration: DEFAULT_DURATION,
      });
      throw err;
    }
  },
  dismiss: (id?: string): void => {
    toastStore.getState().dismiss(id);
  },
};
