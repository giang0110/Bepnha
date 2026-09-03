import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import type { AssistantContextRepository } from "@/application/assistant/assistant-context-repository"
import type {
  AssistantPlanEvidence,
  MealAssistantPort
} from "@/application/assistant/meal-assistant"

import { createAssistantHttpHandler } from "./assistant-http"

const PLAN_ID = "40000000-0000-0000-0000-000000000001"
const REVISION_ID = "50000000-0000-0000-0000-000000000001"

const evidence: AssistantPlanEvidence = {
  meals: Array.from({ length: 7 }, (_, dayIndex) => ({
    dayIndex,
    dayLabelVi: `Ngày ${dayIndex + 1}`,
    mealNameVi: `Bữa ${dayIndex + 1}`,
    elapsedMinutes: 20 + dayIndex
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
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn()
  }
  const response = state as unknown as VercelResponse
  state.status.mockImplementation((statusCode: number) => {
    state.statusCode = statusCode
    return response
  })
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
    correlationId?: string
  } = {}
) {
  return {
    method: options.method ?? "POST",
    body,
    headers: {
      authorization: options.authorization ?? "Bearer signed-token",
      "content-type": options.contentType ?? "application/json",
      "x-correlation-id": options.correlationId
    }
  } as unknown as VercelRequest
}

function validBody(question = "Giải thích kế hoạch này") {
  return { planId: PLAN_ID, expectedRevisionId: REVISION_ID, question }
}

function setup(
  options: {
    currentRevisionId?: string
    contextResult?: Awaited<ReturnType<AssistantContextRepository["loadCurrent"]>>
    assistant?: MealAssistantPort | null
  } = {}
) {
  const contextResult = options.contextResult ?? {
    ok: true as const,
    value: { currentRevisionId: options.currentRevisionId ?? REVISION_ID, evidence }
  }
  const loadCurrent = vi.fn(() => Promise.resolve(contextResult))
  const contextRepository: AssistantContextRepository = { loadCurrent }
  const respond = vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: {
        kind: "explanation" as const,
        summaryVi: "Kế hoạch dùng dữ liệu tất định hiện tại.",
        observationsVi: ["Bảy bữa đã được xác minh từ revision hiện hành."]
      }
    })
  )
  const assistant: MealAssistantPort =
    options.assistant === undefined ? { respond } : (options.assistant ?? { respond })
  const emit = vi.fn()
  const handler = createAssistantHttpHandler({
    auth: { verify: vi.fn(() => Promise.resolve({ userId: "user-1" })) },
    contextRepository,
    assistant: options.assistant === null ? null : assistant,
    telemetry: { emit },
    createCorrelationId: () => "generated-assistant-correlation",
    now: () => 100
  })
  return { handler, loadCurrent, respond, emit }
}

function expectSecurityHeaders(setHeader: ReturnType<typeof vi.fn>): void {
  expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff")
  expect(setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer")
  expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY")
  expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
}

describe("assistant HTTP", () => {
  test("returns a verified assistant result with safe correlation and one sanitized event", async () => {
    const { handler, loadCurrent, respond, emit } = setup()
    const { state, response } = responseDouble()

    await handler(request(validBody(), { correlationId: "client.assistant-1" }), response)

    expect(state.statusCode).toBe(200)
    expect(state.body).toEqual({
      kind: "explanation",
      summaryVi: "Kế hoạch dùng dữ liệu tất định hiện tại.",
      observationsVi: ["Bảy bữa đã được xác minh từ revision hiện hành."]
    })
    expect(state.setHeader).toHaveBeenCalledWith("x-correlation-id", "client.assistant-1")
    expectSecurityHeaders(state.setHeader)
    expect(loadCurrent).toHaveBeenCalledWith({ actorUserId: "user-1", planId: PLAN_ID })
    expect(respond).toHaveBeenCalledWith({ question: "Giải thích kế hoạch này", evidence })
    expect(emit).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith({
      event: "assistant_request",
      operation: "respond",
      correlationId: "client.assistant-1",
      durationMs: 0,
      httpStatus: 200,
      outcomeCode: "explanation"
    })
    const serialized = JSON.stringify(emit.mock.calls)
    expect(serialized).not.toContain("Giải thích kế hoạch này")
    expect(serialized).not.toContain("signed-token")
  })

  test("rejects stale revision before invoking the provider", async () => {
    const { handler, respond } = setup({
      currentRevisionId: "50000000-0000-0000-0000-000000000099"
    })
    const { state, response } = responseDouble()

    await handler(request(validBody()), response)

    expect(state.statusCode).toBe(409)
    expect(state.body).toEqual({ error: "STALE_ASSISTANT_CONTEXT" })
    expect(respond).not.toHaveBeenCalled()
  })

  test("fails closed when the assistant is disabled", async () => {
    const { handler } = setup({ assistant: null })
    const { state, response } = responseDouble()

    await handler(request(validBody()), response)

    expect(state.statusCode).toBe(503)
    expect(state.body).toEqual({ error: "ASSISTANT_DISABLED" })
  })

  test("maps provider failure to a safe unavailable response", async () => {
    const respond = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: "ASSISTANT_UNAVAILABLE" as const })
    )
    const { handler } = setup({ assistant: { respond } })
    const { state, response } = responseDouble()

    await handler(request(validBody()), response)

    expect(state.statusCode).toBe(503)
    expect(state.body).toEqual({ error: "ASSISTANT_UNAVAILABLE" })
  })

  test.each([
    ["wrong method", request(validBody(), { method: "GET" }), 405],
    ["wrong media type", request(validBody(), { contentType: "text/plain" }), 415],
    ["extra key", request({ ...validBody(), plan: { injected: true } }), 400],
    ["bad plan id", request({ ...validBody(), planId: "not-a-uuid" }), 400],
    ["bad revision id", request({ ...validBody(), expectedRevisionId: "not-a-uuid" }), 400],
    ["blank question", request(validBody("   ")), 400],
    ["oversized question", request(validBody("x".repeat(501))), 400]
  ] as const)("rejects invalid request: %s", async (_label, incoming, statusCode) => {
    const { handler, loadCurrent, respond } = setup()
    const { state, response } = responseDouble()

    await handler(incoming, response)

    expect(state.statusCode).toBe(statusCode)
    expect(state.body).toEqual({ error: "INVALID_ASSISTANT_REQUEST" })
    expect(loadCurrent).not.toHaveBeenCalled()
    expect(respond).not.toHaveBeenCalled()
  })

  test("requires a valid bearer identity before loading plan context", async () => {
    const loadCurrent = vi.fn()
    const emit = vi.fn()
    const handler = createAssistantHttpHandler({
      auth: { verify: vi.fn(() => Promise.resolve(null)) },
      contextRepository: { loadCurrent },
      assistant: { respond: vi.fn() },
      telemetry: { emit },
      createCorrelationId: () => "correlation",
      now: () => 100
    })
    const { state, response } = responseDouble()

    await handler(request(validBody()), response)

    expect(state.statusCode).toBe(401)
    expect(state.body).toEqual({ error: "UNAUTHORIZED" })
    expect(loadCurrent).not.toHaveBeenCalled()
  })

  test("maps owner denial and context dependency failure without invoking Gemini", async () => {
    for (const [contextResult, expectedStatus, expectedError] of [
      [{ ok: false as const, error: "UNAUTHORIZED" as const }, 403, "UNAUTHORIZED"],
      [
        { ok: false as const, error: "TRANSIENT_DEPENDENCY_FAILURE" as const },
        503,
        "ASSISTANT_UNAVAILABLE"
      ]
    ] as const) {
      const { handler, respond } = setup({ contextResult })
      const { state, response } = responseDouble()

      await handler(request(validBody()), response)

      expect(state.statusCode).toBe(expectedStatus)
      expect(state.body).toEqual({ error: expectedError })
      expect(respond).not.toHaveBeenCalled()
    }
  })
})
