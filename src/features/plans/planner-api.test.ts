import { describe, expect, test, vi } from "vitest"

import { createPlannerApi } from "./planner-api"

describe("planner API adapter", () => {
  test("sends only generation intent with bearer authorization", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ready_within_budget",
          planId: "plan",
          revisionId: "revision",
          planVersion: 1,
          budgetVnd: 1,
          plan: { items: [], totalEstimatedCostVnd: 1 },
          warnings: []
        })
    })
    const api = createPlannerApi(fetcher)
    await api.generate("token", {
      householdId: "household",
      weekStart: "2026-08-31",
      idempotencyKey: "idempotency"
    })
    expect(fetcher).toHaveBeenCalledWith("/api/plans/generate", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        householdId: "household",
        weekStart: "2026-08-31",
        idempotencyKey: "idempotency"
      })
    })
  })

  test("uses closed preview/apply intent contracts and returns typed failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ previewFingerprint: "hash" })
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "STALE_PLAN_VERSION" })
      })
    const api = createPlannerApi(fetcher)
    await api.preview("token", { planId: "plan", targetDayIndex: 2, expectedPlanVersion: 1 })
    await expect(
      api.apply("token", {
        planId: "plan",
        targetDayIndex: 2,
        expectedPlanVersion: 1,
        expectedCurrentRevisionId: "revision",
        previewCalculationFingerprint: "hash",
        idempotencyKey: "key"
      })
    ).resolves.toEqual({ ok: false, error: "STALE_PLAN_VERSION" })
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/plans/replacements-preview", expect.anything())
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/plans/replacements-apply", expect.anything())
  })

  test("sanitizes malformed and network responses", async () => {
    const malformed = createPlannerApi(
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ unexpected: true }) })
    )
    await expect(
      malformed.generate("token", { householdId: "h", weekStart: "w", idempotencyKey: "i" })
    ).resolves.toEqual({ ok: false, error: "PLANNER_UNAVAILABLE" })

    const network = createPlannerApi(vi.fn().mockRejectedValue(new Error("secret internals")))
    await expect(
      network.generate("token", { householdId: "h", weekStart: "w", idempotencyKey: "i" })
    ).resolves.toEqual({ ok: false, error: "PLANNER_UNAVAILABLE" })
  })

  test("reports a week with no plan as an absent plan, not as a plan-shaped value", async () => {
    // The server answers `{ plan: null }` for a week nobody has generated yet. The declared
    // return type is `PlannerReadyResponse | null`, and callers branch on `value === null`;
    // handing the envelope back instead made every empty week render as a plan whose items
    // cannot be read.
    const api = createPlannerApi(
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ plan: null }) })
    )
    await expect(
      api.current("token", { householdId: "household", weekStart: "2026-09-21" })
    ).resolves.toEqual({ ok: true, value: null })
  })
})
