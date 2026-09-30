export type ToastType = "success" | "error" | "info"

export interface ToastItem {
  readonly id: string
  readonly message: string
  readonly type: ToastType
}

export const TOAST_EVENT = "bepnha:toast"

export const toast = {
  success(message: string): void {
    emitToast(message, "success")
  },
  error(message: string): void {
    emitToast(message, "error")
  },
  info(message: string): void {
    emitToast(message, "info")
  }
}

function emitToast(message: string, type: ToastType): void {
  if (typeof window === "undefined") return
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: { id, message, type }
    })
  )
}

export { ToastContainer } from "./toast-container"
