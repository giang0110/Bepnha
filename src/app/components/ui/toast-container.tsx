import { useEffect, useState } from "react"
import { Icon } from "./icon"
import { TOAST_EVENT, type ToastItem, type ToastType } from "./toast"

export function ToastContainer() {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastItem>).detail
      if (!detail?.id || !detail?.message) return

      setToasts((prev) => [...prev, detail])

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id))
      }, 3500)
    }

    window.addEventListener(TOAST_EVENT, handleToast)
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast)
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-20 z-50 flex flex-col gap-2 sm:bottom-6"
    >
      {toasts.map((t) => {
        const bgColors: Record<ToastType, string> = {
          success: "border-herb-200 bg-paper-raised text-ink dark:border-herb-700/50",
          error: "border-chilli-200 bg-paper-raised text-ink dark:border-chilli-700/50",
          info: "border-clay-200 bg-paper-raised text-ink dark:border-clay-700/50"
        }

        const iconClasses: Record<ToastType, string> = {
          success: "text-herb-600 dark:text-herb-400",
          error: "text-chilli-600 dark:text-chilli-400",
          info: "text-clay-600 dark:text-clay-400"
        }

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lift backdrop-blur-xs transition-all ${bgColors[t.type]}`}
          >
            <span className={iconClasses[t.type]}>
              <Icon
                name={t.type === "success" ? "check" : t.type === "error" ? "flame" : "note"}
                className="size-4 shrink-0"
              />
            </span>
            <p className="text-xs font-bold leading-tight">{t.message}</p>
            <button
              aria-label="Đóng thông báo"
              className="ml-auto text-ink-soft hover:text-ink focus:outline-none"
              type="button"
              onClick={() => removeToast(t.id)}
            >
              <Icon name="chevronDown" className="size-3.5 rotate-45" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
