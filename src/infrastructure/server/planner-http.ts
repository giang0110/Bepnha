import type { VercelRequest, VercelResponse } from "@vercel/node"

import {
  applyMealReplacement,
  generateMealPlan,
  loadCurrentPlan,
  previewMealReplacementUseCase,
  type PlannerRepository
} from "../../application/planner/planner-use-cases.js"
import type { ContentHasher } from "../../application/shared/content-hasher.js"
import type { RateLimiter } from "../../application/shared/rate-limiter.js"
import { correlationId, type OperationalTelemetry } from "./operational-telemetry.js"
import { defaultOperationalTelemetry } from "./webhook-alert-telemetry.js"
import { applyApiSecurityHeaders } from "./security-headers.js"
import { parseBearerToken, type ServerAuthVerifier } from "../supabase/server-auth.js"

type UnknownRecord = Record<string, unknown>
type PlannerOperation = "generate" | "preview" | "apply" | "current"

interface PlannerOperations {
  readonly generate: typeof generateMealPlan
  readonly preview: typeof previewMealReplacementUseCase
  readonly apply: typeof applyMealReplacement
  readonly current: typeof loadCurrentPlan
}

interface PlannerHttpDependencies {
  readonly auth: ServerAuthVerifier
  readonly repositoryFor: (actorUserId: string, accessToken: string) => PlannerRepository
  readonly hasher: ContentHasher
  readonly operations?: PlannerOperations
  readonly calculationDate?: () => string
  readonly telemetry?: OperationalTelemetry
  readonly createCorrelationId?: () => string
  readonly now?: () => number
  /**
   * Abuse protection for the most expensive authenticated endpoints. Optional: when it is absent the
   * handlers behave exactly as before, which keeps local and preview runtimes dependency-free.
   */
  readonly rateLimiter?: RateLimiter
  readonly rateLimitNow?: () => number
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu
const DATE = /^\d{4}-\d{2}-\d{2}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const MAX_BODY_BYTES = 64_000

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[]
): boolean {
  const keys = Object.keys(value)
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => [...required, ...optional].includes(key))
  )
}

function generationCommand(body: unknown) {
  if (
    !isRecord(body) ||
    !optionalExactKeys(
      body,
      ["householdId", "weekStart", "idempotencyKey"],
      ["expectedPlanVersion", "expectedCurrentRevisionId"]
    )
  )
    return null
  if (
    typeof body.householdId !== "string" ||
    !UUID.test(body.householdId) ||
    typeof body.weekStart !== "string" ||
    !DATE.test(body.weekStart) ||
    typeof body.idempotencyKey !== "string" ||
    !UUID.test(body.idempotencyKey)
  )
    return null

  const base = {
    householdId: body.householdId,
    weekStart: body.weekStart,
    idempotencyKey: body.idempotencyKey
  }
  // Both or neither: a version without the revision it belongs to would let a regeneration through
  // on a weaker check than the one persistence performs for a replacement.
  const hasVersion = body.expectedPlanVersion !== undefined
  const hasRevision = body.expectedCurrentRevisionId !== undefined
  if (!hasVersion && !hasRevision) return base
  if (
    !hasVersion ||
    !hasRevision ||
    typeof body.expectedPlanVersion !== "number" ||
    !Number.isSafeInteger(body.expectedPlanVersion) ||
    body.expectedPlanVersion < 1 ||
    typeof body.expectedCurrentRevisionId !== "string" ||
    !UUID.test(body.expectedCurrentRevisionId)
  )
    return null
  return {
    ...base,
    regenerate: {
      expectedPlanVersion: body.expectedPlanVersion,
      expectedCurrentRevisionId: body.expectedCurrentRevisionId
    }
  }
}

/** `householdId` and `weekStart` arrive in the query string, because reading is a GET. */
function currentPlanQuery(query: unknown) {
  if (!isRecord(query)) return null
  const householdId = query.householdId
  const weekStart = query.weekStart
  if (
    typeof householdId !== "string" ||
    !UUID.test(householdId) ||
    typeof weekStart !== "string" ||
    !DATE.test(weekStart)
  )
    return null
  return { householdId, weekStart }
}

function replacementCommand(body: unknown, apply: boolean) {
  const required = apply
    ? [
        "planId",
        "targetDayIndex",
        "expectedPlanVersion",
        "expectedCurrentRevisionId",
        "previewCalculationFingerprint",
        "idempotencyKey"
      ]
    : ["planId", "targetDayIndex", "expectedPlanVersion"]
  if (!isRecord(body) || !optionalExactKeys(body, required, [])) return null
  if (
    typeof body.planId !== "string" ||
    !UUID.test(body.planId) ||
    typeof body.targetDayIndex !== "number" ||
    !Number.isSafeInteger(body.targetDayIndex) ||
    body.targetDayIndex < 0 ||
    body.targetDayIndex > 6 ||
    typeof body.expectedPlanVersion !== "number" ||
    !Number.isSafeInteger(body.expectedPlanVersion) ||
    body.expectedPlanVersion < 1 ||
    (apply &&
      (typeof body.expectedCurrentRevisionId !== "string" ||
        !UUID.test(body.expectedCurrentRevisionId)))
  )
    return null
  if (
    apply &&
    (typeof body.previewCalculationFingerprint !== "string" ||
      !SHA256.test(body.previewCalculationFingerprint) ||
      typeof body.idempotencyKey !== "string" ||
      !UUID.test(body.idempotencyKey))
  )
    return null
  return {
    planId: body.planId,
    targetDayIndex: body.targetDayIndex,
    expectedPlanVersion: body.expectedPlanVersion,
    ...(apply
      ? {
          expectedCurrentRevisionId: body.expectedCurrentRevisionId as string,
          previewFingerprint: body.previewCalculationFingerprint as string,
          idempotencyKey: body.idempotencyKey as string
        }
      : {})
  }
}

function bodyIsTooLarge(body: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(body) ?? "", "utf8") > MAX_BODY_BYTES
  } catch {
    return true
  }
}

function publicItems(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    if (!isRecord(raw)) return {}
    const snapshot = isRecord(raw.snapshot) ? raw.snapshot : {}
    const mealOption = isRecord(snapshot.mealOption) ? snapshot.mealOption : {}
    return {
      dayIndex: raw.dayIndex,
      mealSlot: raw.mealSlot,
      mealOptionId: raw.mealOptionId,
      mealOptionVersionId: raw.mealOptionVersionId,
      adultEquivalent: raw.adultEquivalent,
      scaleFactor: raw.scaleFactor,
      mealOptionCode: snapshot.mealOptionCode,
      mealOptionNameVi: snapshot.mealOptionNameVi,
      elapsedMinutes: snapshot.elapsedMinutes,
      components: mealOption.components,
      scaledIngredients: snapshot.scaledIngredients,
      nutrition: snapshot.nutrition
    }
  })
}

function publicPlan(value: unknown): UnknownRecord {
  if (!isRecord(value)) return { items: [] }
  return {
    items: publicItems(value.items),
    totalEstimatedCostVnd: value.totalEstimatedCostVnd
  }
}

function safeSuccess(value: unknown, kind: PlannerOperation) {
  const result = isRecord(value) ? value : {}
  if (kind === "preview") {
    return {
      status: result.status,
      items: publicItems(result.items),
      weeklyEstimatedCostVnd: result.weeklyEstimatedCostVnd,
      costDeltaVnd: result.weeklyCostDeltaVnd,
      warnings: result.warnings,
      previewFingerprint: result.previewFingerprint
    }
  }
  return {
    planId: result.planId,
    revisionId: result.revisionId,
    planVersion: result.planVersion,
    idempotent: result.idempotent,
    status: result.status,
    budgetVnd: result.budgetVnd,
    costDeltaVnd: result.costDeltaVnd,
    plan: publicPlan(result.plan),
    warnings: result.warnings,
    ...(kind === "generate"
      ? {
          catalogFingerprint: result.catalogFingerprint,
          inputFingerprint: result.inputFingerprint,
          calculationFingerprint: result.calculationFingerprint
        }
      : {})
  }
}

function failureStatus(code: string): number {
  if (code === "UNAUTHORIZED") return 403
  if (code === "STALE_PLAN_VERSION" || code === "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED")
    return 409
  if (code === "TRANSIENT_DEPENDENCY_FAILURE") return 503
  return 422
}

function successOutcome(value: unknown): string {
  return isRecord(value) && typeof value.status === "string" ? value.status : "OK"
}

function operationalContext(
  request: VercelRequest,
  response: VercelResponse,
  operation: PlannerOperation,
  dependencies: PlannerHttpDependencies
) {
  applyApiSecurityHeaders(response)
  const now = dependencies.now ?? (() => performance.now())
  const telemetry = dependencies.telemetry ?? defaultOperationalTelemetry()
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
      event: "planner_request",
      operation,
      correlationId: id,
      durationMs: now() - startedAt,
      httpStatus,
      outcomeCode
    })
  }
  return { finish }
}

async function identity(
  request: VercelRequest,
  response: VercelResponse,
  auth: ServerAuthVerifier,
  finish: (httpStatus: number, outcomeCode: string) => void
) {
  const token = parseBearerToken(request.headers.authorization)
  if (token === null) {
    response.status(401).json({ error: "UNAUTHORIZED" })
    finish(401, "UNAUTHORIZED")
    return null
  }
  try {
    const verified = await auth.verify(token)
    if (verified === null) {
      response.status(401).json({ error: "UNAUTHORIZED" })
      finish(401, "UNAUTHORIZED")
      return null
    }
    return { ...verified, accessToken: token }
  } catch {
    response.status(503).json({ error: "AUTH_UNAVAILABLE" })
    finish(503, "AUTH_UNAVAILABLE")
    return null
  }
}

function preflight(
  request: VercelRequest,
  response: VercelResponse,
  finish: (httpStatus: number, outcomeCode: string) => void
): boolean {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
    finish(405, "METHOD_NOT_ALLOWED")
    return false
  }
  if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
    response.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE" })
    finish(415, "UNSUPPORTED_MEDIA_TYPE")
    return false
  }
  if (bodyIsTooLarge(request.body)) {
    response.status(413).json({ error: "PAYLOAD_TOO_LARGE" })
    finish(413, "PAYLOAD_TOO_LARGE")
    return false
  }
  return true
}

async function withinRateLimit(
  response: VercelResponse,
  actorUserId: string,
  dependencies: PlannerHttpDependencies,
  finish: (httpStatus: number, outcomeCode: string) => void
): Promise<boolean> {
  const limiter = dependencies.rateLimiter
  if (limiter === undefined) return true
  // Quota is consumed only after the caller is authenticated, so an anonymous or forged request can
  // never spend a real user's allowance.
  let decision: Awaited<ReturnType<RateLimiter["consume"]>>
  try {
    decision = await limiter.consume({
      actorUserId,
      nowMs: (dependencies.rateLimitNow ?? Date.now)()
    })
  } catch {
    // The adapter owns its own failure policy; a limiter that throws must never take the planner
    // down, so abuse protection degrades rather than the feature.
    return true
  }
  if (decision.allowed) return true
  if (decision.retryAfterSeconds !== undefined) {
    response.setHeader("Retry-After", String(decision.retryAfterSeconds))
  }
  response.status(429).json({ error: "PLANNER_RATE_LIMITED" })
  finish(429, "PLANNER_RATE_LIMITED")
  return false
}

function sendResult(
  response: VercelResponse,
  result: Awaited<ReturnType<typeof generateMealPlan>>,
  kind: PlannerOperation,
  finish: (httpStatus: number, outcomeCode: string) => void
) {
  if (!result.ok) {
    const status = failureStatus(result.error.code)
    response.status(status).json({ error: result.error.code })
    finish(status, result.error.code)
    return
  }
  response.status(200).json(safeSuccess(result.value, kind))
  finish(200, successOutcome(result.value))
}

export function createPlannerHttpHandlers(dependencies: PlannerHttpDependencies) {
  const operations = dependencies.operations ?? {
    generate: generateMealPlan,
    preview: previewMealReplacementUseCase,
    apply: applyMealReplacement,
    current: loadCurrentPlan
  }
  const calculationDate =
    dependencies.calculationDate ??
    (() => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date())
      const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
      return `${value.year}-${value.month}-${value.day}`
    })
  return {
    async generate(request: VercelRequest, response: VercelResponse) {
      const operational = operationalContext(request, response, "generate", dependencies)
      if (!preflight(request, response, operational.finish)) return
      const actor = await identity(request, response, dependencies.auth, operational.finish)
      if (actor === null) return
      if (!(await withinRateLimit(response, actor.userId, dependencies, operational.finish))) return
      const command = generationCommand(request.body)
      if (command === null) {
        response.status(400).json({ error: "VALIDATION_FAILED" })
        operational.finish(400, "VALIDATION_FAILED")
        return
      }
      try {
        const result = await operations.generate(
          dependencies.repositoryFor(actor.userId, actor.accessToken),
          dependencies.hasher,
          { actorUserId: actor.userId, calculationDate: calculationDate(), ...command }
        )
        sendResult(response, result, "generate", operational.finish)
      } catch {
        response.status(503).json({ error: "PLANNER_UNAVAILABLE" })
        operational.finish(503, "PLANNER_UNAVAILABLE")
      }
    },
    /**
     * Serves the week's existing plan, so a reload is not the same as losing it.
     *
     * Read-only and cheap compared with generation — it hands back a stored revision rather than
     * searching the catalog — so it is a GET and is not rate limited alongside the endpoints that
     * do the expensive work.
     */
    async current(request: VercelRequest, response: VercelResponse) {
      const operational = operationalContext(request, response, "current", dependencies)
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET")
        response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
        operational.finish(405, "METHOD_NOT_ALLOWED")
        return
      }
      const actor = await identity(request, response, dependencies.auth, operational.finish)
      if (actor === null) return
      const query = currentPlanQuery(request.query)
      if (query === null) {
        response.status(400).json({ error: "VALIDATION_FAILED" })
        operational.finish(400, "VALIDATION_FAILED")
        return
      }
      try {
        const result = await operations.current(
          dependencies.repositoryFor(actor.userId, actor.accessToken),
          { actorUserId: actor.userId, ...query }
        )
        if (!result.ok) {
          const status = failureStatus(result.error.code)
          response.status(status).json({ error: result.error.code })
          operational.finish(status, result.error.code)
          return
        }
        // A week with no plan is not an error and must not read as one: the page shows its generate
        // button on `plan: null`, and a 404 here would send it to the error branch instead.
        const body = result.value === null ? { plan: null } : safeSuccess(result.value, "current")
        response.status(200).json(body)
        operational.finish(200, result.value === null ? "NO_PLAN" : "OK")
      } catch {
        response.status(503).json({ error: "PLANNER_UNAVAILABLE" })
        operational.finish(503, "PLANNER_UNAVAILABLE")
      }
    },
    async preview(request: VercelRequest, response: VercelResponse) {
      const operational = operationalContext(request, response, "preview", dependencies)
      if (!preflight(request, response, operational.finish)) return
      const actor = await identity(request, response, dependencies.auth, operational.finish)
      if (actor === null) return
      if (!(await withinRateLimit(response, actor.userId, dependencies, operational.finish))) return
      const command = replacementCommand(request.body, false)
      if (command === null) {
        response.status(400).json({ error: "VALIDATION_FAILED" })
        operational.finish(400, "VALIDATION_FAILED")
        return
      }
      try {
        const result = await operations.preview(
          dependencies.repositoryFor(actor.userId, actor.accessToken),
          dependencies.hasher,
          { actorUserId: actor.userId, ...command }
        )
        sendResult(
          response,
          result as Awaited<ReturnType<typeof generateMealPlan>>,
          "preview",
          operational.finish
        )
      } catch {
        response.status(503).json({ error: "PLANNER_UNAVAILABLE" })
        operational.finish(503, "PLANNER_UNAVAILABLE")
      }
    },
    async apply(request: VercelRequest, response: VercelResponse) {
      const operational = operationalContext(request, response, "apply", dependencies)
      if (!preflight(request, response, operational.finish)) return
      const actor = await identity(request, response, dependencies.auth, operational.finish)
      if (actor === null) return
      if (!(await withinRateLimit(response, actor.userId, dependencies, operational.finish))) return
      const command = replacementCommand(request.body, true)
      if (command === null) {
        response.status(400).json({ error: "VALIDATION_FAILED" })
        operational.finish(400, "VALIDATION_FAILED")
        return
      }
      if (
        typeof command.previewFingerprint !== "string" ||
        typeof command.idempotencyKey !== "string"
      ) {
        response.status(400).json({ error: "VALIDATION_FAILED" })
        operational.finish(400, "VALIDATION_FAILED")
        return
      }
      try {
        const result = await operations.apply(
          dependencies.repositoryFor(actor.userId, actor.accessToken),
          dependencies.hasher,
          {
            actorUserId: actor.userId,
            ...command,
            previewFingerprint: command.previewFingerprint,
            idempotencyKey: command.idempotencyKey
          }
        )
        sendResult(
          response,
          result as Awaited<ReturnType<typeof generateMealPlan>>,
          "apply",
          operational.finish
        )
      } catch {
        response.status(503).json({ error: "PLANNER_UNAVAILABLE" })
        operational.finish(503, "PLANNER_UNAVAILABLE")
      }
    }
  }
}
