// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { purchasingPackFixture } from "./catalog-pack-test-builder.ts"
import { packToSheets } from "./catalog-sheet-tables.ts"
import { serializeCsv } from "./catalog-sheet-csv.ts"
import { auditBundle } from "./catalog-audit.ts"
test("audits missing policy and unverified sale terms independently", () => {
  const p = purchasingPackFixture()
  const pack = {
    ...p,
    foodQuantityPolicies: [],
    priceBook: {
      ...p.priceBook,
      prices: p.priceBook.prices.map((row) => ({ ...row, purchaseProvenance: "unknown" }))
    }
  }
  const directory = mkdtempSync(join(tmpdir(), "bepnha-sale-audit-"))
  try {
    for (const [name, table] of Object.entries(packToSheets(pack)))
      writeFileSync(join(directory, name), serializeCsv(table))
    const codes = auditBundle(directory).findings.map((f) => f.code)
    expect(codes).toContain("MISSING_QUANTITY_POLICY")
    expect(codes).toContain("PURCHASE_TERMS_UNVERIFIED")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
