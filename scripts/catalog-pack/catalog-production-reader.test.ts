import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import {
  createCatalogProductionReader,
  type CatalogSelectGateway,
  type CatalogSelectRequest
} from "./catalog-production-reader.ts"

const EXPECTED_TABLES = new Set([
  "units",
  "food_categories",
  "allergens",
  "dietary_tags",
  "nutrients",
  "price_regions",
  "recipe_tags",
  "foods",
  "food_fact_versions",
  "recipes",
  "recipe_versions",
  "price_books",
  "meal_options",
  "meal_option_versions"
])

describe("CatalogReferenceReader", () => {
  test("uses only the approved production table whitelist", async () => {
    const requests: CatalogSelectRequest[] = []
    const gateway: CatalogSelectGateway = {
      async select(request) {
        requests.push(request)
        return { ok: true, rows: [] }
      }
    }

    await createCatalogProductionReader(gateway).loadSnapshot(buildReadyCatalogPack())

    expect(new Set(requests.map((item) => item.table))).toEqual(EXPECTED_TABLES)
  })
})
