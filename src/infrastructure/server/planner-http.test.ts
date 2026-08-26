import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import type { PlannerRepository } from "@/application/planner/planner-use-cases"

import { createPlannerHttpHandlers } from "./planner-http"

function responseDouble() {
  const state = {
    body: undefined as unknown,
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn()
  }
  const response = state as unknown as VercelResponse
  state.status.mockReturnValue(response)
  state.json.mockImplementation((body: unknown) => {
    state.body = body
    return response
  })
  return { state, response }
}

function request(
  body: unknown,
  options: {
    method?: string
    authorization?: string
    contentType?: string
    planId?: string | string[]
  } = {}
) {
  return {
    method: options.method ?? "POST",
    body,
    headers: {
      authorization: options.authorization ?? "Bearer signed-token",
      "content-type": options.contentType ?? "application/json"
    },
    query: options.planId === undefined ? {} : { planId: options.planId }
  } as unknown as VercelRequest
}

const repository = {} as PlannerRepository

function setup() {
  const generate = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      planId: "40000000-0000-0000-0000-000000000001",
      revisionId: "50000000-0000-0000-0000-000000000001",
      planVersion: 1,
      idempotent: false,
      status: "ready_within_budget",
      budgetVnd: 700_000,
      plan: { items: [], totalEstimatedCostVnd: 600_000 },
      warnings: [],
      catalogFingerprint: "a".repeat(64),
      inputFingerprint: "b".repeat(64),
      calculationFingerprint: "c".repeat(64)
    }
  })
  const preview = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      status: "ready_within_budget",
      items: [],
      weeklyEstimatedCostVnd: 610_000,
      weeklyCostDeltaVnd: 10_000,
      warnings: [],
      previewFingerprint: "d".repeat(64)
    }
  })
  const apply = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      planId: "40000000-0000-0000-0000-000000000001",
      revisionId: "50000000-0000-0000-0000-000000000002",
      planVersion: 2,
      idempotent: false,
      status: "ready_within_budget",
      budgetVnd: 700_000,
      costDeltaVnd: 10_000,
      plan: { items: [], totalEstimatedCostVnd: 610_000 },
      warnings: []
    }
  })
  const handlers = createPlannerHttpHandlers({
    auth: { verify: vi.fn().mockResolvedValue({ userId: "user-1" }) },
    repositoryFor: vi.fn(() => repository),
    hasher: { sha256: vi.fn() },
    operations: { generate, preview, apply }
  })
  return { handlers, generate, preview, apply }
}

describe("authoritative planner HTTP handlers", () => {
  test("generation accepts only user intent and binds the verified actor", async () => {
    const { handlers, generate } = setup()
    const { state, response } = responseDouble()
    await handlers.generate(
      request({
        householdId: "20000000-0000-0000-0000-000000000001",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26",
        idempotencyKey: "30000000-0000-0000-0000-000000000001"
      }),
      response
    )
    expect(generate).toHaveBeenCalledWith(
      repository,
      expect.anything(),
      expect.objectContaining({ actorUserId: "user-1" })
    )
    expect(state.status).toHaveBeenCalledWith(200)
    expect(state.body).toMatchObject({ status: "ready_within_budget", budgetVnd: 700_000 })
    expect(state.body).not.toHaveProperty("inputSnapshot")
    expect(state.body).not.toHaveProperty("calculationSnapshot")
  })

  test.each([
    [request({}, { method: "GET" }), 405, "METHOD_NOT_ALLOWED"],
    [request({}, { contentType: "text/plain" }), 415, "UNSUPPORTED_MEDIA_TYPE"],
    [request({}, { authorization: "forged" }), 401, "UNAUTHORIZED"],
    [
      request({
        householdId: "20000000-0000-0000-0000-000000000001",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26",
        idempotencyKey: "30000000-0000-0000-0000-000000000001",
        totalEstimatedCostVnd: 1
      }),
      400,
      "VALIDATION_FAILED"
    ],
    [
      request({
        householdId: "bad",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26",
        idempotencyKey: "bad"
      }),
      400,
      "VALIDATION_FAILED"
    ]
  ] as const)("rejects invalid generation requests", async (input, status, error) => {
    const { handlers, generate } = setup()
    const { state, response } = responseDouble()
    await handlers.generate(input, response)
    expect(state.status).toHaveBeenCalledWith(status)
    expect(state.body).toEqual({ error })
    expect(generate).not.toHaveBeenCalled()
  })

  test("preview is read-only intent and apply requires the exact preview fingerprint", async () => {
    const { handlers, preview, apply } = setup()
    const planId = "40000000-0000-0000-0000-000000000001"
    const previewBody = {
      targetDayIndex: 2,
      expectedPlanVersion: 1,
      expectedCurrentRevisionId: "50000000-0000-0000-0000-000000000001"
    }
    const previewResponse = responseDouble()
    await handlers.preview(request(previewBody, { planId }), previewResponse.response)
    expect(preview).toHaveBeenCalledOnce()
    expect(apply).not.toHaveBeenCalled()
    expect(previewResponse.state.body).toMatchObject({
      previewFingerprint: "d".repeat(64),
      costDeltaVnd: 10_000
    })

    const applyResponse = responseDouble()
    await handlers.apply(
      request(
        {
          ...previewBody,
          previewFingerprint: "d".repeat(64),
          idempotencyKey: "30000000-0000-0000-0000-000000000002"
        },
        { planId }
      ),
      applyResponse.response
    )
    expect(apply).toHaveBeenCalledOnce()
    expect(applyResponse.state.body).toMatchObject({ planVersion: 2, costDeltaVnd: 10_000 })
  })

  test("rejects oversized, unknown, forged, or invalid replacement input", async () => {
    const { handlers, preview, apply } = setup()
    const planId = "40000000-0000-0000-0000-000000000001"
    for (const [handler, body] of [
      [
        (req: VercelRequest, res: VercelResponse) => handlers.preview(req, res),
        { targetDayIndex: 7, expectedPlanVersion: 1, expectedCurrentRevisionId: planId }
      ],
      [
        (req: VercelRequest, res: VercelResponse) => handlers.preview(req, res),
        {
          targetDayIndex: 2,
          expectedPlanVersion: 1,
          expectedCurrentRevisionId: planId,
          score: 999
        }
      ],
      [
        (req: VercelRequest, res: VercelResponse) => handlers.apply(req, res),
        {
          targetDayIndex: 2,
          expectedPlanVersion: 1,
          expectedCurrentRevisionId: planId,
          previewFingerprint: "not-a-hash",
          idempotencyKey: planId
        }
      ]
    ] as const) {
      const result = responseDouble()
      await handler(request(body, { planId }), result.response)
      expect(result.state.status).toHaveBeenCalledWith(400)
    }
    const oversized = responseDouble()
    await handlers.generate(request({ value: "x".repeat(65_000) }), oversized.response)
    expect(oversized.state.status).toHaveBeenCalledWith(413)
    expect(preview).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  test("maps typed failures and sanitizes thrown dependency details", async () => {
    const base = setup()
    base.generate.mockResolvedValueOnce({ ok: false, error: { code: "UNAUTHORIZED" } })
    const unauthorized = responseDouble()
    await base.handlers.generate(
      request({
        householdId: "20000000-0000-0000-0000-000000000001",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26",
        idempotencyKey: "30000000-0000-0000-0000-000000000001"
      }),
      unauthorized.response
    )
    expect(unauthorized.state.status).toHaveBeenCalledWith(403)

    const failed = setup()
    failed.generate.mockRejectedValueOnce(new Error("SUPABASE_SECRET_KEY database details"))
    const unavailable = responseDouble()
    await failed.handlers.generate(
      request({
        householdId: "20000000-0000-0000-0000-000000000001",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26",
        idempotencyKey: "30000000-0000-0000-0000-000000000001"
      }),
      unavailable.response
    )
    expect(unavailable.state.body).toEqual({ error: "PLANNER_UNAVAILABLE" })
    expect(JSON.stringify(unavailable.state.body)).not.toMatch(/secret|supabase|database/i)
  })
})
