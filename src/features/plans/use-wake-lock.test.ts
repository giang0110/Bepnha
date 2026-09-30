import { renderHook, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWakeLock } from "./use-wake-lock"

describe("useWakeLock", () => {
  let mockRequest: ReturnType<typeof vi.fn>
  let mockRelease: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockRelease = vi.fn().mockResolvedValue(undefined)
    mockRequest = vi.fn().mockResolvedValue({ release: mockRelease })

    Object.defineProperty(navigator, "wakeLock", {
      value: { request: mockRequest },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, "wakeLock", {
      value: undefined,
      configurable: true
    })
  })

  test("acquires screen wake lock when active and supported", async () => {
    const { result } = renderHook(() => useWakeLock(true))

    expect(result.current.isSupported).toBe(true)
    // Wait for the async acquire
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockRequest).toHaveBeenCalledWith("screen")
    expect(result.current.isLocked).toBe(true)
  })

  test("releases wake lock on unmount", async () => {
    const { unmount } = renderHook(() => useWakeLock(true))
    await act(async () => {
      await Promise.resolve()
    })

    unmount()
    expect(mockRelease).toHaveBeenCalled()
  })

  test("allows manually toggling wake lock off and on", async () => {
    const { result } = renderHook(() => useWakeLock(true))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isLocked).toBe(true)

    // Toggle off
    act(() => {
      result.current.toggle()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isLocked).toBe(false)

    // Toggle back on
    act(() => {
      result.current.toggle()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isLocked).toBe(true)
  })
})
