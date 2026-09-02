import type { SupabaseClient } from "@supabase/supabase-js"

import { normalizePantrySnapshotV1 } from "@/domain/pantry/normalize-pantry-snapshot"
import type { PantryBaseDimension, PantrySnapshotV1 } from "@/domain/pantry/pantry"
import { decimalToCanonical, parseCanonicalDecimal } from "@/domain/shared/decimal"
import type { Database } from "@/infrastructure/supabase/database.types"

type UnknownRecord = Record<string, unknown>

function invalidPantryData(): never {
  throw new Error("INVALID_PANTRY_DATA")
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function record(value: unknown): UnknownRecord {
  if (!isRecord(value)) invalidPantryData()
  return value
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalidPantryData()
  return value
}

function positiveVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalidPantryData()
  return value
}

function canonicalDecimal(value: unknown, maxScale: number): string {
  const raw = typeof value === "number" ? String(value) : value
  if (typeof raw !== "string") invalidPantryData()
  const parsed = parseCanonicalDecimal(raw, {
    allowNegative: false,
    maxScale,
    maxIntegerDigits: 34
  })
  if (!parsed.ok) invalidPantryData()
  return decimalToCanonical(parsed.value)
}

function baseDimension(value: unknown): PantryBaseDimension {
  if (value !== "mass" && value !== "volume" && value !== "count") invalidPantryData()
  return value
}

function conversionKey(foodFactVersionId: string, unitId: string): string {
  return `${foodFactVersionId}\u0000${unitId}`
}

export async function loadPantrySnapshot(
  client: SupabaseClient<Database>,
  householdId: string
): Promise<PantrySnapshotV1> {
  const pantryResult = await client.rpc("get_pantry", { p_household_id: householdId })
  if (pantryResult.error !== null || !Array.isArray(pantryResult.data)) {
    throw new Error("PANTRY_DATA_UNAVAILABLE")
  }

  const rows = pantryResult.data.map(record)
  if (rows.length === 0) return { version: "pantry-snapshot-v1", items: [] }

  const foodIds = [...new Set(rows.map((row) => nonEmptyString(row.food_id)))]
  const factIds = [...new Set(rows.map((row) => nonEmptyString(row.food_fact_version_id)))]

  const [foodsResult, factsResult, conversionsResult] = await Promise.all([
    client.from("foods").select("id, base_unit_id, base_dimension").in("id", foodIds),
    client.from("food_fact_versions").select("id, food_id").in("id", factIds),
    client
      .from("food_fact_unit_conversions")
      .select("food_fact_version_id, unit_id, base_quantity_per_unit")
      .in("food_fact_version_id", factIds)
  ])

  if (
    foodsResult.error !== null ||
    factsResult.error !== null ||
    conversionsResult.error !== null
  ) {
    throw new Error("PANTRY_DATA_UNAVAILABLE")
  }

  const foods = new Map(foodsResult.data.map((food) => [food.id, food] as const))
  const facts = new Map(factsResult.data.map((fact) => [fact.id, fact] as const))
  const conversions = new Map<string, (typeof conversionsResult.data)[number]>()
  for (const conversion of conversionsResult.data) {
    conversions.set(
      conversionKey(conversion.food_fact_version_id, conversion.unit_id),
      conversion
    )
  }

  const normalized = normalizePantrySnapshotV1(
    rows.map((row) => {
      const pantryItemId = nonEmptyString(row.id)
      const rowHouseholdId = nonEmptyString(row.household_id)
      const foodId = nonEmptyString(row.food_id)
      const foodFactVersionId = nonEmptyString(row.food_fact_version_id)
      const unitId = nonEmptyString(row.unit_id)
      const quantity = canonicalDecimal(row.quantity, 6)
      const storedBaseQuantity = canonicalDecimal(row.base_quantity, 12)
      const storedBaseUnitId = nonEmptyString(row.base_unit_id)
      const version = positiveVersion(row.version)
      const food = foods.get(foodId)
      const fact = facts.get(foodFactVersionId)
      const conversion = conversions.get(conversionKey(foodFactVersionId, unitId))

      if (
        rowHouseholdId !== householdId ||
        food === undefined ||
        fact === undefined ||
        conversion === undefined
      ) {
        return invalidPantryData()
      }

      const quantityValue = parseCanonicalDecimal(quantity, { allowNegative: false })
      const conversionValue = parseCanonicalDecimal(String(conversion.base_quantity_per_unit), {
        allowNegative: false,
        allowZero: false,
        maxScale: 6,
        maxIntegerDigits: 12
      })
      if (!quantityValue.ok || !conversionValue.ok) invalidPantryData()
      const expectedBaseQuantity = decimalToCanonical(
        quantityValue.value.mul(conversionValue.value)
      )
      if (expectedBaseQuantity !== storedBaseQuantity) invalidPantryData()

      return {
        pantryItemId,
        foodId,
        foodFactVersionId,
        foodFactFoodId: fact.food_id,
        quantity,
        unitId,
        baseQuantity: storedBaseQuantity,
        baseUnitId: storedBaseUnitId,
        foodBaseUnitId: food.base_unit_id,
        baseDimension: baseDimension(food.base_dimension),
        version
      }
    })
  )

  if (!normalized.ok) invalidPantryData()
  return normalized.value
}
