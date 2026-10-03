import type {
  CurrentPlanView,
  PersistPlannerRevisionCommand,
  PlannerRepository,
  ReplacementCommand
} from "./planner-use-cases.js"
import type {
  PlannerInputV2,
  ReadyPlanV2,
  EligibleMealOptionV2
} from "../../domain/planner/planner-v2.js"
import type { ShoppingListSnapshotV2 } from "../../domain/shopping/shopping-list.js"
export type PlannerRepositoryErrorV2 =
  | "UNAUTHORIZED"
  | "TRANSIENT_DEPENDENCY_FAILURE"
  | "DEPENDENCY_SCHEMA_NOT_READY"
  | "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED"
export type PlannerRepositoryResultV2<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: PlannerRepositoryErrorV2 } }
export type PublicMealSnapshotV2 = { readonly plannedMealSharePercent: number | null } & Pick<
  EligibleMealOptionV2,
  | "mealOptionId"
  | "mealOptionVersionId"
  | "mealOptionCode"
  | "mealOptionNameVi"
  | "elapsedMinutes"
  | "adultEquivalent"
  | "mealScaleFactor"
  | "mealOption"
  | "scaledIngredients"
  | "nutrition"
  | "consumptionCost"
  | "memberPortions"
>
export interface PublicReadyPlanV2 {
  readonly items: readonly (Omit<ReadyPlanV2["items"][number], "snapshot"> & {
    readonly snapshot: PublicMealSnapshotV2
  })[]
  readonly totalEstimatedCostVnd: number
}
export interface CurrentPlanViewV2 extends Omit<CurrentPlanView, "plan"> {
  readonly engineVersion: "planner-engine-v6"
  readonly plan: PublicReadyPlanV2
  readonly catalogFingerprint: string
  readonly inputFingerprint: string
  readonly calculationFingerprint: string
}
export type VersionedCurrentPlanView = CurrentPlanView | CurrentPlanViewV2
export type ReplacementAuthoritativeInputV2 = {
  readonly engineVersion: "planner-engine-v6"
  readonly input: PlannerInputV2
  readonly currentPlan: ReadyPlanV2
  readonly planVersion: number
  readonly currentRevisionId: string
  readonly householdSetupVersion: number
}
export type VersionedReplacementInput =
  ReplacementAuthoritativeInputV2 | { readonly engineVersion: "legacy" }
export interface PersistPlannerRevisionCommandV2 extends Omit<
  PersistPlannerRevisionCommand,
  | "engineVersion"
  | "portionConfigVersion"
  | "plannerConfigVersion"
  | "calculationSnapshot"
  | "items"
> {
  readonly engineVersion: "planner-engine-v6"
  readonly portionConfigVersion: "portion-v2"
  readonly plannerConfigVersion: "planner-v2"
  readonly calculationSnapshot: {
    readonly purchaseBasket: ReadyPlanV2["purchaseBasket"]
    readonly shoppingList: ShoppingListSnapshotV2
    readonly [key: string]: unknown
  }
  readonly items: ReadyPlanV2["items"]
}
export interface PlannerRepositoryV2 {
  loadGenerationInput(
    input: Parameters<PlannerRepository["loadGenerationInput"]>[0]
  ): Promise<PlannerRepositoryResultV2<PlannerInputV2>>
  loadReplacementInput(
    input: Parameters<PlannerRepository["loadReplacementInput"]>[0]
  ): Promise<PlannerRepositoryResultV2<VersionedReplacementInput>>
  loadCurrentPlan(
    input: Parameters<PlannerRepository["loadCurrentPlan"]>[0] & { readonly revisionId?: string }
  ): Promise<PlannerRepositoryResultV2<VersionedCurrentPlanView | null>>
  persistRevision(
    input: PersistPlannerRevisionCommandV2
  ): Promise<
    | Awaited<ReturnType<PlannerRepository["persistRevision"]>>
    | { readonly ok: false; readonly error: { readonly code: "DEPENDENCY_SCHEMA_NOT_READY" } }
  >
}
export type VersionedReplacementCommand = ReplacementCommand
