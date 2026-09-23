/**
 * Formats a countdown the way a kitchen clock reads it.
 *
 * Seconds are always two digits so the width does not jump while it runs, and a negative remainder
 * clamps to zero rather than counting up: the timer has finished, and "-0:03" says something the
 * app does not mean.
 */
export function formatCountdown(secondsRemaining: number): string {
  const safe = Number.isFinite(secondsRemaining) ? Math.max(Math.ceil(secondsRemaining), 0) : 0
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * How much time is left, given when the timer was started and how long it runs.
 *
 * Derived from timestamps rather than counted down by an interval. An interval that ticks once a
 * second loses time whenever the tab is throttled — which a phone does the moment the screen turns
 * off — so a timer built that way finishes late by however long the cook looked away. This one is
 * correct on return because it never stored a count, only a start.
 */
export function secondsRemaining(
  totalSeconds: number,
  startedAtMs: number | null,
  pausedWithSeconds: number | null,
  nowMs: number
): number {
  if (pausedWithSeconds !== null) return Math.max(pausedWithSeconds, 0)
  if (startedAtMs === null) return Math.max(totalSeconds, 0)
  const elapsed = (nowMs - startedAtMs) / 1000
  return Math.max(totalSeconds - elapsed, 0)
}
