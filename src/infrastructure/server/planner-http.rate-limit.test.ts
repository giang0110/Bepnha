import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import type { PlannerRepository } from "@/application/planner/planner-use-cases"
import type { RateLimiter } from "@/application/shared/rate-limiter"

import { createPlannerHttpHandlers } from "./planner-http"

const repository = {} as PlannerRepository

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

function request(body: unknown, authorization: string | undefined = "Bearer signed-token") {
  return {
    method: "POST",
    body,
    headers: { authorization, "content-type": "application/json" },
    query: {}
  } as unknown as VercelRequest
}

const generationBody = {
  householdId: "20000000-0000-0000-0000-000000000001",
  weekStart: "2026-08-31",
  idempotencyKey: "30000000-0000-0000-0000-000000000001"
}

const replacementBody = {
  planId: "40000000-0000-0000-0000-000000000001",
  targetDayIndex: 2,
  expectedPlanVersion: 1
}

const applyBody = {
  ...replacementBody,
  expectedCurrentRevisionId: "50000000-0000-0000-0000-000000000001",
  previewCalculationFingerprint: "d".repeat(64),
  idempotencyKey: "30000000-0000-0000-0000-000000000002"
}

function setup(rateLimiter: RateLimiter | undefined, verified: unknown = { userId: "user-1" }) {
  const operation = vi.fn().mockResolvedValue({
    ok: true,
    value: { status: "ready_within_budget", items: [], warnings: [] }
  })
  const emit = vi.fn()
  const handlers = createPlannerHttpHandlers({
    auth: { verify: vi.fn().mockResolvedValue(verified) },
    repositoryFor: vi.fn(() => repository),
    hasher: { sha256: vi.fn() },
    operations: { generate: operation, preview: operation, apply: operation, current: operation },
    calculationDate: () => "2026-08-26",
    telemetry: { emit },
    createCorrelationId: () => "generated-correlation-id",
    now: () => 100,
    rateLimitNow: () => 1_700_000_000_000,
    ...(rateLimiter === undefined ? {} : { rateLimiter })
  })
  return { handlers, operation, emit }
}

function denyingLimiter(retryAfterSeconds?: number) {
  const consume = vi.fn(() =>
    Promise.resolve(
      retryAfterSeconds === undefined
        ? { allowed: false as const }
        : { allowed: false as const, retryAfterSeconds }
    )
  )
  return { consume, limiter: { consume } satisfies RateLimiter }
}

describe("planner rate limiting", () => {
  test("refuses an over-quota generation before any planner work happens", async () => {
    const { handlers, operation } = setup(denyingLimiter(12).limiter)
    const { state, response } = responseDouble()

    await handlers.generate(request(generationBody), response)

    expect(state.status).toHaveBeenCalledWith(429)
    expect(state.body).toEqual({ error: "PLANNER_RATE_LIMITED" })
    expect(state.setHeader).toHaveBeenCalledWith("Retry-After", "12")
    expect(operation).not.toHaveBeenCalled()
  })

  test("omits Retry-After when the limiter cannot bound the wait", async () => {
    const { handlers } = setup(denyingLimiter().limiter)
    const { state, response } = responseDouble()

    await handlers.generate(request(generationBody), response)

    expect(state.status).toHaveBeenCalledWith(429)
    expect(state.setHeader).not.toHaveBeenCalledWith("Retry-After", expect.anything())
  })

  test("records the refusal as bounded operational telemetry", async () => {
    const { handlers, emit } = setup(denyingLimiter(12).limiter)
    const { response } = responseDouble()

    await handlers.generate(request(generationBody), response)

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "planner_request",
        operation: "generate",
        httpStatus: 429,
        outcomeCode: "PLANNER_RATE_LIMITED"
      })
    )
  })

  test.each([
    ["generate", generationBody],
    ["preview", replacementBody],
    ["apply", applyBody]
  ] as const)("gates %s", async (name, body) => {
    const { handlers, operation } = setup(denyingLimiter(12).limiter)
    const { state, response } = responseDouble()

    await handlers[name](request(body), response)

    expect(state.status).toHaveBeenCalledWith(429)
    expect(operation).not.toHaveBeenCalled()
  })

  test("never spends a real user's quota on an unauthenticated request", async () => {
    const { consume, limiter } = denyingLimiter(12)
    const { handlers } = setup(limiter, null)
    const { state, response } = responseDouble()

    await handlers.generate(request(generationBody), response)

    expect(state.status).toHaveBeenCalledWith(401)
    expect(consume).not.toHaveBeenCalled()
  })

  test("consumes quota for the verified actor only", async () => {
    const consume = vi.fn(() => Promise.resolve({ allowed: true as const }))
    const { handlers, operation } = setup({ consume } satisfies RateLimiter)
    const { response } = responseDouble()

    await handlers.generate(request(generationBody), response)

    expect(consume).toHaveBeenCalledWith({
      actorUserId: "user-1",
      nowMs: 1_700_000_000_000
    })
    expect(operation).toHaveBeenCalledOnce()
  })

  test("degrades to no throttling instead of failing when the limiter itself breaks", async () => {
    const consume = vi.fn(() => Promise.reject(new Error("redis down")))
    const { handlers, operation } = setup({ consume } satisfies RateLimiter)
    const { state, response } = responseDouble()

    await handlers.generate(request(generationBody), response)

    expect(state.status).toHaveBeenCalledWith(200)
    expect(operation).toHaveBeenCalledOnce()
  })

  test("behaves exactly as before when no limiter is configured", async () => {
    const { handlers, operation } = setup(undefined)
    const { state, response } = responseDouble()

    await handlers.generate(request(generationBody), response)

    expect(state.status).toHaveBeenCalledWith(200)
    expect(operation).toHaveBeenCalledOnce()
  })
})
