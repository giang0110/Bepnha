import { useCallback, useEffect, useState } from "react"

interface WakeLockSentinelLike {
  release: () => Promise<void>
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>
}

function wakeLock(): WakeLockLike | null {
  const candidate = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock
  return candidate ?? null
}

export interface WakeLockState {
  readonly isLocked: boolean
  readonly isSupported: boolean
  readonly toggle: () => void
}

/**
 * Keeps the screen on while a cook is following steps with their hands full.
 *
 * A phone that sleeps mid-recipe is the whole reason paper stays on kitchen counters. The Wake Lock
 * API is the only way to prevent it, and it is best-effort by design: Safari gained it late, a
 * browser may refuse, and every browser drops the lock when the tab is hidden — which is why the
 * visibility listener re-requests rather than assuming the first grant holds.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [isLocked, setIsLocked] = useState(false)
  const [manualDisabled, setManualDisabled] = useState(false)
  const isSupported = typeof navigator !== "undefined" && "wakeLock" in navigator

  useEffect(() => {
    const api = wakeLock()
    if (!active || manualDisabled || api === null) {
      setIsLocked(false)
      return
    }

    let sentinel: WakeLockSentinelLike | null = null
    let released = false

    const acquire = async () => {
      try {
        const granted = await api.request("screen")
        if (released) {
          void granted.release()
          return
        }
        sentinel = granted
        setIsLocked(true)
      } catch {
        setIsLocked(false)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire()
    }

    void acquire()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      released = true
      document.removeEventListener("visibilitychange", onVisibility)
      void sentinel?.release().catch(() => undefined)
      setIsLocked(false)
    }
  }, [active, manualDisabled])

  const toggle = useCallback(() => {
    setManualDisabled((prev) => !prev)
  }, [])

  return {
    isLocked,
    isSupported,
    toggle
  }
}
