import type { ContentHasher } from "../shared/content-hasher.js"
import { canonicalUtf8 } from "../../domain/shared/canonical-json.js"
import {
  normalizePlannerInputV2,
  evaluatePlannerEligibilityV2,
  searchWeekV2,
  previewMealReplacementV2,
  type NormalizedPlannerInputV2,
  type ReadyPlanV2
} from "../../domain/planner/planner-v2.js"
import { buildPlannerSnapshotPayloadsV2 } from "../../domain/planner/planner-snapshot.js"
import { buildShoppingListSnapshotV2 } from "../../domain/shopping/build-shopping-list-snapshot-v2.js"
import { buildPlanTrustView } from "./plan-trust.js"
import {
  previewMealReplacementUseCase,
  applyMealReplacement,
  type PlannerRepository,
  type ReplacementCommand,
  type generateMealPlan
} from "./planner-use-cases.js"
import type {
  PlannerRepositoryV2,
  PersistPlannerRevisionCommandV2,
  PublicReadyPlanV2,
  PublicMealSnapshotV2
} from "./planner-versioned-repository.js"
function publicMeal(
  meal: ReadyPlanV2["selected"][number],
  plannedMealSharePercent: number | null
): PublicMealSnapshotV2 {
  return {
    plannedMealSharePercent,
    mealOptionId: meal.mealOptionId,
    mealOptionVersionId: meal.mealOptionVersionId,
    mealOptionCode: meal.mealOptionCode,
    mealOptionNameVi: meal.mealOptionNameVi,
    elapsedMinutes: meal.elapsedMinutes,
    adultEquivalent: meal.adultEquivalent,
    mealScaleFactor: meal.mealScaleFactor,
    mealOption: meal.mealOption,
    scaledIngredients: meal.scaledIngredients,
    nutrition: meal.nutrition,
    consumptionCost: meal.consumptionCost,
    memberPortions: meal.memberPortions.map((p) => ({
      recipientKey: p.recipientKey,
      ...(p.memberId === undefined ? {} : { memberId: p.memberId }),
      memberKind: p.memberKind,
      ageBand: p.ageBand,
      label: p.label,
      memberCount: p.memberCount,
      coefficientPerMember: p.coefficientPerMember,
      totalCoefficient: p.totalCoefficient,
      sharePerMember: p.sharePerMember,
      mealTargetKcal: p.mealTargetKcal,
      actualMealKcal: p.actualMealKcal,
      energyTargetStatus: p.energyTargetStatus,
      unappliedReason: p.unappliedReason
    }))
  }
}
export function publicReadyPlanV2(plan: ReadyPlanV2): PublicReadyPlanV2 {
  return {
    items: plan.items.map((i) => ({
      dayIndex: i.dayIndex,
      mealSlot: i.mealSlot,
      mealOptionId: i.mealOptionId,
      mealOptionVersionId: i.mealOptionVersionId,
      adultEquivalent: i.adultEquivalent,
      scaleFactor: i.scaleFactor,
      snapshot: publicMeal(
        i.snapshot,
        plan.inputBinding.nutritionSetup?.plannedMealSharePercent ?? null
      )
    })),
    totalEstimatedCostVnd: plan.totalEstimatedCostVnd
  }
}
async function evidence(
  hasher: ContentHasher,
  input: NormalizedPlannerInputV2,
  plan: ReadyPlanV2,
  warnings: readonly unknown[],
  parent?: { revisionId: string; dayIndex: number }
) {
  const shopping = buildShoppingListSnapshotV2(input, plan)
  if (!shopping.ok) return shopping
  const calculation = {
    items: plan.items,
    selectedMealOptions: plan.selected,
    purchaseBasket: plan.purchaseBasket,
    shoppingList: shopping.value,
    score: plan.score,
    frontierMetrics: plan.frontierMetrics,
    warnings,
    privatePlanBinding: { input: plan.inputBinding, catalog: plan.catalogBinding },
    ...(parent ? { parentRevisionId: parent.revisionId, replacementDayIndex: parent.dayIndex } : {})
  }
  const payload = buildPlannerSnapshotPayloadsV2({ input, calculation })
  const catalogFingerprint = await hasher.sha256(canonicalUtf8(payload.catalogPayload))
  const inputSnapshot = {
    ...payload.inputPayload,
    engineVersion: "planner-engine-v6",
    catalogFingerprint
  }
  const inputFingerprint = await hasher.sha256(canonicalUtf8(inputSnapshot))
  const calculationSnapshot = { ...calculation, catalogFingerprint, inputFingerprint }
  const calculationFingerprint = await hasher.sha256(canonicalUtf8(calculationSnapshot))
  return {
    ok: true as const,
    value: {
      catalogFingerprint,
      inputFingerprint,
      calculationFingerprint,
      inputSnapshot,
      calculationSnapshot
    }
  }
}
const fail = (code: "STALE_PLAN_VERSION" | "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED") => ({
  ok: false as const,
  error: { code }
})
export function createVersionedPlannerUseCases(dependencies: {
  legacyRepository: PlannerRepository
  repository: PlannerRepositoryV2
  hasher: ContentHasher
}) {
  const { repository, legacyRepository, hasher } = dependencies
  async function previewInternal(command: ReplacementCommand) {
    const loaded = await repository.loadReplacementInput({
      actorUserId: command.actorUserId,
      planId: command.planId
    })
    if (!loaded.ok) return loaded
    if (loaded.value.engineVersion === "legacy")
      return { ok: true as const, value: { legacy: true as const } }
    const authoritative = loaded.value
    if (
      authoritative.planVersion !== command.expectedPlanVersion ||
      (command.expectedCurrentRevisionId !== undefined &&
        authoritative.currentRevisionId !== command.expectedCurrentRevisionId)
    )
      return fail("STALE_PLAN_VERSION")
    if (
      authoritative.input.householdSetupVersion !== authoritative.householdSetupVersion ||
      (command.expectedHouseholdSetupVersion !== undefined &&
        command.expectedHouseholdSetupVersion !== authoritative.householdSetupVersion)
    )
      return fail("PLAN_INPUT_CHANGED_REGENERATION_REQUIRED")
    const normalized = normalizePlannerInputV2(authoritative.input)
    if (!normalized.ok) return normalized
    const result = previewMealReplacementV2(
      normalized.value,
      authoritative.currentPlan,
      command.targetDayIndex
    )
    if (!result.ok) return result
    const proof = await evidence(
      hasher,
      normalized.value,
      result.value.plan,
      result.value.warnings,
      { revisionId: authoritative.currentRevisionId, dayIndex: command.targetDayIndex }
    )
    if (!proof.ok) return proof
    return {
      ok: true as const,
      value: {
        legacy: false as const,
        authoritative,
        normalized: normalized.value,
        result: result.value,
        proof: proof.value
      }
    }
  }
  function persistence(
    input: NormalizedPlannerInputV2,
    plan: ReadyPlanV2,
    proof: Awaited<ReturnType<typeof evidence>> & { ok: true },
    command: { actorUserId: string; idempotencyKey: string },
    revision: {
      kind: "generation" | "regeneration" | "replacement"
      version: number
      parent: string | null
      day: number | null
    },
    warnings: readonly unknown[]
  ): PersistPlannerRevisionCommandV2 {
    return {
      actorUserId: command.actorUserId,
      householdId: input.householdId,
      weekStart: input.weekStart,
      idempotencyKey: command.idempotencyKey,
      expectedPlanVersion: revision.version,
      parentRevisionId: revision.parent,
      revisionKind: revision.kind,
      replacementDayIndex: revision.day,
      householdSetupVersion: input.householdSetupVersion,
      engineVersion: "planner-engine-v6",
      portionConfigVersion: "portion-v2",
      plannerConfigVersion: "planner-v2",
      priceFreshnessConfigVersion: "price-freshness-v1",
      calculationDate: input.calculationDate,
      ...proof.value,
      budgetVnd: input.weeklyPlanBudgetVnd,
      totalEstimatedCostVnd: plan.totalEstimatedCostVnd,
      budgetStatus: plan.totalEstimatedCostVnd <= input.weeklyPlanBudgetVnd ? "within" : "over",
      overageVnd: Math.max(0, plan.totalEstimatedCostVnd - input.weeklyPlanBudgetVnd),
      warnings,
      items: plan.items
    }
  }
  return {
    current(command: Parameters<PlannerRepositoryV2["loadCurrentPlan"]>[0]) {
      return repository.loadCurrentPlan(command)
    },
    async generate(command: Parameters<typeof generateMealPlan>[2]) {
      const loaded = await repository.loadGenerationInput(command)
      if (!loaded.ok) return loaded
      const normalized = normalizePlannerInputV2(loaded.value)
      if (!normalized.ok) return normalized
      const eligible = evaluatePlannerEligibilityV2(normalized.value)
      if (!eligible.ok) return eligible
      const result = searchWeekV2(normalized.value, eligible.value.eligible)
      if (!("plan" in result)) return result
      const proof = await evidence(hasher, normalized.value, result.plan, result.warnings)
      if (!proof.ok) return proof
      const persisted = await repository.persistRevision(
        persistence(
          normalized.value,
          result.plan,
          proof,
          command,
          {
            kind: command.regenerate ? "regeneration" : "generation",
            version: command.regenerate?.expectedPlanVersion ?? 0,
            parent: command.regenerate?.expectedCurrentRevisionId ?? null,
            day: null
          },
          result.warnings
        )
      )
      if (!persisted.ok) return persisted
      if (persisted.value.idempotent) {
        const stored = await repository.loadCurrentPlan({
          ...command,
          revisionId: persisted.value.revisionId
        })
        if (!stored.ok) return stored
        if (stored.value === null)
          return { ok: false as const, error: { code: "TRANSIENT_DEPENDENCY_FAILURE" as const } }
        return { ok: true as const, value: { ...stored.value, idempotent: true } }
      }
      return {
        ok: true as const,
        value: {
          ...persisted.value,
          engineVersion: "planner-engine-v6" as const,
          status: result.status,
          budgetVnd: normalized.value.weeklyPlanBudgetVnd,
          plan: publicReadyPlanV2(result.plan),
          warnings: result.warnings,
          trust: buildPlanTrustView(result.plan, normalized.value.calculationDate),
          catalogFingerprint: proof.value.catalogFingerprint,
          inputFingerprint: proof.value.inputFingerprint,
          calculationFingerprint: proof.value.calculationFingerprint
        }
      }
    },
    async preview(command: ReplacementCommand) {
      const p = await previewInternal(command)
      if (!p.ok) return p
      if (p.value.legacy) return previewMealReplacementUseCase(legacyRepository, hasher, command)
      const { result, proof, normalized } = p.value
      return {
        ok: true as const,
        value: {
          engineVersion: "planner-engine-v6" as const,
          status: result.status,
          items: publicReadyPlanV2(result.plan).items,
          plan: publicReadyPlanV2(result.plan),
          weeklyEstimatedCostVnd: result.plan.totalEstimatedCostVnd,
          weeklyCostDeltaVnd: result.weeklyCostDeltaVnd,
          costDeltaVnd: result.weeklyCostDeltaVnd,
          warnings: result.warnings,
          previewFingerprint: proof.calculationFingerprint,
          trust: buildPlanTrustView(result.plan, normalized.calculationDate)
        }
      }
    },
    async apply(
      command: ReplacementCommand & { previewFingerprint: string; idempotencyKey: string }
    ) {
      const p = await previewInternal(command)
      if (!p.ok) return p
      if (p.value.legacy) return applyMealReplacement(legacyRepository, hasher, command)
      const { result, proof, normalized, authoritative } = p.value
      if (proof.calculationFingerprint !== command.previewFingerprint)
        return fail("STALE_PLAN_VERSION")
      const persisted = await repository.persistRevision(
        persistence(
          normalized,
          result.plan,
          { ok: true, value: proof },
          command,
          {
            kind: "replacement",
            version: command.expectedPlanVersion,
            parent: authoritative.currentRevisionId,
            day: command.targetDayIndex
          },
          result.warnings
        )
      )
      if (!persisted.ok) return persisted
      return {
        ok: true as const,
        value: {
          ...persisted.value,
          engineVersion: "planner-engine-v6" as const,
          status: result.status,
          budgetVnd: normalized.weeklyPlanBudgetVnd,
          plan: publicReadyPlanV2(result.plan),
          costDeltaVnd: result.weeklyCostDeltaVnd,
          warnings: result.warnings,
          trust: buildPlanTrustView(result.plan, normalized.calculationDate)
        }
      }
    }
  }
}
export type VersionedPlannerUseCases = ReturnType<typeof createVersionedPlannerUseCases>
