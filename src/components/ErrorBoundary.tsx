"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly section?: string;
};

type State = {
  readonly hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.section ?? "unknown"}] render error`, {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            Something went wrong
            {this.props.section !== undefined ? ` in ${this.props.section}` : ""}.
            Refresh the page to retry.
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
