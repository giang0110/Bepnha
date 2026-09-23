import { useEffect } from "react"

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

/**
 * Keeps the screen on while a cook is following steps with their hands full.
 *
 * A phone that sleeps mid-recipe is the whole reason paper stays on kitchen counters. The Wake Lock
 * API is the only way to prevent it, and it is best-effort by design: Safari gained it late, a
 * browser may refuse, and every browser drops the lock when the tab is hidden — which is why the
 * visibility listener re-requests rather than assuming the first grant holds.
 *
 * Failure is silent on purpose. There is nothing a cook can do about an unsupported browser, and an
 * error banner over a recipe would cost more than the screen dimming does.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = wakeLock()
    if (!active || api === null) return

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
      } catch {
        // A refusal is not worth reporting: the page still works, the screen just dims.
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
    }
  }, [active])
}
