/**
 * Kitchen timer alarm and sound notification system.
 *
 * Provides a gentle two-tone chime via Web Audio API (zero external assets)
 * and haptic vibration feedback for kitchen timer completions.
 */

const SOUND_STORAGE_KEY = "bepnha:timer-sound-enabled:v1"

export function isTimerSoundEnabled(storage?: Storage): boolean {
  if (!storage) {
    if (typeof window === "undefined" || !window.localStorage) return true
    storage = window.localStorage
  }
  try {
    const val = storage.getItem(SOUND_STORAGE_KEY)
    return val === null ? true : val === "true"
  } catch {
    return true
  }
}

export function setTimerSoundEnabled(storage: Storage, enabled: boolean): void {
  try {
    storage.setItem(SOUND_STORAGE_KEY, enabled ? "true" : "false")
  } catch {
    // Ignore storage quota or permission errors
  }
}

export function triggerVibration(pattern: number[] = [200, 100, 200, 100, 300]): boolean {
  if (
    typeof navigator !== "undefined" &&
    "vibrate" in navigator &&
    typeof navigator.vibrate === "function"
  ) {
    try {
      return navigator.vibrate(pattern)
    } catch {
      return false
    }
  }
  return false
}

export function playKitchenTimerChime(customAudioContext?: AudioContext): boolean {
  if (typeof window === "undefined") return false
  try {
    const AudioContextClass =
      customAudioContext?.constructor ||
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextClass) return false

    const ctx = customAudioContext ?? new (AudioContextClass as typeof AudioContext)()
    const now = ctx.currentTime

    // Two melodic chime tones: D5 (587.33 Hz) and A5 (880.00 Hz)
    const tones = [
      { freq: 587.33, start: now, duration: 0.18 },
      { freq: 880.0, start: now + 0.15, duration: 0.35 }
    ]

    for (const tone of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = "sine"
      osc.frequency.setValueAtTime(tone.freq, tone.start)

      gain.gain.setValueAtTime(0.2, tone.start)
      gain.gain.exponentialRampToValueAtTime(0.001, tone.start + tone.duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(tone.start)
      osc.stop(tone.start + tone.duration)
    }

    return true
  } catch {
    return false
  }
}

export function triggerTimerAlarm(soundEnabled: boolean = true): void {
  triggerVibration()
  if (soundEnabled) {
    playKitchenTimerChime()
  }
}

export interface AlarmLoopOptions {
  readonly intervalMs?: number
  readonly maxBeeps?: number
  readonly isSoundEnabled?: () => boolean
  readonly onBeep?: () => void
}

/**
 * Starts a repeating alarm loop until stopped or max duration reached.
 * Returns a cleanup function that immediately stops the loop.
 */
export function startTimerAlarmLoop(options?: AlarmLoopOptions): () => void {
  const intervalMs = options?.intervalMs ?? 3500
  const maxBeeps = options?.maxBeeps ?? 20
  const checkSound = options?.isSoundEnabled ?? (() => isTimerSoundEnabled())
  const onBeep = options?.onBeep

  let beepCount = 0
  let timerId: ReturnType<typeof setInterval> | null = null

  const doBeep = () => {
    beepCount += 1
    triggerTimerAlarm(checkSound())
    onBeep?.()

    if (beepCount >= maxBeeps && timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }

  // First beep immediately
  doBeep()

  if (maxBeeps > 1) {
    timerId = setInterval(doBeep, intervalMs)
  }

  return () => {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }
}
