import { describe, expect, test, vi } from "vitest"

import { createAssistantApi } from "./assistant-api"

const input = {
  planId: "40000000-0000-0000-0000-000000000001",
  expectedRevisionId: "50000000-0000-0000-0000-000000000001",
  question: "Giải thích kế hoạch này"
}

describe("assistant browser API", () => {
  test("posts the exact authenticated request to the same-origin endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => null) },
      json: () =>
        Promise.resolve({
          kind: "explanation",
          summaryVi: "Tóm tắt",
          observationsVi: ["Nhận xét"]
        })
    })

    await expect(createAssistantApi(fetcher).ask("access-token", input)).resolves.toEqual({
      ok: true,
      value: {
        kind: "explanation",
        summaryVi: "Tóm tắt",
        observationsVi: ["Nhận xét"]
      }
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith("/api/assistant", {
      method: "POST",
      headers: {
        Authorization: "Bearer access-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    })
  })

  test("returns safe error metadata from non-success responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: vi.fn(() => "assistant.req-1") },
      json: () => Promise.resolve({ error: "ASSISTANT_UNAVAILABLE", raw: "must-ignore" })
    })

    await expect(createAssistantApi(fetcher).ask("token", input)).resolves.toEqual({
      ok: false,
      error: "ASSISTANT_UNAVAILABLE",
      correlationId: "assistant.req-1"
    })
  })

  test.each([
    { kind: "replacement_proposal", targetDayIndex: 7, reasonVi: "Ngoài tuần" },
    { kind: "explanation", summaryVi: "", observationsVi: [] },
    { kind: "unsupported", messageVi: "Không hỗ trợ", extra: true },
    { kind: "unknown", messageVi: "Không hợp lệ" }
  ])("fails closed for malformed success payload %#", async (payload) => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => "assistant.req-2") },
      json: () => Promise.resolve(payload)
    })

    await expect(createAssistantApi(fetcher).ask("token", input)).resolves.toEqual({
      ok: false,
      error: "ASSISTANT_UNAVAILABLE",
      correlationId: "assistant.req-2"
    })
  })

  test.each(["contains a space", "<script>", "x".repeat(97)])(
    "drops unsafe correlation id %s",
    async (correlationId) => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: vi.fn(() => correlationId) },
        json: () => Promise.resolve({ error: "STALE_ASSISTANT_CONTEXT" })
      })

      await expect(createAssistantApi(fetcher).ask("token", input)).resolves.toEqual({
        ok: false,
        error: "STALE_ASSISTANT_CONTEXT"
      })
    }
  )
})
