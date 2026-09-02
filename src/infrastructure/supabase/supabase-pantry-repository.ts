import type { SupabaseClient } from "@supabase/supabase-js"

import {
  PantryRepositoryError,
  type PantryItemRecord,
  type PantryRepository
} from "@/application/pantry/pantry-repository"
import { decimalToCanonical, parseCanonicalDecimal } from "@/domain/shared/decimal"

import type { Database } from "./database.types.js"

type UnknownRecord = Record<string, unknown>
type RpcError = { readonly code?: string }

function invalidStoredData(): never {
  throw new PantryRepositoryError("INVALID_STORED_DATA")
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalidStoredData()
  return value
}

function positiveVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalidStoredData()
  return value
}

function canonicalDecimal(value: unknown, maxScale: number): string {
  const raw = typeof value === "number" ? String(value) : value
  if (typeof raw !== "string") invalidStoredData()
  const parsed = parseCanonicalDecimal(raw, {
    allowNegative: false,
    maxScale,
    maxIntegerDigits: 34
  })
  if (!parsed.ok) invalidStoredData()
  return decimalToCanonical(parsed.value)
}

function parseRow(value: unknown): PantryItemRecord {
  if (!isRecord(value)) invalidStoredData()
  return {
    pantryItemId: string(value.id),
    householdId: string(value.household_id),
    foodId: string(value.food_id),
    foodFactVersionId: string(value.food_fact_version_id),
    quantity: canonicalDecimal(value.quantity, 6),
    unitId: string(value.unit_id),
    baseQuantity: canonicalDecimal(value.base_quantity, 12),
    baseUnitId: string(value.base_unit_id),
    version: positiveVersion(value.version),
    updatedAt: string(value.updated_at)
  }
}

function parseRows(value: unknown): PantryItemRecord[] {
  if (!Array.isArray(value)) invalidStoredData()
  const rows = value.map(parseRow)
  rows.sort((left, right) =>
    left.foodId === right.foodId
      ? left.pantryItemId.localeCompare(right.pantryItemId)
      : left.foodId.localeCompare(right.foodId)
  )
  return rows
}

function rpcFailure(error: RpcError): PantryRepositoryError {
  if (error.code === "42501") return new PantryRepositoryError("UNAUTHORIZED")
  if (error.code === "P0001") return new PantryRepositoryError("VERSION_CONFLICT")
  return new PantryRepositoryError("DEPENDENCY_UNAVAILABLE")
}

function rpcQuantity(value: string): number {
  const parsed = parseCanonicalDecimal(value, {
    allowNegative: false,
    maxScale: 6,
    maxIntegerDigits: 12
  })
  if (!parsed.ok) throw new PantryRepositoryError("INVALID_STORED_DATA")
  const canonical = decimalToCanonical(parsed.value)
  const numeric = Number(canonical)
  if (!Number.isFinite(numeric) || String(numeric) !== canonical) {
    throw new PantryRepositoryError("INVALID_STORED_DATA")
  }
  return numeric
}

export function createSupabasePantryRepository(client: SupabaseClient<Database>): PantryRepository {
  return {
    async load(householdId) {
      const { data, error } = await client.rpc("get_pantry", { p_household_id: householdId })
      if (error !== null) throw rpcFailure(error)
      return parseRows(data)
    },

    async upsert(input) {
      const { data, error } = await client.rpc("upsert_pantry_item", {
        p_household_id: input.householdId,
        p_food_id: input.foodId,
        p_food_fact_version_id: input.foodFactVersionId,
        p_unit_id: input.unitId,
        p_quantity: rpcQuantity(input.quantity),
        p_expected_version: input.expectedVersion
      })
      if (error !== null) throw rpcFailure(error)
      return parseRow(data)
    },

    async remove(pantryItemId, expectedVersion) {
      const { data, error } = await client.rpc("delete_pantry_item", {
        p_pantry_item_id: pantryItemId,
        p_expected_version: expectedVersion
      })
      if (error !== null) throw rpcFailure(error)
      if (data !== pantryItemId) invalidStoredData()
      return pantryItemId
    }
  }
}
