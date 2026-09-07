import { readFile } from "node:fs/promises"

import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import {
  CATALOG_PRODUCTION_TABLES,
  createCatalogProductionReader,
  type CatalogSelectGateway,
  type CatalogSelectRequest
} from "./catalog-production-reader.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"

const EXPECTED_COLUMNS = {
  units: "id,code,dimension",
  food_categories: "id,code,parent_id",
  allergens: "id,code",
  dietary_tags: "id,code",
  nutrients: "id,code,required_for_publication",
  price_regions: "id,code,is_launch_default",
  recipe_tags: "id,code,tag_kind",
  foods: "id,code,name_vi,base_dimension,base_unit_id,status,revision",
  food_fact_versions: "id,food_id,version_number,revision,publication_status",
  recipes: "id,code,name_vi,status,revision",
  recipe_versions: "id,recipe_id,version_number,revision,publication_status",
  price_books: "id,region_id,version_number,revision,publication_status",
  meal_options: "id,code,name_vi,status,revision",
  meal_option_versions: "id,meal_option_id,version_number,revision,publication_status"
} as const

const EXPECTED_TABLES = new Set(Object.keys(EXPECTED_COLUMNS))

const id = (group: number, index: number): string =>
  `910${group}0000-0000-0000-0000-${String(index).padStart(12, "0")}`

function rowsForRequest(request: CatalogSelectRequest): readonly unknown[] {
  const pack = buildReadyCatalogPack()
  const snapshot = buildResolvableProductionSnapshot(pack)
  const baseUnitId = snapshot.units.find((row) => row.code === "g")?.id
  if (baseUnitId === undefined) throw new Error("Synthetic g unit is required")

  switch (request.table) {
    case "units":
      return snapshot.units
    case "food_categories":
      return snapshot.categories.map((row) => ({
        id: row.id,
        code: row.code,
        parent_id: row.parentId
      }))
    case "allergens":
      return snapshot.allergens
    case "dietary_tags":
      return snapshot.dietaryTags
    case "nutrients":
      return snapshot.nutrients.map((row) => ({
        id: row.id,
        code: row.code,
        required_for_publication: row.requiredForPublication
      }))
    case "price_regions":
      return snapshot.priceRegions.map((row) => ({
        id: row.id,
        code: row.code,
        is_launch_default: row.isLaunchDefault
      }))
    case "recipe_tags":
      return snapshot.recipeTags.map((row) => ({
        id: row.id,
        code: row.code,
        tag_kind: row.tagKind
      }))
    case "foods":
      return pack.foods.map((food, index) => ({
        id: id(1, index + 1),
        code: food.code,
        name_vi: food.nameVi,
        base_dimension: food.baseDimension,
        base_unit_id: baseUnitId,
        status: "draft",
        revision: 1
      }))
    case "food_fact_versions":
      return []
    case "recipes":
      return pack.recipes.map((recipe, index) => ({
        id: id(2, index + 1),
        code: recipe.code,
        name_vi: recipe.nameVi,
        status: "draft",
        revision: 1
      }))
    case "recipe_versions":
      return []
    case "price_books":
      return []
    case "meal_options":
      return pack.mealOptions.map((meal, index) => ({
        id: id(3, index + 1),
        code: meal.code,
        name_vi: meal.nameVi,
        status: "draft",
        revision: 1
      }))
    case "meal_option_versions":
      return []
  }
}

describe("CatalogReferenceReader", () => {
  test("uses only the approved production whitelist with exact minimal columns", async () => {
    const requests: CatalogSelectRequest[] = []
    const gateway: CatalogSelectGateway = {
      select(request) {
        requests.push(request)
        return Promise.resolve({ ok: true, rows: rowsForRequest(request) })
      }
    }

    const result =
      await createCatalogProductionReader(gateway).loadSnapshot(buildReadyCatalogPack())

    expect(result.ok).toBe(true)
    expect(CATALOG_PRODUCTION_TABLES).toEqual(Object.keys(EXPECTED_COLUMNS))
    expect(new Set(requests.map((item) => item.table))).toEqual(EXPECTED_TABLES)
    for (const request of requests) {
      expect(request.columns).toBe(EXPECTED_COLUMNS[request.table])
    }
  })

  test("queries version tables only after production parent IDs are known", async () => {
    const requests: CatalogSelectRequest[] = []
    const gateway: CatalogSelectGateway = {
      select(request) {
        requests.push(request)
        if (
          request.table === "foods" ||
          request.table === "recipes" ||
          request.table === "meal_options" ||
          request.table === "price_regions"
        ) {
          return Promise.resolve({ ok: true, rows: [] })
        }
        return Promise.resolve({ ok: true, rows: rowsForRequest(request) })
      }
    }

    const result =
      await createCatalogProductionReader(gateway).loadSnapshot(buildReadyCatalogPack())

    expect(result.ok).toBe(true)
    expect(requests.map((item) => item.table)).not.toContain("food_fact_versions")
    expect(requests.map((item) => item.table)).not.toContain("recipe_versions")
    expect(requests.map((item) => item.table)).not.toContain("price_books")
    expect(requests.map((item) => item.table)).not.toContain("meal_option_versions")
  })

  test("fails closed when the gateway dependency is unavailable", async () => {
    const gateway: CatalogSelectGateway = {
      select() {
        return Promise.resolve({ ok: false })
      }
    }

    await expect(
      createCatalogProductionReader(gateway).loadSnapshot(buildReadyCatalogPack())
    ).resolves.toEqual({ ok: false, reason: "DEPENDENCY_UNAVAILABLE" })
  })

  test("fails closed when a production row is malformed", async () => {
    const gateway: CatalogSelectGateway = {
      select(request) {
        if (request.table === "units") {
          return Promise.resolve({ ok: true, rows: [{ id: 123, code: "g" }] })
        }
        return Promise.resolve({ ok: true, rows: rowsForRequest(request) })
      }
    }

    await expect(
      createCatalogProductionReader(gateway).loadSnapshot(buildReadyCatalogPack())
    ).resolves.toEqual({ ok: false, reason: "DEPENDENCY_UNAVAILABLE" })
  })

  test("the Supabase adapter exposes a SELECT-only production surface", async () => {
    const source = await readFile(
      new URL("./supabase-catalog-production-reader.ts", import.meta.url),
      "utf8"
    )

    expect(source).toContain(".select(")
    for (const forbidden of [".rpc(", ".insert(", ".upsert(", ".update(", ".delete("]) {
      expect(source).not.toContain(forbidden)
    }
  })
})
