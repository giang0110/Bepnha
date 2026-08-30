import type { ContentHasher } from "@/application/shared/content-hasher"
import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility"
import { PLANNER_ENGINE_VERSION } from "@/domain/planner/planner-engine-version"
import type { PlannerInputV1 } from "@/domain/planner/planner-input"
import type { PlannerFatalCode } from "@/domain/planner/planner-outcome"
import {
  buildPlannerSnapshotPayloads,
  type PlannerCandidateManifestEntry
} from "@/domain/planner/planner-snapshot"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { previewMealReplacement } from "@/domain/planner/replace-meal"
import { searchWeek, type ReadyPlan } from "@/domain/planner/search-week"
import { canonicalJson, canonicalUtf8 } from "@/domain/shared/canonical-json"
import { buildShoppingListSnapshot } from "@/domain/shopping/build-shopping-list-snapshot"
import type { ShoppingListSnapshotV1 } from "@/domain/shopping/shopping-list"

type Failure = { readonly ok: false; readonly error: { readonly code: PlannerFatalCode } }

type RepositoryLoadResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: { readonly code: "UNAUTHORIZED" | "TRANSIENT_DEPENDENCY_FAILURE" }
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
    candidateManifest: manifestFromInput(normalized.value),
    calculation: {
      items: plan.items,
      selectedMealOptions: plan.selected,
      purchaseBasket: plan.purchaseBasket,
      shoppingList: shopping.value,
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

export async function generateMealPlan(
  repository: PlannerRepository,
  hasher: ContentHasher,
  command: {
    readonly actorUserId: string
    readonly householdId: string
    readonly weekStart: string
    readonly calculationDate: string
    readonly idempotencyKey: string
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
    normalized.value.plannerConfig
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
    expectedPlanVersion: 0,
    parentRevisionId: null,
    idempotencyKey: command.idempotencyKey,
    revisionKind: "generation",
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
    plannerConfig: normalized.value.plannerConfig
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
