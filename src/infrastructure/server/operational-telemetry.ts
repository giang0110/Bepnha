const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,96}$/u

export interface OperationalEvent {
  readonly event: "planner_request"
  readonly operation: "generate" | "preview" | "apply"
  readonly correlationId: string
  readonly durationMs: number
  readonly httpStatus: number
  readonly outcomeCode: string
}

export interface OperationalTelemetry {
  emit(event: OperationalEvent): void
}

export function correlationId(
  input: unknown,
  create: () => string = () => crypto.randomUUID()
): string {
  return typeof input === "string" && SAFE_CORRELATION_ID.test(input) ? input : create()
}

function duration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

export function createConsoleOperationalTelemetry(): OperationalTelemetry {
  return {
    emit(event) {
      console.info(
        JSON.stringify({
          event: event.event,
          operation: event.operation,
          correlationId: event.correlationId,
          durationMs: duration(event.durationMs),
          httpStatus: event.httpStatus,
          outcomeCode: event.outcomeCode
        })
      )
    }
  }
}
