import { describe, expect, test, vi } from "vitest"

import type { OperationalEvent, OperationalTelemetry } from "./operational-telemetry"
import { operationalTelemetryFromEnvironment, withWebhookAlerts } from "./webhook-alert-telemetry"

function event(overrides: Partial<OperationalEvent> = {}): OperationalEvent {
  return {
    event: "planner_request",
    operation: "generate",
    correlationId: "cid-1",
    durationMs: 12,
    httpStatus: 503,
    outcomeCode: "PLANNER_DATA_UNAVAILABLE",
    ...overrides
  } as OperationalEvent
}

function sentBody(fetcher: {
  readonly mock: { readonly calls: unknown[][] }
}): Record<string, unknown> {
  const init = fetcher.mock.calls[0]?.[1] as { body?: unknown } | undefined
  const body = init?.body
  if (typeof body !== "string") throw new Error("expected a JSON string body")
  return JSON.parse(body) as Record<string, unknown>
}

function recorder(): OperationalTelemetry & { readonly seen: OperationalEvent[] } {
  const seen: OperationalEvent[] = []
  return { seen, emit: (value) => void seen.push(value) }
}

describe("withWebhookAlerts", () => {
  test("sends a server failure somewhere a person will see it", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const inner = recorder()

    withWebhookAlerts(inner, { url: "https://hooks.example/x", fetcher }).emit(event())
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    const body = sentBody(fetcher)
    expect(body.outcomeCode).toBe("PLANNER_DATA_UNAVAILABLE")
    expect(body.correlationId).toBe("cid-1")
  })

  test("still writes the log line, so a dropped delivery does not take the evidence with it", () => {
    const inner = recorder()
    withWebhookAlerts(inner, { url: "https://hooks.example/x", fetcher: vi.fn() }).emit(event())

    expect(inner.seen).toHaveLength(1)
  })

  test("stays quiet for a 4xx, which is the caller being told no", () => {
    const fetcher = vi.fn()
    const telemetry = withWebhookAlerts(recorder(), { url: "https://hooks.example/x", fetcher })

    telemetry.emit(event({ httpStatus: 400, outcomeCode: "INVALID_PLANNER_REQUEST" }))
    telemetry.emit(event({ httpStatus: 401, outcomeCode: "UNAUTHORIZED" }))
    telemetry.emit(event({ httpStatus: 429, outcomeCode: "PLANNER_RATE_LIMITED" }))
    telemetry.emit(event({ httpStatus: 200, outcomeCode: "ready_within_budget" }))

    expect(fetcher).not.toHaveBeenCalled()
  })

  test("sends nothing that identifies a household or a person", async () => {
    // Built field by field on purpose: a field added to OperationalEvent later must not start
    // flowing to a third party because nobody remembered this file.
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    withWebhookAlerts(recorder(), { url: "https://hooks.example/x", fetcher }).emit(
      event({ correlationId: "cid-2" })
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    const body = sentBody(fetcher)
    expect(Object.keys(body).sort()).toEqual([
      "correlationId",
      "event",
      "httpStatus",
      "operation",
      "origin",
      "outcomeCode",
      "text"
    ])
  })

  test("does not fail the request when the webhook does", () => {
    // A failure to alert must never become an outage caused by the thing meant to report outages.
    const onError = vi.fn()
    const telemetry = withWebhookAlerts(recorder(), {
      url: "https://hooks.example/x",
      fetcher: vi.fn().mockRejectedValue(new Error("gone")),
      onError
    })

    expect(() => telemetry.emit(event())).not.toThrow()
  })

  test("does not fail the request when fetch throws synchronously either", () => {
    const telemetry = withWebhookAlerts(recorder(), {
      url: "https://hooks.example/x",
      fetcher: vi.fn().mockImplementation(() => {
        throw new Error("no network stack")
      })
    })

    expect(() => telemetry.emit(event())).not.toThrow()
  })
})

describe("operationalTelemetryFromEnvironment", () => {
  test("is the console sink alone when no webhook is configured", () => {
    const inner = recorder()

    expect(operationalTelemetryFromEnvironment(inner, {})).toBe(inner)
    expect(operationalTelemetryFromEnvironment(inner, { BEPNHA_ALERT_WEBHOOK_URL: "  " })).toBe(
      inner
    )
  })

  test("wraps the console sink when one is", () => {
    const inner = recorder()

    expect(
      operationalTelemetryFromEnvironment(inner, {
        BEPNHA_ALERT_WEBHOOK_URL: "https://hooks.example/x"
      })
    ).not.toBe(inner)
  })
})
