import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/app/components/ui/button"

/**
 * Last-resort boundary so an unexpected render failure produces a recoverable Vietnamese screen
 * instead of a blank document.
 *
 * `onError` receives the raw error for host-level reporting. It must never be given household,
 * plan, revision, pantry or token data: `docs/operations/production-readiness.md` keeps identifiers
 * and payloads out of telemetry, and this boundary reports no application state of its own.
 */

interface AppErrorBoundaryProps {
  readonly children: ReactNode
  readonly onError?: (error: unknown, componentStack: string | null) => void
}

interface AppErrorBoundaryState {
  readonly failed: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info.componentStack ?? null)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Ứng dụng gặp sự cố</h1>
        <p>
          Đã có lỗi ngoài dự kiến. Kế hoạch, giỏ đi chợ và tủ bếp đã lưu của bạn không bị ảnh hưởng.
        </p>
        <Button type="button" onClick={() => window.location.reload()}>
          Tải lại trang
        </Button>
      </main>
    )
  }
}
