import {
  createConsoleOperationalTelemetry,
  type OperationalEvent,
  type OperationalTelemetry
} from "./operational-telemetry.js"

/** Server failures only. A 4xx is the caller being told no, which is the system working. */
function isAlertable(event: OperationalEvent): boolean {
  return event.httpStatus >= 500
}

/**
 * The whole of what leaves the process.
 *
 * Built field by field rather than by spreading the event, so a field added to `OperationalEvent`
 * later cannot start flowing to a third party because nobody remembered this file. Nothing here
 * identifies a household or a person: the correlation id is the thread back to the logs, and the
 * logs are where the detail stays.
 */
function payload(event: OperationalEvent, origin: string) {
  return {
    text: `Bếp Nhà ${event.event}/${event.operation} failed: ${event.outcomeCode} (HTTP ${event.httpStatus})`,
    origin,
    event: event.event,
    operation: event.operation,
    outcomeCode: event.outcomeCode,
    httpStatus: event.httpStatus,
    correlationId: event.correlationId
  }
}

export interface WebhookAlertOptions {
  readonly url: string
  readonly origin?: string
  readonly timeoutMs?: number
  readonly fetcher?: typeof fetch
  readonly onError?: (error: unknown) => void
}

/**
 * Sends server failures somewhere a person will see them.
 *
 * Until now every failure went to `console.info`, which on Vercel means a log nobody is watching.
 * That is how plan generation stayed down for every household on 2026-09-23 until someone happened
 * to open the app: the system knew, and had no way to say so.
 *
 * Three properties matter more than the feature:
 *
 * It never delays a response. The POST is not awaited by the caller and carries its own timeout, so
 * a wedged webhook endpoint cannot turn into a wedged API.
 *
 * It never fails a request. Alerting is the least important thing happening in the process; a
 * failure to alert is swallowed rather than raised, because the alternative is an outage caused by
 * the thing that was meant to report outages.
 *
 * It always writes the log line too. The webhook is an addition to the record, never a replacement
 * for it — a delivery that silently dropped would otherwise take the evidence with it.
 */
export function withWebhookAlerts(
  inner: OperationalTelemetry,
  options: WebhookAlertOptions
): OperationalTelemetry {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? 2_000
  const origin = options.origin ?? "unknown"

  return {
    emit(event) {
      inner.emit(event)
      if (!isAlertable(event)) return
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        void fetcher(options.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload(event, origin)),
          signal: controller.signal
        })
          .catch((error: unknown) => options.onError?.(error))
          .finally(() => clearTimeout(timer))
      } catch (error: unknown) {
        options.onError?.(error)
      }
    }
  }
}

/**
 * The telemetry a route should use, wired from the environment.
 *
 * No webhook configured is the ordinary case and not a degraded one: the console sink alone is what
 * the app has always had. Configuring `BEPNHA_ALERT_WEBHOOK_URL` adds delivery on top.
 */
export function operationalTelemetryFromEnvironment(
  inner: OperationalTelemetry,
  environment: Readonly<Record<string, string | undefined>> = process.env
): OperationalTelemetry {
  const url = environment.BEPNHA_ALERT_WEBHOOK_URL
  if (url === undefined || url.trim() === "") return inner
  return withWebhookAlerts(inner, {
    url: url.trim(),
    ...(environment.VERCEL_ENV === undefined ? {} : { origin: environment.VERCEL_ENV })
  })
}

/**
 * What every route uses when the caller does not inject its own.
 *
 * One place, so a new route cannot quietly ship without alerting, and so the three that exist
 * cannot drift apart.
 */
export function defaultOperationalTelemetry(): OperationalTelemetry {
  return operationalTelemetryFromEnvironment(createConsoleOperationalTelemetry())
}
