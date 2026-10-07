import type { MemberMealPortion } from "@/domain/portion/calculate-member-meal-portions"
import type { RecipeHeatLevel } from "@/domain/recipe/recipe"
import type { PlanTrustView } from "@/application/planner/plan-trust"

export interface PlanIngredientView {
  readonly actualQuantity?: {
    readonly version: "food-quantity-v1"
    readonly sourceQuantity: string
    readonly unitCode: string
    readonly sourceDimension: "mass" | "volume" | "count"
  }
  readonly sourceId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly baseQuantity: string
  readonly grossGrams: string
}

export interface PlanRecipeIngredientView {
  readonly recipeIngredientId: string
  readonly foodId: string
}

export interface PlanStepView {
  readonly order: number
  readonly instructionVi: string
  readonly timerMinutes: number | null
  readonly heatLevel: RecipeHeatLevel | null
  readonly temperatureCelsius: number | null
  readonly ingredientIds: readonly string[]
}

export interface PlanItemView {
  readonly memberPortions?: readonly (MemberMealPortion & { readonly actualMealKcal: string })[]
  readonly plannedMealSharePercent?: number | null
  readonly dayIndex: number
  readonly mealSlot: "primary"
  readonly mealOptionId: string
  readonly mealOptionVersionId: string
  readonly adultEquivalent: string
  readonly scaleFactor: string
  readonly mealOptionCode: string
  readonly mealOptionNameVi: string
  readonly elapsedMinutes: number
  readonly components: readonly {
    /** Exact source identity used by scaled ingredient lineage. Older rollout payloads may omit it. */
    readonly mealOptionRecipeId?: string
    readonly mealRole: string
    readonly sortOrder: number
    readonly recipe: {
      readonly recipeId: string
      readonly recipeVersionId: string
      readonly ingredients: readonly PlanRecipeIngredientView[]
      readonly steps: readonly PlanStepView[]
    }
  }[]
  readonly scaledIngredients: readonly PlanIngredientView[]
  readonly nutrition: {
    readonly nutrients: readonly {
      readonly nutrientCode: string
      readonly displayAmount: string
      readonly unitCode: string
    }[]
  }
}

export interface PlannerReadyResponse {
  readonly engineVersion?: "planner-engine-v6"
  readonly planId: string
  readonly revisionId: string
  readonly planVersion: number
  readonly householdSetupVersion?: number
  readonly idempotent: boolean
  readonly status: "ready_within_budget" | "ready_over_budget"
  readonly budgetVnd: number
  readonly costDeltaVnd?: number
  readonly plan: {
    readonly items: readonly PlanItemView[]
    readonly totalEstimatedCostVnd: number
  }
  readonly warnings: readonly { readonly code: string; readonly [key: string]: unknown }[]
  readonly trust?: PlanTrustView
}

export interface PlannerPreviewResponse {
  readonly engineVersion?: "planner-engine-v6"
  readonly status: "ready_within_budget" | "ready_over_budget"
  readonly items: readonly PlanItemView[]
  readonly weeklyEstimatedCostVnd: number
  readonly costDeltaVnd: number
  readonly warnings: readonly { readonly code: string; readonly [key: string]: unknown }[]
  readonly previewFingerprint: string
  readonly trust?: PlanTrustView
}

export type PlannerApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string; readonly correlationId?: string }

export interface PlannerApi {
  readonly generate: (
    accessToken: string,
    input: {
      readonly householdId: string
      readonly weekStart: string
      readonly idempotencyKey: string
      /** Both together, and only when replacing a plan the week already has. */
      readonly expectedPlanVersion?: number
      readonly expectedCurrentRevisionId?: string
    }
  ) => Promise<PlannerApiResult<PlannerReadyResponse>>
  /** Resolves to `null` when the week has no plan yet — an answer, not a failure. */
  readonly current: (
    accessToken: string,
    input: { readonly householdId: string; readonly weekStart: string }
  ) => Promise<PlannerApiResult<PlannerReadyResponse | null>>
  readonly preview: (
    accessToken: string,
    input: {
      readonly planId: string
      readonly targetDayIndex: number
      readonly expectedPlanVersion: number
    }
  ) => Promise<PlannerApiResult<PlannerPreviewResponse>>
  readonly apply: (
    accessToken: string,
    input: {
      readonly planId: string
      readonly targetDayIndex: number
      readonly expectedPlanVersion: number
      readonly expectedCurrentRevisionId: string
      readonly previewCalculationFingerprint: string
      readonly idempotencyKey: string
    }
  ) => Promise<PlannerApiResult<PlannerReadyResponse>>
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

function isTrust(value: unknown): value is PlanTrustView {
  return (
    isRecord(value) &&
    typeof value.calculationDate === "string" &&
    (typeof value.adultEquivalent === "string" || value.adultEquivalent === null) &&
    (typeof value.priceObservedFrom === "string" || value.priceObservedFrom === null) &&
    (typeof value.priceObservedTo === "string" || value.priceObservedTo === null) &&
    typeof value.stalePriceCount === "number" &&
    Number.isSafeInteger(value.stalePriceCount) &&
    value.stalePriceCount >= 0 &&
    isRecord(value.coverage) &&
    value.coverage.serving === "complete" &&
    value.coverage.nutrition === "complete" &&
    value.coverage.cost === "complete" &&
    value.coverage.hardConstraints === "complete" &&
    Array.isArray(value.explanationCodes) &&
    value.explanationCodes.every((code) => typeof code === "string")
  )
}

export function safePlannerCorrelationId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_CORRELATION_ID.test(value) ? value : undefined
}

function responseCorrelationId(response: FetchResponse): string | undefined {
  try {
    return safePlannerCorrelationId(response.headers?.get("x-correlation-id"))
  } catch {
    return undefined
  }
}

function failure(error: string, response?: FetchResponse): PlannerApiResult<never> {
  const correlationId = response === undefined ? undefined : responseCorrelationId(response)
  return correlationId === undefined ? { ok: false, error } : { ok: false, error, correlationId }
}

const PRIVATE_PROFILE_KEYS = new Set([
  "heightCm",
  "weightKg",
  "ageYears",
  "sexForEquation",
  "activityLevel",
  "bmi",
  "bmrKcal",
  "tdeeKcal",
  "nutritionSetup",
  "memberProfiles",
  "inputBinding",
  "catalogBinding",
  "privatePlanBinding",
  "inputSnapshot",
  "calculationSnapshot"
])
function containsBodyProfile(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBodyProfile)
  return (
    isRecord(value) &&
    Object.entries(value).some(([k, v]) => PRIVATE_PROFILE_KEYS.has(k) || containsBodyProfile(v))
  )
}
const decimalText = (v: unknown) =>
  typeof v === "string" && /^(0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(v)
function validVersionedItems(value: Record<string, unknown>, items: unknown): boolean {
  if (value.engineVersion === undefined) return true
  if (
    value.engineVersion !== "planner-engine-v6" ||
    containsBodyProfile(value) ||
    !Array.isArray(items) ||
    items.length !== 7
  )
    return false
  return items.every(
    (i) =>
      isRecord(i) &&
      (i.plannedMealSharePercent === null ||
        (typeof i.plannedMealSharePercent === "number" &&
          Number.isInteger(i.plannedMealSharePercent) &&
          i.plannedMealSharePercent >= 20 &&
          i.plannedMealSharePercent <= 50)) &&
      Array.isArray(i.memberPortions) &&
      i.memberPortions.length > 0 &&
      i.memberPortions.every(
        (p) =>
          isRecord(p) &&
          typeof p.recipientKey === "string" &&
          ["adult", "elderly", "child"].includes(String(p.memberKind)) &&
          typeof p.memberCount === "number" &&
          Number.isInteger(p.memberCount) &&
          p.memberCount >= 1 &&
          decimalText(p.sharePerMember) &&
          Number(p.sharePerMember) > 0 &&
          Number(p.sharePerMember) <= 1 &&
          decimalText(p.actualMealKcal) &&
          ["applied", "unapplied"].includes(String(p.energyTargetStatus)) &&
          (p.energyTargetStatus === "applied"
            ? decimalText(p.mealTargetKcal) && Number(p.mealTargetKcal) > 0
            : p.mealTargetKcal === null)
      ) &&
      Array.isArray(i.scaledIngredients) &&
      i.scaledIngredients.every(
        (g) =>
          isRecord(g) &&
          isRecord(g.actualQuantity) &&
          g.actualQuantity.version === "food-quantity-v1" &&
          decimalText(g.baseQuantity) &&
          decimalText(g.actualQuantity.sourceQuantity) &&
          typeof g.actualQuantity.unitCode === "string" &&
          ["count", "mass", "volume"].includes(String(g.actualQuantity.sourceDimension))
      )
  )
}
function isReady(value: unknown): value is PlannerReadyResponse {
  return (
    isRecord(value) &&
    (value.status === "ready_within_budget" || value.status === "ready_over_budget") &&
    typeof value.planId === "string" &&
    typeof value.revisionId === "string" &&
    typeof value.planVersion === "number" &&
    (value.householdSetupVersion === undefined ||
      (typeof value.householdSetupVersion === "number" &&
        Number.isSafeInteger(value.householdSetupVersion) &&
        value.householdSetupVersion > 0)) &&
    typeof value.budgetVnd === "number" &&
    isRecord(value.plan) &&
    Array.isArray(value.plan.items) &&
    validVersionedItems(value, value.plan.items) &&
    typeof value.plan.totalEstimatedCostVnd === "number" &&
    Array.isArray(value.warnings) &&
    (value.trust === undefined || isTrust(value.trust))
  )
}

/**
 * A week nobody has generated yet comes back as `{ plan: null }`, not as a bare `null`: the route
 * needs a 200 with a body, because a 404 would read as an error. Callers want the absence, not the
 * envelope, so the envelope is unwrapped here rather than at every call site.
 */
function isEmptyWeek(value: unknown): boolean {
  return isRecord(value) && value.plan === null
}

function isCurrent(value: unknown): value is PlannerReadyResponse {
  return isReady(value)
}

function isPreview(value: unknown): value is PlannerPreviewResponse {
  return (
    isRecord(value) &&
    (value.status === "ready_within_budget" || value.status === "ready_over_budget") &&
    Array.isArray(value.items) &&
    validVersionedItems(value, value.items) &&
    typeof value.weeklyEstimatedCostVnd === "number" &&
    typeof value.costDeltaVnd === "number" &&
    typeof value.previewFingerprint === "string" &&
    Array.isArray(value.warnings) &&
    (value.trust === undefined || isTrust(value.trust))
  )
}

export function createPlannerApi(fetcher: Fetcher = fetch): PlannerApi {
  const currentPlanCache = new Map<
    string,
    { readonly value: PlannerReadyResponse | null; readonly expiresAt: number }
  >()

  async function post<T>(
    url: string,
    accessToken: string,
    body: unknown,
    validate: (value: unknown) => value is T
  ): Promise<PlannerApiResult<T>> {
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const payload = await response.json()
      if (!response.ok) {
        return failure(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "PLANNER_UNAVAILABLE",
          response
        )
      }
      return validate(payload)
        ? { ok: true, value: payload }
        : failure("PLANNER_UNAVAILABLE", response)
    } catch {
      return failure("PLANNER_UNAVAILABLE")
    }
  }

  async function get<T>(
    url: string,
    accessToken: string,
    validate: (value: unknown) => value is T
  ): Promise<PlannerApiResult<T>> {
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const payload = await response.json()
      if (!response.ok) {
        return failure(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "PLANNER_UNAVAILABLE",
          response
        )
      }
      return validate(payload)
        ? { ok: true, value: payload }
        : failure("PLANNER_UNAVAILABLE", response)
    } catch {
      return failure("PLANNER_UNAVAILABLE")
    }
  }

  return {
    generate: async (token, input) => {
      currentPlanCache.clear()
      const result = await post("/api/plans/generate", token, input, isReady)
      if (result.ok) {
        currentPlanCache.set(`${input.householdId}:${input.weekStart}`, {
          value: result.value,
          expiresAt: Date.now() + 30_000
        })
      }
      return result
    },
    current: async (token, input) => {
      const cacheKey = `${input.householdId}:${input.weekStart}`
      const cached = currentPlanCache.get(cacheKey)
      if (cached !== undefined && cached.expiresAt > Date.now()) {
        return { ok: true, value: cached.value }
      }

      const result = await get<PlannerReadyResponse | null>(
        `/api/plans/current?householdId=${encodeURIComponent(input.householdId)}&weekStart=${encodeURIComponent(input.weekStart)}`,
        token,
        (value): value is PlannerReadyResponse | null => isEmptyWeek(value) || isCurrent(value)
      )
      if (result.ok) {
        const value = isEmptyWeek(result.value) ? null : result.value
        currentPlanCache.set(cacheKey, { value, expiresAt: Date.now() + 30_000 })
        return { ok: true, value }
      }
      return result
    },
    preview: (token, input) => post("/api/plans/replacements-preview", token, input, isPreview),
    apply: async (token, input) => {
      currentPlanCache.clear()
      return post("/api/plans/replacements-apply", token, input, isReady)
    }
  }
}
