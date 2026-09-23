import { describe, expect, test, vi } from "vitest"

import { shareText } from "./share-text"

describe("shareText", () => {
  test("uses the device share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined)

    await expect(shareText("danh sách", "Đi chợ", { share })).resolves.toBe("shared")
    expect(share).toHaveBeenCalledWith({ title: "Đi chợ", text: "danh sách" })
  })

  test("treats a dismissed share sheet as done, not as a failure", async () => {
    // Changing your mind is not an error, and a copy-to-clipboard consolation prize after you
    // closed the sheet is worse than nothing: it silently changes what your paste button does.
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" })
    const writeText = vi.fn()

    await expect(
      shareText("danh sách", "Đi chợ", {
        share: vi.fn().mockRejectedValue(abort),
        clipboard: { writeText }
      })
    ).resolves.toBe("shared")
    expect(writeText).not.toHaveBeenCalled()
  })

  test("falls back to the clipboard when the share sheet genuinely fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await expect(
      shareText("danh sách", "Đi chợ", {
        share: vi.fn().mockRejectedValue(new Error("not allowed")),
        clipboard: { writeText }
      })
    ).resolves.toBe("copied")
    expect(writeText).toHaveBeenCalledWith("danh sách")
  })

  test("copies on a desktop browser that has no share sheet at all", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await expect(shareText("danh sách", "Đi chợ", { clipboard: { writeText } })).resolves.toBe(
      "copied"
    )
  })

  test("admits it cannot help rather than claiming a copy that did not happen", async () => {
    await expect(shareText("danh sách", "Đi chợ", {})).resolves.toBe("unavailable")
    await expect(
      shareText("danh sách", "Đi chợ", {
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }
      })
    ).resolves.toBe("unavailable")
  })
})
