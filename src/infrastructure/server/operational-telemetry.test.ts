import { afterEach, describe, expect, test, vi } from "vitest"

import {
  correlationId,
  createConsoleOperationalTelemetry,
  type OperationalEvent
} from "./operational-telemetry"

describe("operational telemetry", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("reuses only conservative correlation ids", () => {
    expect(correlationId("req-2026.09:02_ok", () => "generated-id")).toBe("req-2026.09:02_ok")
    expect(correlationId("token\nsecret", () => "generated-id")).toBe("generated-id")
    expect(correlationId("x".repeat(97), () => "generated-id")).toBe("generated-id")
    expect(correlationId(undefined, () => "generated-id")).toBe("generated-id")
  })

  test("emits only the sanitized operational event shape", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const telemetry = createConsoleOperationalTelemetry()
    const event = {
      event: "planner_request",
      operation: "generate",
      correlationId: "req-safe",
      durationMs: 12.6,
      httpStatus: 503,
      outcomeCode: "PLANNER_UNAVAILABLE",
      accessToken: "Bearer must-not-log",
      requestBody: { householdId: "private-household" },
      stack: "database secret stack"
    } as OperationalEvent & Record<string, unknown>

    telemetry.emit(event)

    expect(info).toHaveBeenCalledOnce()
    const serialized = String(info.mock.calls[0]?.[0])
    expect(JSON.parse(serialized)).toEqual({
      event: "planner_request",
      operation: "generate",
      correlationId: "req-safe",
      durationMs: 13,
      httpStatus: 503,
      outcomeCode: "PLANNER_UNAVAILABLE"
    })
    expect(serialized).not.toMatch(/Bearer|private-household|database secret stack/u)
  })

  test("clamps invalid duration to zero", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const telemetry = createConsoleOperationalTelemetry()

    telemetry.emit({
      event: "planner_request",
      operation: "preview",
      correlationId: "req-safe",
      durationMs: Number.NaN,
      httpStatus: 200,
      outcomeCode: "OK"
    })

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({ durationMs: 0 })
  })
})
