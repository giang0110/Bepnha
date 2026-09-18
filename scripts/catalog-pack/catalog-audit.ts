import { readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { parseCsv } from "./catalog-sheet-csv.ts"

/**
 * Quality checks a shape validator cannot make.
 *
 * `catalog:validate` answers "is this a well-formed pack". This answers a different question: "does
 * this look like data somebody actually looked up". The two failures it is built for are the ones
 * that pass every other gate — a nutrition figure invented rather than transcribed, and an allergen
 * conclusion asserted rather than established.
 *
 * It never edits anything. Everything here is advisory except what it marks as a failure.
 */

/** Hosts that publish a national food composition table, or a ministry/institute that owns one. */
const AUTHORITATIVE_HOSTS = new Set([
  "www.fao.org",
  "fao.org",
  "dulieuphapluat.vn",
  "viendinhduong.vn",
  "www.viendinhduong.vn",
  "i.fnri.dost.gov.ph",
  "fdc.nal.usda.gov"
])

const ALLERGENS = [
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "soy",
  "wheat",
  "fish",
  "crustacean",
  "mollusc",
  "sesame"
] as const

/** A food of this category is the allergen. Saying otherwise is not a judgement call, it is wrong. */
const CATEGORY_IMPLIES: Readonly<Record<string, string>> = {
  fish: "fish",
  crustacean: "crustacean",
  mollusc: "mollusc",
  egg: "egg",
  tofu: "soy",
  dairy: "dairy"
}

export interface AuditFinding {
  readonly severity: "error" | "warning"
  readonly code: string
  readonly subject: string
  readonly detail: string
}

type Row = Record<string, string>

function readTable(directory: string, file: string): Row[] {
  const rows = parseCsv(readFileSync(join(directory, file), "utf8"))
  const header = rows[0] ?? []
  return rows.slice(1).map((row) => {
    const record: Row = {}
    header.forEach((name, index) => {
      record[name.trim()] = row[index] ?? ""
    })
    return record
  })
}

function host(provenance: string): string | null {
  try {
    return new URL(provenance).host
  } catch {
    return null
  }
}

/**
 * Atwater: energy is roughly 4 kcal per gram of protein and carbohydrate, 9 per gram of fat.
 * Real composition data satisfies it because the figures come from the same analysis; independently
 * invented figures usually do not, which is what makes this worth checking.
 */
export function energyFindings(nutrients: readonly Row[]): AuditFinding[] {
  const byFood = new Map<string, Map<string, string>>()
  for (const row of nutrients) {
    const food = row["foodCode"] ?? ""
    const existing = byFood.get(food) ?? new Map<string, string>()
    existing.set(row["nutrientCode"] ?? "", row["amountPer100g"] ?? "")
    byFood.set(food, existing)
  }

  const findings: AuditFinding[] = []
  for (const [food, values] of byFood) {
    const numbers = ["energy_kcal", "protein_g", "carbohydrate_g", "fat_g"].map((code) =>
      Number(values.get(code))
    )
    if (numbers.some((value) => !Number.isFinite(value))) continue

    const [declared, protein, carbohydrate, fat] = numbers as [number, number, number, number]
    const estimate = 4 * protein + 4 * carbohydrate + 9 * fat
    if (declared === 0 && estimate === 0) continue

    const drift = Math.abs(estimate - declared) / Math.max(declared, 1)
    if (drift > 0.25) {
      findings.push({
        severity: "warning",
        code: "ENERGY_INCONSISTENT",
        subject: food,
        detail: `declares ${declared} kcal, macronutrients imply ${estimate.toFixed(1)} (${Math.round(drift * 100)}% apart)`
      })
    }
  }
  return findings
}

/**
 * Only a claim about the food needs a source.
 *
 * `unknown` is the honest answer when nothing was established, and `cross_contact_unverified` says
 * in as many words that the supplier's handling was *not* verified. Both owe the reader a reason
 * rather than a citation: demanding a URL for either pushes an author towards inventing one, which
 * is the opposite of the point. `absent`, `contains` and `may_contain` are assertions about the
 * food, and those must be traceable.
 */
const UNCITED_STATUSES = new Set(["unknown", "cross_contact_unverified"])

function needsCitation(row: Row): boolean {
  const status = row["status"]
  return status === undefined || !UNCITED_STATUSES.has(status)
}

export function provenanceFindings(
  rows: readonly Row[],
  column: string,
  what: string
): AuditFinding[] {
  const findings: AuditFinding[] = []
  for (const row of rows) {
    if (!needsCitation(row)) continue
    const value = row[column] ?? ""
    const subject =
      `${row["foodCode"] ?? row["code"] ?? "?"} ${row["nutrientCode"] ?? row["allergenCode"] ?? ""}`.trim()

    if (value === "") {
      findings.push({ severity: "error", code: "PROVENANCE_MISSING", subject, detail: what })
      continue
    }
    const source = host(value)
    if (source === null) {
      // "estimated", "web search", a book with no edition — nothing a reader can go and check.
      findings.push({
        severity: "error",
        code: "PROVENANCE_NOT_CITABLE",
        subject,
        detail: `${what}: ${value.slice(0, 60)}`
      })
      continue
    }
    if (!AUTHORITATIVE_HOSTS.has(source)) {
      findings.push({
        severity: "warning",
        code: "PROVENANCE_SECONDARY",
        subject,
        detail: `${what} rests on ${source}`
      })
    }
  }
  return findings
}

export function allergenFindings(
  foods: readonly Row[],
  assessments: readonly Row[]
): AuditFinding[] {
  const findings: AuditFinding[] = []
  const category = new Map(foods.map((food) => [food["code"] ?? "", food["categoryCode"] ?? ""]))

  for (const food of foods) {
    const code = food["code"] ?? ""
    const own = assessments.filter((row) => row["foodCode"] === code)
    const missing = ALLERGENS.filter(
      (allergen) => !own.some((row) => row["allergenCode"] === allergen)
    )
    if (missing.length > 0) {
      findings.push({
        severity: "error",
        code: "ALLERGEN_ROWS_MISSING",
        subject: code,
        detail: missing.join(", ")
      })
    }

    const implied = CATEGORY_IMPLIES[category.get(code) ?? ""]
    if (implied !== undefined) {
      const status = own.find((row) => row["allergenCode"] === implied)?.["status"]
      if (status !== "contains") {
        findings.push({
          severity: "error",
          code: "ALLERGEN_CONTRADICTS_CATEGORY",
          subject: code,
          detail: `is a ${category.get(code)}, so ${implied} must be "contains", found "${status ?? "nothing"}"`
        })
      }
    }
  }

  // One reason covering a single food's ten allergens is normal: you assess that food once. The
  // signature of a bulk fill is one reason spanning many *different* foods, so count foods, not
  // rows, or this would punish exactly the careful per-food work it is meant to encourage.
  const foodsByProvenance = new Map<string, Set<string>>()
  for (const row of assessments) {
    if (row["status"] !== "absent") continue
    const key = row["provenance"] ?? ""
    const seen = foodsByProvenance.get(key) ?? new Set<string>()
    seen.add(row["foodCode"] ?? "")
    foodsByProvenance.set(key, seen)
  }
  for (const [provenance, seen] of foodsByProvenance) {
    if (seen.size >= 10) {
      findings.push({
        severity: "warning",
        code: "ABSENT_BULK_FILLED",
        subject: `${seen.size} foods`,
        detail: `share one justification: ${provenance.slice(0, 60)}`
      })
    }
  }

  return findings
}

export function auditBundle(directory: string): {
  readonly findings: readonly AuditFinding[]
  readonly statusCounts: Readonly<Record<string, number>>
} {
  const foods = readTable(directory, "foods.csv")
  const nutrients = readTable(directory, "food_nutrients.csv")
  const assessments = readTable(directory, "food_allergens.csv")

  const statusCounts: Record<string, number> = {}
  for (const row of assessments) {
    const status = row["status"] ?? ""
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
  }

  return {
    findings: [
      ...energyFindings(nutrients),
      ...allergenFindings(foods, assessments),
      ...provenanceFindings(nutrients, "provenance", "nutrition"),
      ...provenanceFindings(assessments, "provenance", "allergen")
    ],
    statusCounts
  }
}

if (import.meta.main) {
  const directory = process.argv[2]
  if (directory === undefined) {
    process.stderr.write("Usage: npm run catalog:audit -- <directory of the CSV bundle>\n")
    process.exitCode = 1
  } else {
    const { findings, statusCounts } = auditBundle(directory)
    const byCode = new Map<string, AuditFinding[]>()
    for (const finding of findings) {
      byCode.set(finding.code, [...(byCode.get(finding.code) ?? []), finding])
    }

    process.stdout.write(`allergen statuses: ${JSON.stringify(statusCounts)}\n\n`)
    for (const [code, group] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
      const severity = group[0]?.severity ?? "warning"
      process.stdout.write(`${severity === "error" ? "FAIL" : "warn"} ${code}: ${group.length}\n`)
      for (const finding of group.slice(0, 5)) {
        process.stdout.write(`    ${finding.subject} — ${finding.detail}\n`)
      }
      if (group.length > 5) process.stdout.write(`    … and ${group.length - 5} more\n`)
    }

    const errors = findings.filter((finding) => finding.severity === "error").length
    process.stdout.write(
      `\n${errors === 0 ? "NO_BLOCKING_FINDINGS" : `BLOCKING_FINDINGS ${errors}`}\n`
    )
    if (errors > 0) process.exitCode = 1
  }
}
