import { describe, expect, it, vi } from "vitest"

import { shareText } from "./share-text"

describe("shareText", () => {
  it("uses navigator.share when available", async () => {
    const share = vi.fn(() => Promise.resolve())
    const outcome = await shareText("text to share", "Title", { share })

    expect(share).toHaveBeenCalledWith({ title: "Title", text: "text to share" })
    expect(outcome).toBe("shared")
  })

  it("treats AbortError from share as user cancellation (shared)", async () => {
    const abortError = new Error("User cancelled")
    abortError.name = "AbortError"
    const share = vi.fn(() => Promise.reject(abortError))
    const outcome = await shareText("text to share", "Title", { share })

    expect(outcome).toBe("shared")
  })

  it("falls back to clipboard when share fails", async () => {
    const share = vi.fn(() => Promise.reject(new Error("Network error")))
    const writeText = vi.fn(() => Promise.resolve())
    const outcome = await shareText("text to share", "Title", {
      share,
      clipboard: { writeText }
    })

    expect(writeText).toHaveBeenCalledWith("text to share")
    expect(outcome).toBe("copied")
  })

  it("uses clipboard when share is not available", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    const outcome = await shareText("text to share", "Title", {
      clipboard: { writeText }
    })

    expect(writeText).toHaveBeenCalledWith("text to share")
    expect(outcome).toBe("copied")
  })

  it("returns unavailable when neither share nor clipboard succeeds", async () => {
    const outcome = await shareText("text to share", "Title", {})
    expect(outcome).toBe("unavailable")
  })
})
