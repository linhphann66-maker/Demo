import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main className="boot">
        <h1>Không thể mở trình biên tập</h1>
        <p>{this.state.error}</p>
        <p>Bản lưu trên trình duyệt vẫn được giữ nguyên.</p>
        <button onClick={() => window.location.reload()}>
          Tải lại ứng dụng
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
