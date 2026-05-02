"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "./button";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-[50vh] w-full flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="bg-red-500/10 p-4 rounded-full">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              Đã xảy ra lỗi không mong muốn
            </h2>
            <p className="text-sm text-slate-400 max-w-md">
              {this.state.error?.message || "Ứng dụng gặp sự cố khi hiển thị giao diện này. Vui lòng thử lại."}
            </p>
          </div>
          <Button 
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="mt-4 gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Tải lại trang
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
