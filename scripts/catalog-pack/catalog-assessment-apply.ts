import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { parseCsv, serializeCsv } from "./catalog-sheet-csv.ts"

/**
 * Turns a completed allergen survey into the statuses the catalog stores.
 *
 * A survey answers, for each food and allergen, a question of fact: is this allergen an ingredient
 * of this food, does the product vary, or is it simply not an ingredient with the supplier's
 * handling unverified. Those three answers correspond exactly to three of the catalog's statuses.
 * This tool performs that correspondence and nothing else.
 *
 * What it will not do is decide anything. It never invents a status for a pair the survey did not
 * cover, never maps a conclusion it does not recognise, never overwrites an existing conclusion that
 * disagrees with the survey, and never writes a claim about a food without the source that
 * established it. Every one of those is a refusal, and one refusal anywhere means nothing is
 * written — a half-applied allergen table is worse than an unapplied one, because it looks finished.
 *
 * `absent` is deliberately unreachable from here. It asserts that handling is cleared as well as
 * composition, which no survey of a generic market ingredient can establish; it has to come from
 * SKU-level evidence entered by hand.
 */

/**
 * The survey's conclusions, each to the status that already carries the same meaning.
 *
 * `not_intrinsic_but_cross_contact_unverified` is the one worth reading twice. It does not mean the
 * food is safe — it means the allergen is not an ingredient and nobody checked the supplier. That is
 * what `cross_contact_unverified` says, and what the household then decides about.
 */
export const ASSESSMENT_TO_STATUS = {
  confirmed_contains: "contains",
  formulation_or_source_dependent: "may_contain",
  not_intrinsic_but_cross_contact_unverified: "cross_contact_unverified"
} as const

export type SurveyConclusion = keyof typeof ASSESSMENT_TO_STATUS

/** A status that asserts something about the food itself has to be traceable to a source. */
const CLAIMS_ABOUT_THE_FOOD = new Set(["absent", "contains", "may_contain"])

type Row = Record<string, string>

export interface ApplyResult {
  /** The rewritten `food_allergens.csv`, header first. Empty when anything was refused. */
  readonly rows: readonly (readonly string[])[]
  readonly refusals: readonly string[]
  /** How many rows the survey moved off `unknown`. */
  readonly changed: number
  readonly statusCounts: Readonly<Record<string, number>>
}

/**
 * Joins the two codes on a character neither can contain.
 *
 * Written as an escape rather than a literal control byte: a raw one is invisible in the source
 * and survives a careless edit only by luck, and losing it would silently make `("ab", "c")` and
 * `("a", "bc")` the same pair.
 */
function pairKey(foodCode: string, allergenCode: string): string {
  return `${foodCode}\u0001${allergenCode}`
}

export function applyAssessments(
  assessments: readonly Row[],
  allergens: readonly Row[]
): ApplyResult {
  const refusals: string[] = []
  const surveyed = new Map<string, Row>()

  for (const assessment of assessments) {
    const foodCode = (assessment["foodCode"] ?? "").trim()
    const allergenCode = (assessment["allergenCode"] ?? "").trim()
    const conclusion = (assessment["assessment"] ?? "").trim()
    const key = pairKey(foodCode, allergenCode)

    if (foodCode === "" || allergenCode === "") {
      refusals.push(`survey row names no food or allergen: ${JSON.stringify(assessment)}`)
      continue
    }
    if (surveyed.has(key)) {
      refusals.push(`${foodCode}.${allergenCode}: the survey answers this pair twice`)
      continue
    }
    if (!(conclusion in ASSESSMENT_TO_STATUS)) {
      refusals.push(`${foodCode}.${allergenCode}: "${conclusion}" is not a survey conclusion`)
      continue
    }
    surveyed.set(key, assessment)
  }

  const header = ["foodCode", "allergenCode", "status", "provenance"]
  const rows: string[][] = [header]
  const statusCounts: Record<string, number> = {}
  let changed = 0

  for (const row of allergens) {
    const foodCode = (row["foodCode"] ?? "").trim()
    const allergenCode = (row["allergenCode"] ?? "").trim()
    const existingStatus = (row["status"] ?? "").trim()
    const existingProvenance = (row["provenance"] ?? "").trim()
    const assessment = surveyed.get(pairKey(foodCode, allergenCode))

    if (assessment === undefined) {
      refusals.push(`${foodCode}.${allergenCode}: the survey does not cover this pair`)
      continue
    }

    const conclusion = (assessment["assessment"] ?? "").trim() as SurveyConclusion
    const status = ASSESSMENT_TO_STATUS[conclusion]

    // Somebody already concluded something else about this pair. The survey does not get to
    // overrule them silently; a person has to look at the two answers and say which is right.
    if (existingStatus !== "unknown" && existingStatus !== status) {
      refusals.push(
        `${foodCode}.${allergenCode}: the catalog says "${existingStatus}" and the survey says "${status}"`
      )
      continue
    }

    const provenance = resolveProvenance({
      status,
      existingStatus,
      existingProvenance,
      evidenceUrls: (assessment["evidenceUrls"] ?? "").trim(),
      rationale: (assessment["rationale"] ?? "").trim()
    })
    if (provenance === null) {
      refusals.push(
        `${foodCode}.${allergenCode}: "${status}" is a claim about the food and the survey cites nothing`
      )
      continue
    }

    rows.push([foodCode, allergenCode, status, provenance])
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
    if (existingStatus !== status) changed += 1
  }

  if (refusals.length > 0) {
    return { rows: [], refusals, changed: 0, statusCounts: {} }
  }
  return { rows, refusals: [], changed, statusCounts }
}

/**
 * Picks the text that accounts for a status, or `null` when a claim has nothing behind it.
 *
 * A citation already on the row for this same status is the most specific thing available, so it
 * survives. Otherwise a claim about the food takes the survey's sources, and
 * `cross_contact_unverified` takes the survey's reasoning: it owes the reader an explanation of what
 * was and was not established, not a URL, and demanding one would push an author into finding a link
 * that does not say what they need it to say.
 */
function resolveProvenance(input: {
  status: string
  existingStatus: string
  existingProvenance: string
  evidenceUrls: string
  rationale: string
}): string | null {
  if (input.existingStatus === input.status && input.existingProvenance.startsWith("http")) {
    return input.existingProvenance
  }
  if (CLAIMS_ABOUT_THE_FOOD.has(input.status)) {
    return input.evidenceUrls === "" ? null : input.evidenceUrls
  }
  if (input.rationale !== "") return input.rationale
  return input.existingProvenance === "" ? null : input.existingProvenance
}

export function readTable(path: string): Row[] {
  const rows = parseCsv(readFileSync(path, "utf8"))
  const header = rows[0] ?? []
  return rows.slice(1).map((row) => {
    const record: Row = {}
    header.forEach((name, index) => {
      record[name.trim()] = row[index] ?? ""
    })
    return record
  })
}

const USAGE = [
  "Usage:",
  "  npm run catalog:assessments -- apply --dir <bundle> [--dry-run]",
  "",
  "Maps allergen_assessments.csv onto food_allergens.csv. One refusal writes nothing.",
  "`absent` is not reachable from a survey; it needs SKU-level evidence entered by hand."
].join("\n")

if (import.meta.main) {
  const rest = process.argv.slice(3)
  const mode = process.argv[2]
  const flag = (name: string): string | undefined => {
    const index = rest.indexOf(`--${name}`)
    return index === -1 ? undefined : rest[index + 1]
  }
  const directory = flag("dir")
  const dryRun = rest.includes("--dry-run")

  if (mode !== "apply" || directory === undefined) {
    process.stderr.write(`${USAGE}\n`)
    process.exitCode = 1
  } else {
    const result = applyAssessments(
      readTable(join(directory, "allergen_assessments.csv")),
      readTable(join(directory, "food_allergens.csv"))
    )
    if (result.refusals.length > 0) {
      process.stderr.write(`Refused, nothing written. ${result.refusals.length} problems:\n`)
      for (const refusal of result.refusals.slice(0, 20)) {
        process.stderr.write(`  ${refusal}\n`)
      }
      if (result.refusals.length > 20) {
        process.stderr.write(`  … and ${result.refusals.length - 20} more\n`)
      }
      process.exitCode = 1
    } else {
      const counts = Object.entries(result.statusCounts)
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([status, count]) => `${status} ${count}`)
        .join(" | ")
      process.stdout.write(`${result.rows.length - 1} rows: ${counts}\n`)
      process.stdout.write(`${result.changed} moved off unknown\n`)
      if (dryRun) {
        process.stdout.write("Dry run; nothing written.\n")
      } else {
        const target = join(directory, "food_allergens.csv")
        writeFileSync(target, serializeCsv(result.rows), "utf8")
        process.stdout.write(`Wrote ${target}\n`)
        process.stdout.write("Now run: npm run catalog:audit -- " + directory + "\n")
      }
    }
  }
}
