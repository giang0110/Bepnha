import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { parseCsv, serializeCsv } from "./catalog-sheet-csv.ts"

/**
 * One row per food instead of ten.
 *
 * `food_allergens.csv` is 450 rows of status plus 450 of justification, which is a lot of typing for
 * work that is really 45 acts of judgement: you hold one food in mind and decide about it. This
 * turns the table sideways — a food per row, the ten allergens as columns, one reason for the food —
 * and turns it back afterwards.
 *
 * It moves nobody's answer. A blank cell stays `unknown`, and a conclusion without a reason is
 * refused rather than written, because a conclusion nobody can account for is the thing the whole
 * catalog pipeline exists to keep out.
 */

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

const CONCLUSIONS = new Set(["absent", "contains", "may_contain", "cross_contact_unverified"])

export const WORKSHEET_COLUMNS = ["code", "nameVi", "categoryCode", ...ALLERGENS, "reason"] as const

type Row = Record<string, string>

function readTable(path: string): Row[] {
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

export function buildWorksheet(foods: readonly Row[], assessments: readonly Row[]): string[][] {
  const rows: string[][] = [[...WORKSHEET_COLUMNS]]

  for (const food of foods) {
    const code = food["code"] ?? ""
    const own = assessments.filter((row) => row["foodCode"] === code)
    const statuses = ALLERGENS.map((allergen) => {
      const status = own.find((row) => row["allergenCode"] === allergen)?.["status"] ?? ""
      // `unknown` is the absence of an answer, so it shows as a blank waiting to be filled.
      return status === "unknown" ? "" : status
    })

    // Carry a reason forward only when the food already has one shared across its assessments.
    const reasons = new Set(
      own
        .filter((row) => CONCLUSIONS.has(row["status"] ?? ""))
        .map((row) => row["provenance"] ?? "")
    )
    rows.push([
      code,
      food["nameVi"] ?? "",
      food["categoryCode"] ?? "",
      ...statuses,
      reasons.size === 1 ? ([...reasons][0] as string) : ""
    ])
  }

  return rows
}

export interface ApplyResult {
  readonly rows: string[][]
  readonly refusals: readonly string[]
  readonly filled: number
}

/**
 * Writes the worksheet back into `food_allergens.csv` shape, keeping every existing justification
 * for a row the worksheet left alone.
 */
export function applyWorksheet(
  worksheet: readonly Row[],
  assessments: readonly Row[]
): ApplyResult {
  const refusals: string[] = []
  const answers = new Map(worksheet.map((row) => [row["code"] ?? "", row]))
  let filled = 0

  for (const row of worksheet) {
    const code = row["code"] ?? ""
    const reason = (row["reason"] ?? "").trim()
    const concluded = ALLERGENS.filter((allergen) => CONCLUSIONS.has((row[allergen] ?? "").trim()))
    if (concluded.length > 0 && reason === "") {
      refusals.push(`${code}: concludes ${concluded.join(", ")} with no reason`)
    }
    for (const allergen of ALLERGENS) {
      const value = (row[allergen] ?? "").trim()
      if (value !== "" && !CONCLUSIONS.has(value) && value !== "unknown") {
        refusals.push(`${code}.${allergen}: "${value}" is not a status`)
      }
    }
  }
  if (refusals.length > 0) return { rows: [], refusals, filled: 0 }

  const header = ["foodCode", "allergenCode", "status", "provenance"]
  const rows: string[][] = [header]

  for (const assessment of assessments) {
    const code = assessment["foodCode"] ?? ""
    const allergen = assessment["allergenCode"] ?? ""
    const answer = answers.get(code)
    const chosen = (answer?.[allergen] ?? "").trim()

    if (answer === undefined || chosen === "" || chosen === "unknown") {
      rows.push([code, allergen, assessment["status"] ?? "", assessment["provenance"] ?? ""])
      continue
    }

    // An existing citation for this exact conclusion is more specific than the food-wide reason.
    const keepExisting =
      assessment["status"] === chosen && (assessment["provenance"] ?? "").startsWith("http")
    rows.push([
      code,
      allergen,
      chosen,
      keepExisting ? (assessment["provenance"] as string) : (answer["reason"] ?? "").trim()
    ])
    if (assessment["status"] !== chosen) filled += 1
  }

  return { rows, refusals: [], filled }
}

const USAGE = [
  "Usage:",
  "  npm run catalog:allergens -- export --dir <bundle> --out worksheet.csv",
  "  npm run catalog:allergens -- apply  --dir <bundle> --worksheet worksheet.csv",
  "",
  "One row per food, ten allergen columns, one reason. A blank stays unknown;",
  "a conclusion without a reason is refused."
].join("\n")

if (import.meta.main) {
  const [mode, ...rest] = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const index = rest.indexOf(`--${name}`)
    return index === -1 ? undefined : rest[index + 1]
  }
  const directory = flag("dir")

  if ((mode !== "export" && mode !== "apply") || directory === undefined) {
    process.stderr.write(`${USAGE}\n`)
    process.exitCode = 1
  } else if (mode === "export") {
    const out = flag("out")
    if (out === undefined) {
      process.stderr.write(`${USAGE}\n`)
      process.exitCode = 1
    } else {
      const rows = buildWorksheet(
        readTable(join(directory, "foods.csv")),
        readTable(join(directory, "food_allergens.csv"))
      )
      writeFileSync(out, serializeCsv(rows), "utf8")
      process.stdout.write(`Wrote ${rows.length - 1} foods to ${out}\n`)
    }
  } else {
    const worksheet = flag("worksheet")
    if (worksheet === undefined) {
      process.stderr.write(`${USAGE}\n`)
      process.exitCode = 1
    } else {
      const target = join(directory, "food_allergens.csv")
      const result = applyWorksheet(readTable(worksheet), readTable(target))
      if (result.refusals.length > 0) {
        process.stderr.write(
          `Refused, nothing written:\n${result.refusals.map((r) => `  ${r}`).join("\n")}\n`
        )
        process.exitCode = 1
      } else {
        writeFileSync(target, serializeCsv(result.rows), "utf8")
        process.stdout.write(`Updated ${result.filled} assessments in ${target}\n`)
      }
    }
  }
}
