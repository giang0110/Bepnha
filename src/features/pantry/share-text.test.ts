import { describe, expect, test, vi } from "vitest"
import { shareText } from "./share-text"

describe("shareText in pantry", () => {
  test("uses navigator.share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const outcome = await shareText("Danh sách tủ bếp", "Kiểm kê", { share })
    expect(share).toHaveBeenCalledWith({ title: "Kiểm kê", text: "Danh sách tủ bếp" })
    expect(outcome).toBe("shared")
  })

  test("treats user abort of native share sheet as shared outcome", async () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    const share = vi.fn().mockRejectedValue(abort)
    const outcome = await shareText("Danh sách", "Kiểm kê", { share })
    expect(outcome).toBe("shared")
  })

  test("falls back to clipboard when share is not available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const outcome = await shareText("Danh sách", "Kiểm kê", { clipboard: { writeText } })
    expect(writeText).toHaveBeenCalledWith("Danh sách")
    expect(outcome).toBe("copied")
  })

  test("reports unavailable when neither share nor clipboard succeeds", async () => {
    const outcome = await shareText("Danh sách", "Kiểm kê", {})
    expect(outcome).toBe("unavailable")
  })
})
