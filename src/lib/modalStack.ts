// 模态层统一管理：解决多模态并存时的三个问题——
// 1) ESC 一次关闭全部：全局只挂一个 keydown 监听，ESC 仅关闭栈顶模态；
// 2) body 滚动锁互相踩踏：用栈长度做引用计数，栈空时才恢复 overflow；
// 3) 焦点穿透：提供 trapFocus 供模态面板做 Tab 循环圈定。
// 0 依赖，模块级单例。

type ModalHandle = { onClose: () => void };

const stack: ModalHandle[] = [];
let keydownBound = false;

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  // 只关闭栈顶模态，阻止其他 ESC 监听（如旧式组件级监听）重复处理
  e.stopPropagation();
  stack[stack.length - 1].onClose();
}

/**
 * 模态打开时调用：入栈 + 锁定 body 滚动 + 绑定全局 ESC。
 * @returns 释放函数——模态关闭/卸载时调用，出栈并在栈空时恢复滚动
 */
export function pushModal(onClose: () => void): () => void {
  const handle: ModalHandle = { onClose };
  stack.push(handle);
  document.body.style.overflow = "hidden";
  if (!keydownBound) {
    // capture 阶段监听，先于组件内部的 keydown 处理
    window.addEventListener("keydown", onKeydown, true);
    keydownBound = true;
  }
  let released = false;
  return () => {
    if (released) return; // 幂等：StrictMode 双调用/重复 cleanup 安全
    released = true;
    const i = stack.indexOf(handle);
    if (i >= 0) stack.splice(i, 1);
    if (stack.length === 0) {
      document.body.style.overflow = "";
      if (keydownBound) {
        window.removeEventListener("keydown", onKeydown, true);
        keydownBound = false;
      }
    }
  };
}

/**
 * Tab 焦点圈定：在模态面板的 keydown 中调用，把 Tab 循环限制在面板内。
 * 面板容器需 tabIndex={-1}（作为初始焦点与 Shift+Tab 的回环起点）。
 */
export function trapFocus(e: KeyboardEvent, panel: HTMLElement): void {
  if (e.key !== "Tab") return;
  const focusables = panel.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
