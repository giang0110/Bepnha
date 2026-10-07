import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  isTimerSoundEnabled,
  playKitchenTimerChime,
  setTimerSoundEnabled,
  startTimerAlarmLoop,
  triggerTimerAlarm,
  triggerVibration
} from "./cooking-timer-alarm"

describe("cooking-timer-alarm", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("sound preference in storage", () => {
    it("defaults to true when not set", () => {
      expect(isTimerSoundEnabled(window.localStorage)).toBe(true)
    })

    it("saves and retrieves false", () => {
      setTimerSoundEnabled(window.localStorage, false)
      expect(isTimerSoundEnabled(window.localStorage)).toBe(false)
    })

    it("saves and retrieves true", () => {
      setTimerSoundEnabled(window.localStorage, false)
      setTimerSoundEnabled(window.localStorage, true)
      expect(isTimerSoundEnabled(window.localStorage)).toBe(true)
    })
  })

  describe("triggerVibration", () => {
    it("calls navigator.vibrate if available", () => {
      const vibrateMock = vi.fn().mockReturnValue(true)
      vi.stubGlobal("navigator", { ...window.navigator, vibrate: vibrateMock })

      const res = triggerVibration([200, 100, 200])
      expect(res).toBe(true)
      expect(vibrateMock).toHaveBeenCalledWith([200, 100, 200])
    })

    it("returns false if navigator.vibrate is not available", () => {
      vi.stubGlobal("navigator", { ...window.navigator, vibrate: undefined })
      const res = triggerVibration()
      expect(res).toBe(false)
    })
  })

  describe("playKitchenTimerChime", () => {
    it("uses AudioContext to create oscillators and gain nodes", () => {
      const mockSetValueAtTime = vi.fn()
      const mockExponentialRamp = vi.fn()
      const mockConnect = vi.fn()
      const mockStart = vi.fn()
      const mockStop = vi.fn()

      const mockOscillator = {
        type: "sine",
        frequency: { setValueAtTime: mockSetValueAtTime },
        connect: mockConnect,
        start: mockStart,
        stop: mockStop
      }

      const mockGain = {
        gain: {
          setValueAtTime: mockSetValueAtTime,
          exponentialRampToValueAtTime: mockExponentialRamp
        },
        connect: mockConnect
      }

      const createOscillator = vi.fn().mockReturnValue(mockOscillator)
      const createGain = vi.fn().mockReturnValue(mockGain)

      const mockCtx = {
        currentTime: 0,
        destination: {},
        createOscillator,
        createGain
      } as unknown as AudioContext

      const result = playKitchenTimerChime(mockCtx)
      expect(result).toBe(true)
      expect(createOscillator).toHaveBeenCalledTimes(2)
      expect(createGain).toHaveBeenCalledTimes(2)
      expect(mockStart).toHaveBeenCalledTimes(2)
      expect(mockStop).toHaveBeenCalledTimes(2)
    })
  })

  describe("triggerTimerAlarm", () => {
    it("runs vibration and conditional sound", () => {
      const vibrateMock = vi.fn().mockReturnValue(true)
      vi.stubGlobal("navigator", { ...window.navigator, vibrate: vibrateMock })

      triggerTimerAlarm(false)
      expect(vibrateMock).toHaveBeenCalledTimes(1)
    })
  })

  describe("startTimerAlarmLoop", () => {
    it("triggers immediately on start and repeats on interval", () => {
      const onBeep = vi.fn()
      const stop = startTimerAlarmLoop({
        intervalMs: 3000,
        maxBeeps: 5,
        isSoundEnabled: () => false,
        onBeep
      })

      // Immediate first beep
      expect(onBeep).toHaveBeenCalledTimes(1)

      // Advance by 3s
      vi.advanceTimersByTime(3000)
      expect(onBeep).toHaveBeenCalledTimes(2)

      // Advance by 3s again
      vi.advanceTimersByTime(3000)
      expect(onBeep).toHaveBeenCalledTimes(3)

      // Stop manually
      stop()

      // Advance by 6s, should not beep further
      vi.advanceTimersByTime(6000)
      expect(onBeep).toHaveBeenCalledTimes(3)
    })

    it("automatically stops when maxBeeps is reached", () => {
      const onBeep = vi.fn()
      startTimerAlarmLoop({
        intervalMs: 2000,
        maxBeeps: 3,
        isSoundEnabled: () => false,
        onBeep
      })

      expect(onBeep).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(2000)
      expect(onBeep).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(2000)
      expect(onBeep).toHaveBeenCalledTimes(3)

      // Advance past maxBeeps
      vi.advanceTimersByTime(10000)
      expect(onBeep).toHaveBeenCalledTimes(3)
    })
  })
})
