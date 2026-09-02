import { describe, expect, test, vi } from "vitest"

import { createPlannerApi } from "./planner-api"

const generationInput = {
  householdId: "20000000-0000-0000-0000-000000000001",
  weekStart: "2026-08-31",
  idempotencyKey: "30000000-0000-0000-0000-000000000001"
}

describe("planner API recovery metadata", () => {
  test("returns a safe correlation id with typed API failures", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: vi.fn(() => "client.req-1") },
      json: () => Promise.resolve({ error: "PLANNER_UNAVAILABLE" })
    })

    await expect(createPlannerApi(fetcher).generate("token", generationInput)).resolves.toEqual({
      ok: false,
      error: "PLANNER_UNAVAILABLE",
      correlationId: "client.req-1"
    })
  })

  test.each(["contains a space", "<script>", "x".repeat(97)])(
    "drops unsafe correlation id %s",
    async (correlationId) => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: vi.fn(() => correlationId) },
        json: () => Promise.resolve({ error: "STALE_PLAN_VERSION" })
      })

      await expect(createPlannerApi(fetcher).generate("token", generationInput)).resolves.toEqual({
        ok: false,
        error: "STALE_PLAN_VERSION"
      })
    }
  )
})
