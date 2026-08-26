import type { ContentHasher } from "@/application/shared/content-hasher"
import { canonicalUtf8 } from "@/domain/shared/canonical-json"
import { parseCanonicalDecimal } from "@/domain/shared/decimal"

export type MealOptionAdminFailureReason =
  | "VALIDATION_FAILED"
  | "STALE_CATALOG_REVISION"
  | "PUBLICATION_INCOMPLETE"
  | "NOT_FOUND"
  | "DEPENDENCY_UNAVAILABLE"

export type MealOptionAdminResult =
  | {
      readonly ok: true
      readonly value: {
        readonly id: string
        readonly revision: number
        readonly status: "draft" | "published" | "retired"
        readonly contentHash?: string
      }
    }
  | { readonly ok: false; readonly reason: MealOptionAdminFailureReason }

export interface MealOptionDraftComponent {
  readonly recipeId: string
  readonly recipeVersionId: string
  readonly quantityMultiplier: string
  readonly mealRole: "staple" | "main" | "vegetable" | "soup" | "side"
  readonly order: number
}

export interface MealOptionVersionDraftInput {
  readonly mealOptionVersionId: string
  readonly mealOptionId: string
  readonly expectedRevision: number
  readonly versionNumber: number
  readonly yieldAdultEquivalent: string
  readonly activeMinutes: number
  readonly elapsedMinutes: number
  readonly components: readonly MealOptionDraftComponent[]
  readonly tagIds: readonly string[]
}

export type MealOptionAdminCommand =
  | {
      readonly action: "create_meal_option"
      readonly input: { readonly code: string; readonly nameVi: string }
    }
  | {
      readonly action: "save_meal_option_version_draft"
      readonly input: MealOptionVersionDraftInput
    }
  | {
      readonly action: "publish_meal_option"
      readonly input: { readonly mealOptionVersionId: string; readonly expectedRevision: number }
    }
  | {
      readonly action: "retire_meal_option"
      readonly input: { readonly mealOptionId: string; readonly expectedRevision: number }
    }

export interface MealOptionPublicationAggregate {
  readonly mealOption: {
    readonly mealOptionId: string
    readonly code: string
    readonly nameVi: string
    readonly revision: number
  }
  readonly version: {
    readonly mealOptionVersionId: string
    readonly versionNumber: number
    readonly revision: number
    readonly yieldAdultEquivalent: string
    readonly activeMinutes: number
    readonly elapsedMinutes: number
    readonly publicationStatus: "draft" | "published"
    readonly contentHash: string | null
  }
  readonly components: readonly {
    readonly mealOptionRecipeId: string
    readonly recipeId: string
    readonly recipeVersionId: string
    readonly recipeVersionNumber: number
    readonly recipeContentHash: string | null
    readonly recipePublicationStatus: "draft" | "published"
    readonly recipeYieldAdultEquivalent: string
    readonly quantityMultiplier: string
    readonly mealRole: MealOptionDraftComponent["mealRole"]
    readonly sortOrder: number
  }[]
  readonly tags: readonly {
    readonly tagId: string
    readonly code: string
    readonly kind: string
  }[]
}

export type MealOptionAggregateResult =
  | { readonly ok: true; readonly value: MealOptionPublicationAggregate }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "DEPENDENCY_UNAVAILABLE" }

export interface MealOptionAdminRepository {
  readonly create: (input: {
    readonly code: string
    readonly nameVi: string
  }) => Promise<MealOptionAdminResult>
  readonly saveDraft: (input: MealOptionVersionDraftInput) => Promise<MealOptionAdminResult>
  readonly loadPublicationAggregate: (id: string) => Promise<MealOptionAggregateResult>
  readonly publish: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly contentHash: string
  }) => Promise<MealOptionAdminResult>
  readonly retire: (input: {
    readonly id: string
    readonly expectedRevision: number
  }) => Promise<MealOptionAdminResult>
}

const HASH_PATTERN = /^[0-9a-f]{64}$/u
const CODE_PATTERN = /^[a-z][a-z0-9_]*$/u

function positiveDecimal(value: string): boolean {
  return parseCanonicalDecimal(value, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false,
    allowZero: false
  }).ok
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function validLabel(value: string, maximum: number): boolean {
  return value.trim() === value && value.length > 0 && Array.from(value).length <= maximum
}

function validateDraft(input: MealOptionVersionDraftInput): boolean {
  const orders = input.components.map((item) => item.order)
  return (
    validRevision(input.expectedRevision) &&
    validRevision(input.versionNumber) &&
    positiveDecimal(input.yieldAdultEquivalent) &&
    Number.isSafeInteger(input.activeMinutes) &&
    input.activeMinutes > 0 &&
    Number.isSafeInteger(input.elapsedMinutes) &&
    input.elapsedMinutes >= input.activeMinutes &&
    input.elapsedMinutes <= 180 &&
    input.components.length > 0 &&
    new Set(input.components.map((item) => item.recipeId)).size === input.components.length &&
    new Set(orders).size === orders.length &&
    orders.every((order) => Number.isSafeInteger(order) && order >= 1 && order <= orders.length) &&
    input.components.some((item) => item.mealRole === "main") &&
    input.components.every((item) => positiveDecimal(item.quantityMultiplier)) &&
    new Set(input.tagIds).size === input.tagIds.length
  )
}

function aggregateIsComplete(value: MealOptionPublicationAggregate): boolean {
  if (
    value.version.publicationStatus !== "draft" ||
    value.version.contentHash !== null ||
    value.components.length === 0 ||
    !value.components.some((item) => item.mealRole === "main")
  ) {
    return false
  }
  const proteinCount = value.tags.filter((tag) => tag.kind === "protein_hint").length
  const styleCount = value.tags.filter((tag) => tag.kind === "cooking_style").length
  return (
    proteinCount === 1 &&
    styleCount >= 1 &&
    value.components.every(
      (component) =>
        component.recipePublicationStatus === "published" &&
        component.recipeContentHash !== null &&
        HASH_PATTERN.test(component.recipeContentHash) &&
        positiveDecimal(component.quantityMultiplier) &&
        positiveDecimal(component.recipeYieldAdultEquivalent)
    )
  )
}

function canonicalAggregate(value: MealOptionPublicationAggregate): unknown {
  return {
    ...value,
    components: [...value.components].sort((left, right) =>
      left.sortOrder !== right.sortOrder
        ? left.sortOrder - right.sortOrder
        : left.mealOptionRecipeId.localeCompare(right.mealOptionRecipeId)
    ),
    tags: [...value.tags].sort((left, right) => {
      const leftKey = `${left.kind}:${left.code}:${left.tagId}`
      const rightKey = `${right.kind}:${right.code}:${right.tagId}`
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    })
  }
}

export async function executeMealOptionAdminCommand(
  repository: MealOptionAdminRepository,
  hasher: ContentHasher,
  command: MealOptionAdminCommand
): Promise<MealOptionAdminResult> {
  switch (command.action) {
    case "create_meal_option":
      if (!CODE_PATTERN.test(command.input.code) || !validLabel(command.input.nameVi, 120)) {
        return { ok: false, reason: "VALIDATION_FAILED" }
      }
      return repository.create(command.input)
    case "save_meal_option_version_draft":
      return validateDraft(command.input)
        ? repository.saveDraft(command.input)
        : { ok: false, reason: "VALIDATION_FAILED" }
    case "publish_meal_option": {
      if (!validRevision(command.input.expectedRevision))
        return { ok: false, reason: "VALIDATION_FAILED" }
      const aggregate = await repository.loadPublicationAggregate(command.input.mealOptionVersionId)
      if (!aggregate.ok) return aggregate
      if (
        aggregate.value.version.mealOptionVersionId !== command.input.mealOptionVersionId ||
        aggregate.value.version.revision !== command.input.expectedRevision ||
        !aggregateIsComplete(aggregate.value)
      ) {
        return { ok: false, reason: "PUBLICATION_INCOMPLETE" }
      }
      const contentHash = await hasher.sha256(canonicalUtf8(canonicalAggregate(aggregate.value)))
      return repository.publish({
        id: command.input.mealOptionVersionId,
        expectedRevision: command.input.expectedRevision,
        contentHash
      })
    }
    case "retire_meal_option":
      if (!validRevision(command.input.expectedRevision))
        return { ok: false, reason: "VALIDATION_FAILED" }
      return repository.retire({
        id: command.input.mealOptionId,
        expectedRevision: command.input.expectedRevision
      })
  }
}
