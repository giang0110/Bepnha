import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import type { AssistantPlanEvidence } from "@/application/assistant/meal-assistant"
import { createAssistantHttpHandler } from "@/infrastructure/server/assistant-http"
import { createInMemoryAssistantRateLimiter } from "@/infrastructure/server/in-memory-assistant-rate-limiter"

const PLAN_ID = "40000000-0000-0000-0000-000000000001"
const REVISION_ID = "50000000-0000-0000-0000-000000000001"

const evidence: AssistantPlanEvidence = {
  meals: Array.from({ length: 7 }, (_, dayIndex) => ({
    dayIndex,
    dayLabelVi: `Ngày ${dayIndex + 1}`,
    mealNameVi: `Bữa ${dayIndex + 1}`,
    elapsedMinutes: 20
  })),
  budgetStatus: "within",
  totalEstimatedCostVnd: 600_000,
  budgetVnd: 700_000,
  warningCodes: []
}

function responseDouble() {
  const state = {
    body: undefined as unknown,
    statusCode: 0,
    headers: new Map<string, string>()
  }
  const response = {
    status(statusCode: number) {
      state.statusCode = statusCode
      return response
    },
    json(body: unknown) {
      state.body = body
      return response
    },
    setHeader(name: string, value: string) {
      state.headers.set(name, value)
      return response
    }
  } as unknown as VercelResponse
  return { state, response }
}

function request() {
  return {
    method: "POST",
    body: {
      planId: PLAN_ID,
      expectedRevisionId: REVISION_ID,
      question: "Giải thích kế hoạch này"
    },
    headers: {
      authorization: "Bearer signed-token",
      "content-type": "application/json"
    }
  } as unknown as VercelRequest
}

describe("in-memory assistant rate limiter", () => {
  test("enforces a rolling five-request burst independently per user", async () => {
    const limiter = createInMemoryAssistantRateLimiter({
      burstLimit: 5,
      burstWindowMs: 60_000,
      dailyLimit: 50
    })

    for (let index = 0; index < 5; index += 1) {
      await expect(
        limiter.consume({ actorUserId: "user-a", nowMs: 1_000 + index })
      ).resolves.toEqual({ allowed: true })
    }

    const denied = await limiter.consume({ actorUserId: "user-a", nowMs: 2_000 })
    expect(denied.allowed).toBe(false)
    if (!denied.allowed) expect(denied.retryAfterSeconds).toBeGreaterThan(0)

    await expect(
      limiter.consume({ actorUserId: "user-b", nowMs: 2_000 })
    ).resolves.toEqual({ allowed: true })
    await expect(
      limiter.consume({ actorUserId: "user-a", nowMs: 61_001 })
    ).resolves.toEqual({ allowed: true })
  })

  test("enforces the daily quota and resets at the next UTC day", async () => {
    const limiter = createInMemoryAssistantRateLimiter({
      burstLimit: 100,
      burstWindowMs: 60_000,
      dailyLimit: 50
    })
    const dayStart = Date.UTC(2026, 8, 3)

    for (let index = 0; index < 50; index += 1) {
      await expect(
        limiter.consume({ actorUserId: "user-a", nowMs: dayStart + index * 1_000 })
      ).resolves.toEqual({ allowed: true })
    }

    const denied = await limiter.consume({
      actorUserId: "user-a",
      nowMs: dayStart + 55_000
    })
    expect(denied.allowed).toBe(false)

    await expect(
      limiter.consume({ actorUserId: "user-a", nowMs: dayStart + 86_400_000 })
    ).resolves.toEqual({ allowed: true })
  })
})

describe("assistant HTTP rate-limit boundary", () => {
  test("returns a bounded 429 after verified current context and before provider invocation", async () => {
    const respond = vi.fn()
    const consume = vi.fn(() =>
      Promise.resolve({ allowed: false as const, retryAfterSeconds: 12 })
    )
    const handler = createAssistantHttpHandler({
      auth: { verify: vi.fn(() => Promise.resolve({ userId: "user-1" })) },
      contextRepositoryFor: () => ({
        loadCurrent: vi.fn(() =>
          Promise.resolve({
            ok: true as const,
            value: { currentRevisionId: REVISION_ID, evidence }
          })
        )
      }),
      assistant: { respond },
      rateLimiter: { consume },
      telemetry: { emit: vi.fn() },
      createCorrelationId: () => "phase8-rate-limit",
      now: () => 100
    })
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(consume).toHaveBeenCalledOnce()
    expect(consume).toHaveBeenCalledWith({ actorUserId: "user-1", nowMs: 100 })
    expect(respond).not.toHaveBeenCalled()
    expect(state.statusCode).toBe(429)
    expect(state.body).toEqual({ error: "ASSISTANT_RATE_LIMITED" })
    expect(state.headers.get("Retry-After")).toBe("12")
  })

  test("does not consume quota for stale assistant context", async () => {
    const consume = vi.fn()
    const respond = vi.fn()
    const handler = createAssistantHttpHandler({
      auth: { verify: vi.fn(() => Promise.resolve({ userId: "user-1" })) },
      contextRepositoryFor: () => ({
        loadCurrent: vi.fn(() =>
          Promise.resolve({
            ok: true as const,
            value: {
              currentRevisionId: "50000000-0000-0000-0000-000000000099",
              evidence
            }
          })
        )
      }),
      assistant: { respond },
      rateLimiter: { consume },
      telemetry: { emit: vi.fn() },
      createCorrelationId: () => "phase8-stale",
      now: () => 100
    })
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(state.statusCode).toBe(409)
    expect(consume).not.toHaveBeenCalled()
    expect(respond).not.toHaveBeenCalled()
  })
})
