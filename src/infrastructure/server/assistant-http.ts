import type { VercelRequest, VercelResponse } from "@vercel/node"

import type { AssistantContextRepository } from "@/application/assistant/assistant-context-repository"
import {
  ASSISTANT_QUESTION_MAX_LENGTH,
  type MealAssistantPort
} from "@/application/assistant/meal-assistant"
import {
  correlationId,
  createConsoleOperationalTelemetry,
  type OperationalTelemetry
} from "@/infrastructure/server/operational-telemetry"
import { applyApiSecurityHeaders } from "@/infrastructure/server/security-headers"
import { parseBearerToken, type ServerAuthVerifier } from "@/infrastructure/supabase/server-auth"

type UnknownRecord = Record<string, unknown>

interface AssistantHttpDependencies {
  readonly auth: ServerAuthVerifier
  readonly contextRepository: AssistantContextRepository
  readonly assistant: MealAssistantPort | null
  readonly telemetry?: OperationalTelemetry
  readonly createCorrelationId?: () => string
  readonly now?: () => number
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu
const MAX_BODY_BYTES = 16_384

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: UnknownRecord, allowed: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function command(body: unknown) {
  if (!isRecord(body) || !exactKeys(body, ["planId", "expectedRevisionId", "question"])) return null
  if (
    typeof body.planId !== "string" ||
    !UUID.test(body.planId) ||
    typeof body.expectedRevisionId !== "string" ||
    !UUID.test(body.expectedRevisionId) ||
    typeof body.question !== "string"
  ) {
    return null
  }
  const question = body.question.trim()
  if (question.length < 1 || question.length > ASSISTANT_QUESTION_MAX_LENGTH) return null
  return { planId: body.planId, expectedRevisionId: body.expectedRevisionId, question }
}

function bodyIsTooLarge(body: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(body) ?? "", "utf8") > MAX_BODY_BYTES
  } catch {
    return true
  }
}

function preflight(request: VercelRequest, response: VercelResponse): boolean {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    response.status(405).json({ error: "INVALID_ASSISTANT_REQUEST" })
    return false
  }
  if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
    response.status(415).json({ error: "INVALID_ASSISTANT_REQUEST" })
    return false
  }
  if (bodyIsTooLarge(request.body)) {
    response.status(413).json({ error: "INVALID_ASSISTANT_REQUEST" })
    return false
  }
  return true
}

export function createAssistantHttpHandler(dependencies: AssistantHttpDependencies) {
  return async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
    applyApiSecurityHeaders(response)
    const now = dependencies.now ?? (() => performance.now())
    const telemetry = dependencies.telemetry ?? createConsoleOperationalTelemetry()
    const id = correlationId(
      request.headers["x-correlation-id"],
      dependencies.createCorrelationId ?? (() => crypto.randomUUID())
    )
    const startedAt = now()
    let finished = false
    response.setHeader("x-correlation-id", id)

    const finish = (httpStatus: number, outcomeCode: string) => {
      if (finished) return
      finished = true
      telemetry.emit({
        event: "assistant_request",
        operation: "respond",
        correlationId: id,
        durationMs: now() - startedAt,
        httpStatus,
        outcomeCode
      })
    }
    const sendError = (status: number, error: string) => {
      response.status(status).json({ error })
      finish(status, error)
    }

    if (!preflight(request, response)) {
      finish(response.statusCode || 400, "INVALID_ASSISTANT_REQUEST")
      return
    }

    const accessToken = parseBearerToken(request.headers.authorization)
    if (accessToken === null) {
      sendError(401, "UNAUTHORIZED")
      return
    }

    let identity: Awaited<ReturnType<ServerAuthVerifier["verify"]>>
    try {
      identity = await dependencies.auth.verify(accessToken)
    } catch {
      sendError(503, "ASSISTANT_UNAVAILABLE")
      return
    }
    if (identity === null) {
      sendError(401, "UNAUTHORIZED")
      return
    }

    const input = command(request.body)
    if (input === null) {
      sendError(400, "INVALID_ASSISTANT_REQUEST")
      return
    }

    let loaded: Awaited<ReturnType<AssistantContextRepository["loadCurrent"]>>
    try {
      loaded = await dependencies.contextRepository.loadCurrent({
        actorUserId: identity.userId,
        planId: input.planId
      })
    } catch {
      sendError(503, "ASSISTANT_UNAVAILABLE")
      return
    }
    if (!loaded.ok) {
      if (loaded.error === "UNAUTHORIZED") sendError(403, "UNAUTHORIZED")
      else sendError(503, "ASSISTANT_UNAVAILABLE")
      return
    }
    if (loaded.value.currentRevisionId !== input.expectedRevisionId) {
      sendError(409, "STALE_ASSISTANT_CONTEXT")
      return
    }
    if (dependencies.assistant === null) {
      sendError(503, "ASSISTANT_DISABLED")
      return
    }

    try {
      const result = await dependencies.assistant.respond({
        question: input.question,
        evidence: loaded.value.evidence
      })
      if (!result.ok) {
        sendError(503, "ASSISTANT_UNAVAILABLE")
        return
      }
      response.status(200).json(result.value)
      finish(200, result.value.kind)
    } catch {
      sendError(503, "ASSISTANT_UNAVAILABLE")
    }
  }
}
