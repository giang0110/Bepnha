import type { ContentHasher } from "../shared/content-hasher.js"
import { evaluatePlannerEligibility } from "../../domain/planner/evaluate-eligibility.js"
import { PLANNER_ENGINE_VERSION } from "../../domain/planner/planner-engine-version.js"
import type { PlannerInputV1 } from "../../domain/planner/planner-input.js"
import type { PlannerFatalCode } from "../../domain/planner/planner-outcome.js"
import {
  buildPlannerSnapshotPayloads,
  type PlannerCandidateManifestEntry
} from "../../domain/planner/planner-snapshot.js"
import { normalizePlannerInput } from "../../domain/planner/normalize-planner-input.js"
import { previewMealReplacement } from "../../domain/planner/replace-meal.js"
import { searchWeek, type ReadyPlan } from "../../domain/planner/search-week.js"
import type { CanonicalFoodDeduction } from "../../domain/pricing/pricing.js"
import { canonicalJson, canonicalUtf8 } from "../../domain/shared/canonical-json.js"
import { buildShoppingListSnapshot } from "../../domain/shopping/build-shopping-list-snapshot.js"
import type { ShoppingListSnapshotV1 } from "../../domain/shopping/shopping-list.js"

type Failure = { readonly ok: false; readonly error: { readonly code: PlannerFatalCode } }

type RepositoryLoadResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: { readonly code: "UNAUTHORIZED" | "TRANSIENT_DEPENDENCY_FAILURE" }
    }

/**
 * A plan that already exists, in the shape the week view renders.
 *
 * Generation used to be the only way a plan reached the browser, so a reload lost it and pressing
 * generate again was refused — the week's plan became unreachable to the household that owns it.
 * This is what a returning visitor is served instead.
 */
export interface CurrentPlanView {
  readonly planId: string
  readonly revisionId: string
  readonly planVersion: number
  readonly status: "ready_within_budget" | "ready_over_budget"
  readonly budgetVnd: number
  readonly plan: ReadyPlan
  readonly warnings: readonly { readonly code: string; readonly [key: string]: unknown }[]
}

export interface ReplacementAuthoritativeInput {
  readonly input: PlannerInputV1
  readonly currentPlan: ReadyPlan
  readonly planVersion: number
  readonly currentRevisionId: string
  readonly householdSetupVersion: number
  readonly householdInputFingerprint: string
}

export interface PersistPlannerRevisionCommand {
  readonly actorUserId: string
  readonly householdId: string
  readonly weekStart: string
  readonly expectedPlanVersion: number
  readonly parentRevisionId: string | null
  readonly idempotencyKey: string
  readonly revisionKind: "generation" | "regeneration" | "replacement"
  readonly replacementDayIndex: number | null
  readonly householdSetupVersion: number
  readonly engineVersion: typeof PLANNER_ENGINE_VERSION
  readonly portionConfigVersion: "portion-v1"
  readonly priceFreshnessConfigVersion: "price-freshness-v1"
  readonly plannerConfigVersion: "planner-v1"
  readonly calculationDate: string
  readonly catalogFingerprint: string
  readonly inputFingerprint: string
  readonly calculationFingerprint: string
  readonly inputSnapshot: unknown
  readonly calculationSnapshot: {
    readonly purchaseBasket: ReadyPlan["purchaseBasket"]
    readonly shoppingList: ShoppingListSnapshotV1
    readonly [key: string]: unknown
  }
  readonly budgetVnd: number
  readonly totalEstimatedCostVnd: number
  readonly budgetStatus: "within" | "over"
  readonly overageVnd: number
  readonly warnings: readonly unknown[]
  readonly items: ReadyPlan["items"]
}

export interface PlannerRepository {
  readonly loadGenerationInput: (input: {
    readonly actorUserId: string
    readonly householdId: string
    readonly weekStart: string
    readonly calculationDate: string
  }) => Promise<RepositoryLoadResult<PlannerInputV1>>
  readonly loadReplacementInput: (input: {
    readonly actorUserId: string
    readonly planId: string
  }) => Promise<RepositoryLoadResult<ReplacementAuthoritativeInput>>
  /** `null` means the week has no plan yet, which is an answer rather than a failure. */
  readonly loadCurrentPlan: (input: {
    readonly actorUserId: string
    readonly householdId: string
    readonly weekStart: string
  }) => Promise<RepositoryLoadResult<CurrentPlanView | null>>
  readonly persistRevision: (input: PersistPlannerRevisionCommand) => Promise<
    | {
        readonly ok: true
        readonly value: {
          readonly planId: string
          readonly revisionId: string
          readonly planVersion: number
          readonly idempotent: boolean
        }
      }
    | {
        readonly ok: false
        readonly error: {
          readonly code: "STALE_PLAN_VERSION" | "UNAUTHORIZED" | "TRANSIENT_DEPENDENCY_FAILURE"
        }
      }
  >
}

function manifestFromInput(input: PlannerInputV1): readonly PlannerCandidateManifestEntry[] {
  return input.candidates.map((candidate) => ({
    mealOptionId: candidate.mealOption.mealOptionId,
    mealOptionVersionId: candidate.mealOption.mealOptionVersionId,
    mealOptionContentHash: candidate.mealOptionContentHash,
    recipeVersions: candidate.mealOption.components.map((component) => ({
      recipeVersionId: component.recipeVersionId,
      contentHash: component.recipeContentHash
    })),
    foodFacts: candidate.ingredientLineage.map((lineage) => ({
      foodFactVersionId: lineage.foodFactVersionId,
      contentHash: lineage.foodFactContentHash
    })),
    prices: candidate.prices.map((price) => ({
      priceBookId: price.priceBookId,
      foodPriceId: price.foodPriceId,
      fingerprint: canonicalJson({
        ...price,
        priceBookContentHash: candidate.priceBookContentHash
      })
    }))
  }))
}

function pantryDeductions(input: PlannerInputV1): readonly CanonicalFoodDeduction[] {
  return input.pantrySnapshot.items.map((item) => ({
    foodId: item.foodId,
    baseUnitId: item.baseUnitId,
    availableBaseQuantity: item.baseQuantity
  }))
}

async function sha256(hasher: ContentHasher, value: unknown): Promise<string> {
  return hasher.sha256(canonicalUtf8(value))
}

async function snapshots(
  hasher: ContentHasher,
  input: PlannerInputV1,
  plan: ReadyPlan,
  warnings: readonly unknown[],
  parent?: { readonly revisionId: string; readonly replacementDayIndex: number }
): Promise<
  | Failure
  | {
      readonly ok: true
      readonly value: {
        readonly catalogFingerprint: string
        readonly inputFingerprint: string
        readonly calculationFingerprint: string
        readonly inputSnapshot: unknown
        readonly calculationSnapshot: PersistPlannerRevisionCommand["calculationSnapshot"]
      }
    }
> {
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) return normalized
  const shopping = buildShoppingListSnapshot(normalized.value, plan)
  if (!shopping.ok) return fatal(shopping.error.code)
  const source = buildPlannerSnapshotPayloads({
    engineVersion: PLANNER_ENGINE_VERSION,
    household: {
      householdId: normalized.value.householdId,
      setupVersion: normalized.value.householdSetupVersion,
      memberGroups: normalized.value.memberGroups,
      hardRuleCodes: normalized.value.hardRuleCodes,
      // Recorded with the plan: without it a replay cannot tell why a meal whose lineage is only
      // `cross_contact_unverified` was offered.
      allergenStrictness: normalized.value.allergenStrictness,
      softPreferenceCodes: normalized.value.softPreferenceCodes,
      weeklyPlanBudgetVnd: normalized.value.weeklyPlanBudgetVnd,
      maxElapsedMinutes: normalized.value.maxElapsedMinutes
    },
    weekStart: normalized.value.weekStart,
    timezone: normalized.value.timezone,
    calculationDate: normalized.value.calculationDate,
    portionConfig: normalized.value.portionConfig,
    priceFreshnessConfig: normalized.value.priceFreshnessConfig,
    plannerConfig: normalized.value.plannerConfig,
    pantrySnapshot: normalized.value.pantrySnapshot,
    ...(normalized.value.recentMealOptionIds === undefined
      ? {}
      : { recentMealOptionIds: normalized.value.recentMealOptionIds }),
    candidateManifest: manifestFromInput(normalized.value),
    calculation: {
      items: plan.items,
      selectedMealOptions: plan.selected,
      purchaseBasket: plan.purchaseBasket,
      shoppingList: shopping.value,
      pantrySnapshot: normalized.value.pantrySnapshot,
      totalEstimatedCostVnd: plan.totalEstimatedCostVnd,
      score: plan.score,
      warnings,
      parent: parent ?? null
    }
  })
  const catalogFingerprint = await sha256(hasher, source.catalogPayload)
  const inputSnapshot = { ...source.inputPayload, catalogFingerprint }
  const inputFingerprint = await sha256(hasher, inputSnapshot)
  const calculationSnapshot: PersistPlannerRevisionCommand["calculationSnapshot"] = {
    ...(source.calculationPayload as Record<string, unknown>),
    purchaseBasket: plan.purchaseBasket,
    shoppingList: shopping.value,
    pantrySnapshot: normalized.value.pantrySnapshot,
    inputFingerprint
  }
  const calculationFingerprint = await sha256(hasher, calculationSnapshot)
  return {
    ok: true,
    value: {
      catalogFingerprint,
      inputFingerprint,
      calculationFingerprint,
      inputSnapshot,
      calculationSnapshot
    }
  }
}

function fatal(code: PlannerFatalCode): Failure {
  return { ok: false, error: { code } }
}

export async function loadCurrentPlan(
  repository: PlannerRepository,
  command: {
    readonly actorUserId: string
    readonly householdId: string
    readonly weekStart: string
  }
) {
  return repository.loadCurrentPlan(command)
}

export async function generateMealPlan(
  repository: PlannerRepository,
  hasher: ContentHasher,
  command: {
    readonly actorUserId: string
    readonly householdId: string
    readonly weekStart: string
    readonly calculationDate: string
    readonly idempotencyKey: string
    /**
     * Present when the week already has a plan and the household asked for a fresh one.
     *
     * Persistence refuses a `generation` for a week it already holds, which is what makes the first
     * plan immutable by accident rather than by decision. Naming the version and revision being
     * replaced turns that refusal into an ordinary concurrency check: a plan changed in another tab
     * still fails, a deliberate regeneration does not.
     */
    readonly regenerate?: {
      readonly expectedPlanVersion: number
      readonly expectedCurrentRevisionId: string
    }
  }
) {
  const loaded = await repository.loadGenerationInput({
    actorUserId: command.actorUserId,
    householdId: command.householdId,
    weekStart: command.weekStart,
    calculationDate: command.calculationDate
  })
  if (!loaded.ok) return loaded
  const normalized = normalizePlannerInput(loaded.value)
  if (!normalized.ok) return normalized
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) return eligibility
  const planned = searchWeek(
    eligibility.value.eligible,
    normalized.value.weeklyPlanBudgetVnd,
    normalized.value.softPreferenceCodes,
    normalized.value.calculationDate,
    normalized.value.priceFreshnessConfig,
    normalized.value.plannerConfig,
    pantryDeductions(normalized.value),
    normalized.value.recentMealOptionIds ?? []
  )
  if (!("plan" in planned)) return planned
  const evidenceResult = await snapshots(hasher, normalized.value, planned.plan, planned.warnings)
  if (!evidenceResult.ok) return evidenceResult
  const evidence = evidenceResult.value
  const budgetStatus = planned.status === "ready_within_budget" ? "within" : "over"
  const persisted = await repository.persistRevision({
    actorUserId: command.actorUserId,
    householdId: normalized.value.householdId,
    weekStart: normalized.value.weekStart,
    expectedPlanVersion: command.regenerate?.expectedPlanVersion ?? 0,
    parentRevisionId: command.regenerate?.expectedCurrentRevisionId ?? null,
    idempotencyKey: command.idempotencyKey,
    revisionKind: command.regenerate === undefined ? "generation" : "regeneration",
    replacementDayIndex: null,
    householdSetupVersion: normalized.value.householdSetupVersion,
    engineVersion: PLANNER_ENGINE_VERSION,
    portionConfigVersion: normalized.value.portionConfig.version,
    priceFreshnessConfigVersion: normalized.value.priceFreshnessConfig.version,
    plannerConfigVersion: normalized.value.plannerConfig.version,
    calculationDate: normalized.value.calculationDate,
    ...evidence,
    budgetVnd: normalized.value.weeklyPlanBudgetVnd,
    totalEstimatedCostVnd: planned.plan.totalEstimatedCostVnd,
    budgetStatus,
    overageVnd: Math.max(
      0,
      planned.plan.totalEstimatedCostVnd - normalized.value.weeklyPlanBudgetVnd
    ),
    warnings: planned.warnings,
    items: planned.plan.items
  })
  return persisted.ok
    ? {
        ok: true as const,
        value: {
          ...persisted.value,
          status: planned.status,
          budgetVnd: normalized.value.weeklyPlanBudgetVnd,
          plan: planned.plan,
          warnings: planned.warnings,
          ...evidence
        }
      }
    : persisted
}

export interface ReplacementCommand {
  readonly actorUserId: string
  readonly planId: string
  readonly targetDayIndex: number
  readonly expectedPlanVersion: number
  readonly expectedCurrentRevisionId?: string
  readonly expectedHouseholdSetupVersion?: number
}

async function replacementPreview(
  repository: PlannerRepository,
  hasher: ContentHasher,
  command: ReplacementCommand
) {
  const loaded = await repository.loadReplacementInput({
    actorUserId: command.actorUserId,
    planId: command.planId
  })
  if (!loaded.ok) return loaded
  if (
    loaded.value.planVersion !== command.expectedPlanVersion ||
    (command.expectedCurrentRevisionId !== undefined &&
      loaded.value.currentRevisionId !== command.expectedCurrentRevisionId)
  ) {
    return fatal("STALE_PLAN_VERSION")
  }
  if (
    loaded.value.input.householdSetupVersion !== loaded.value.householdSetupVersion ||
    (command.expectedHouseholdSetupVersion !== undefined &&
      command.expectedHouseholdSetupVersion !== loaded.value.householdSetupVersion)
  ) {
    return fatal("PLAN_INPUT_CHANGED_REGENERATION_REQUIRED")
  }
  const normalized = normalizePlannerInput(loaded.value.input)
  if (!normalized.ok) return normalized
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) return eligibility
  const preview = previewMealReplacement({
    current: loaded.value.currentPlan,
    targetDayIndex: command.targetDayIndex,
    candidates: eligibility.value.eligible,
    budgetVnd: normalized.value.weeklyPlanBudgetVnd,
    softPreferenceCodes: normalized.value.softPreferenceCodes,
    calculationDate: normalized.value.calculationDate,
    priceFreshnessConfig: normalized.value.priceFreshnessConfig,
    plannerConfig: normalized.value.plannerConfig,
    pantryDeductions: pantryDeductions(normalized.value),
    recentMealOptionIds: normalized.value.recentMealOptionIds ?? []
  })
  if (!preview.ok) return preview
  const plan: ReadyPlan = {
    items: preview.value.items,
    selected: preview.value.selected,
    purchaseBasket: preview.value.purchaseBasket,
    totalEstimatedCostVnd: preview.value.weeklyEstimatedCostVnd,
    score: preview.value.score,
    stableIdSequence: preview.value.items.map((item) => item.mealOptionVersionId).join("|"),
    frontierMetrics: []
  }
  const evidenceResult = await snapshots(hasher, normalized.value, plan, preview.value.warnings, {
    revisionId: loaded.value.currentRevisionId,
    replacementDayIndex: command.targetDayIndex
  })
  if (!evidenceResult.ok) return evidenceResult
  return {
    ok: true as const,
    value: {
      ...preview.value,
      plan,
      previewFingerprint: evidenceResult.value.calculationFingerprint,
      evidence: evidenceResult.value,
      authoritative: loaded.value,
      normalized: normalized.value
    }
  }
}

export function previewMealReplacementUseCase(
  repository: PlannerRepository,
  hasher: ContentHasher,
  command: ReplacementCommand
) {
  return replacementPreview(repository, hasher, command)
}

export async function applyMealReplacement(
  repository: PlannerRepository,
  hasher: ContentHasher,
  command: ReplacementCommand & {
    readonly previewFingerprint: string
    readonly idempotencyKey: string
  }
) {
  const preview = await replacementPreview(repository, hasher, command)
  if (!preview.ok) return preview
  if (preview.value.previewFingerprint !== command.previewFingerprint) {
    return fatal("STALE_PLAN_VERSION")
  }
  const { authoritative, normalized, evidence, plan } = preview.value
  const budgetStatus = preview.value.status === "ready_within_budget" ? "within" : "over"
  const persisted = await repository.persistRevision({
    actorUserId: command.actorUserId,
    householdId: normalized.householdId,
    weekStart: normalized.weekStart,
    expectedPlanVersion: command.expectedPlanVersion,
    parentRevisionId: authoritative.currentRevisionId,
    idempotencyKey: command.idempotencyKey,
    revisionKind: "replacement",
    replacementDayIndex: command.targetDayIndex,
    householdSetupVersion: normalized.householdSetupVersion,
    engineVersion: PLANNER_ENGINE_VERSION,
    portionConfigVersion: normalized.portionConfig.version,
    priceFreshnessConfigVersion: normalized.priceFreshnessConfig.version,
    plannerConfigVersion: normalized.plannerConfig.version,
    calculationDate: normalized.calculationDate,
    ...evidence,
    budgetVnd: normalized.weeklyPlanBudgetVnd,
    totalEstimatedCostVnd: plan.totalEstimatedCostVnd,
    budgetStatus,
    overageVnd: Math.max(0, plan.totalEstimatedCostVnd - normalized.weeklyPlanBudgetVnd),
    warnings: preview.value.warnings,
    items: plan.items
  })
  return persisted.ok
    ? {
        ok: true as const,
        value: {
          ...persisted.value,
          status: preview.value.status,
          budgetVnd: normalized.weeklyPlanBudgetVnd,
          costDeltaVnd: preview.value.weeklyCostDeltaVnd,
          plan,
          warnings: preview.value.warnings
        }
      }
    : persisted
}
