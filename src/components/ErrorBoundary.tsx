import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 自定义降级 UI；未提供时使用默认 fallback（复用 Loader.tsx 中 ErrorState 视觉风格） */
  fallback?: ReactNode;
  /** 错误上报回调，便于父组件记录或上报到监控平台 */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React ErrorBoundary：捕获子树渲染异常，避免整页白屏。
 *
 * 使用：
 * - 全局：在 main.tsx 中包裹 <App />，捕获致命渲染错误
 * - 局部：在 App.tsx 中包裹 lazy <PlayerModal />，捕获播放器异常或 chunk load failure
 *
 * 注意：
 * - React 19 仍未提供函数式 ErrorBoundary，必须用 class 组件
 * - ErrorBoundary 不捕获事件回调、async 错误、setTimeout 内错误，仅捕获渲染阶段异常
 * - 与 Suspense 协作时，ErrorBoundary 必须放在 Suspense 外层才能捕获 chunk load failure
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 控制台输出便于排查（未来可接入 Sentry 等监控平台）
    console.error("[ErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      // 默认 fallback：复用 .loader / .loader__inner / .loader__mark--err 样式
      // 保持与 Loader.tsx 中 ErrorState 视觉一致
      return (
        <div className="loader">
          <div className="loader__inner">
            <div className="loader__mark loader__mark--err">
              <span style={{ fontSize: 26 }}>⚠</span>
            </div>
            <div className="loader__title display">
              信号<em>中断</em>
            </div>
            <div className="loader__sub mono">
              {this.state.error?.message ?? "未知渲染错误"}
            </div>
            <button
              className="btn btn--primary"
              onClick={this.reset}
              style={{ marginTop: 18 }}
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
