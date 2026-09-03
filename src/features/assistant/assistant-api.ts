import type { AssistantResult } from "@/application/assistant/meal-assistant"

export type AssistantApiResult =
  | { readonly ok: true; readonly value: AssistantResult }
  | { readonly ok: false; readonly error: string; readonly correlationId?: string }

export interface AssistantApi {
  readonly ask: (
    accessToken: string,
    input: {
      readonly planId: string
      readonly expectedRevisionId: string
      readonly question: string
    }
  ) => Promise<AssistantApiResult>
}

interface FetchResponse {
  readonly ok: boolean
  readonly headers?: { readonly get: (name: string) => string | null }
  readonly json: () => Promise<unknown>
}

type Fetcher = (url: string, init: RequestInit) => Promise<FetchResponse>

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,96}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
}

function parseAssistantResult(value: unknown): AssistantResult | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null
  if (value.kind === "explanation") {
    if (!exactKeys(value, ["kind", "summaryVi", "observationsVi"])) return null
    if (!boundedText(value.summaryVi, 600) || !Array.isArray(value.observationsVi)) return null
    if (
      value.observationsVi.length > 5 ||
      !value.observationsVi.every((item) => boundedText(item, 240))
    ) {
      return null
    }
    return {
      kind: "explanation",
      summaryVi: value.summaryVi,
      observationsVi: value.observationsVi as string[]
    }
  }
  if (value.kind === "replacement_proposal") {
    if (!exactKeys(value, ["kind", "targetDayIndex", "reasonVi"])) return null
    if (
      typeof value.targetDayIndex !== "number" ||
      !Number.isSafeInteger(value.targetDayIndex) ||
      value.targetDayIndex < 0 ||
      value.targetDayIndex > 6 ||
      !boundedText(value.reasonVi, 320)
    ) {
      return null
    }
    return {
      kind: "replacement_proposal",
      targetDayIndex: value.targetDayIndex,
      reasonVi: value.reasonVi
    }
  }
  if (value.kind === "unsupported") {
    if (!exactKeys(value, ["kind", "messageVi"]) || !boundedText(value.messageVi, 240)) return null
    return { kind: "unsupported", messageVi: value.messageVi }
  }
  return null
}

function correlationId(response: FetchResponse): string | undefined {
  try {
    const value = response.headers?.get("x-correlation-id")
    return typeof value === "string" && SAFE_CORRELATION_ID.test(value) ? value : undefined
  } catch {
    return undefined
  }
}

function failure(error: string, response?: FetchResponse): AssistantApiResult {
  const id = response === undefined ? undefined : correlationId(response)
  return id === undefined ? { ok: false, error } : { ok: false, error, correlationId: id }
}

export function createAssistantApi(
  fetcher: Fetcher = (url, init) => fetch(url, init) as Promise<FetchResponse>
): AssistantApi {
  return {
    async ask(accessToken, input) {
      let response: FetchResponse
      try {
        response = await fetcher("/api/assistant", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(input)
        })
      } catch {
        return failure("ASSISTANT_UNAVAILABLE")
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        return failure("ASSISTANT_UNAVAILABLE", response)
      }

      if (!response.ok) {
        return failure(
          isRecord(body) && typeof body.error === "string" ? body.error : "ASSISTANT_UNAVAILABLE",
          response
        )
      }

      const result = parseAssistantResult(body)
      return result === null
        ? failure("ASSISTANT_UNAVAILABLE", response)
        : { ok: true, value: result }
    }
  }
}
