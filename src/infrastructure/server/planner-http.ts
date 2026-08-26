import type { VercelRequest, VercelResponse } from "@vercel/node"

import {
  applyMealReplacement,
  generateMealPlan,
  previewMealReplacementUseCase,
  type PlannerRepository
} from "@/application/planner/planner-use-cases"
import type { ContentHasher } from "@/application/shared/content-hasher"
import { parseBearerToken, type ServerAuthVerifier } from "@/infrastructure/supabase/server-auth"

type UnknownRecord = Record<string, unknown>

interface PlannerOperations {
  readonly generate: typeof generateMealPlan
  readonly preview: typeof previewMealReplacementUseCase
  readonly apply: typeof applyMealReplacement
}

interface PlannerHttpDependencies {
  readonly auth: ServerAuthVerifier
  readonly repositoryFor: (actorUserId: string, accessToken: string) => PlannerRepository
  readonly hasher: ContentHasher
  readonly operations?: PlannerOperations
  readonly calculationDate?: () => string
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu
const DATE = /^\d{4}-\d{2}-\d{2}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const MAX_BODY_BYTES = 64_000

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: UnknownRecord, allowed: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
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
  if (!isRecord(body) || !exactKeys(body, ["householdId", "weekStart", "idempotencyKey"]))
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
  return {
    householdId: body.householdId,
    weekStart: body.weekStart,
    idempotencyKey: body.idempotencyKey
  }
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

function safeSuccess(value: unknown, kind: "generate" | "preview" | "apply") {
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

async function identity(
  request: VercelRequest,
  response: VercelResponse,
  auth: ServerAuthVerifier
) {
  const token = parseBearerToken(request.headers.authorization)
  if (token === null) {
    response.status(401).json({ error: "UNAUTHORIZED" })
    return null
  }
  try {
    const verified = await auth.verify(token)
    if (verified === null) {
      response.status(401).json({ error: "UNAUTHORIZED" })
      return null
    }
    return { ...verified, accessToken: token }
  } catch {
    response.status(503).json({ error: "AUTH_UNAVAILABLE" })
    return null
  }
}

function preflight(request: VercelRequest, response: VercelResponse): boolean {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
    return false
  }
  if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
    response.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE" })
    return false
  }
  if (bodyIsTooLarge(request.body)) {
    response.status(413).json({ error: "PAYLOAD_TOO_LARGE" })
    return false
  }
  return true
}

function sendResult(
  response: VercelResponse,
  result: Awaited<ReturnType<typeof generateMealPlan>>,
  kind: "generate" | "preview" | "apply"
) {
  if (!result.ok) {
    response.status(failureStatus(result.error.code)).json({ error: result.error.code })
    return
  }
  response.status(200).json(safeSuccess(result.value, kind))
}

export function createPlannerHttpHandlers(dependencies: PlannerHttpDependencies) {
  const operations = dependencies.operations ?? {
    generate: generateMealPlan,
    preview: previewMealReplacementUseCase,
    apply: applyMealReplacement
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
      if (!preflight(request, response)) return
      const actor = await identity(request, response, dependencies.auth)
      if (actor === null) return
      const command = generationCommand(request.body)
      if (command === null) return void response.status(400).json({ error: "VALIDATION_FAILED" })
      try {
        const result = await operations.generate(
          dependencies.repositoryFor(actor.userId, actor.accessToken),
          dependencies.hasher,
          { actorUserId: actor.userId, calculationDate: calculationDate(), ...command }
        )
        sendResult(response, result, "generate")
      } catch {
        response.status(503).json({ error: "PLANNER_UNAVAILABLE" })
      }
    },
    async preview(request: VercelRequest, response: VercelResponse) {
      if (!preflight(request, response)) return
      const actor = await identity(request, response, dependencies.auth)
      if (actor === null) return
      const command = replacementCommand(request.body, false)
      if (command === null) return void response.status(400).json({ error: "VALIDATION_FAILED" })
      try {
        const result = await operations.preview(
          dependencies.repositoryFor(actor.userId, actor.accessToken),
          dependencies.hasher,
          { actorUserId: actor.userId, ...command }
        )
        sendResult(response, result as Awaited<ReturnType<typeof generateMealPlan>>, "preview")
      } catch {
        response.status(503).json({ error: "PLANNER_UNAVAILABLE" })
      }
    },
    async apply(request: VercelRequest, response: VercelResponse) {
      if (!preflight(request, response)) return
      const actor = await identity(request, response, dependencies.auth)
      if (actor === null) return
      const command = replacementCommand(request.body, true)
      if (command === null) return void response.status(400).json({ error: "VALIDATION_FAILED" })
      if (
        typeof command.previewFingerprint !== "string" ||
        typeof command.idempotencyKey !== "string"
      ) {
        return void response.status(400).json({ error: "VALIDATION_FAILED" })
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
        sendResult(response, result as Awaited<ReturnType<typeof generateMealPlan>>, "apply")
      } catch {
        response.status(503).json({ error: "PLANNER_UNAVAILABLE" })
      }
    }
  }
}
