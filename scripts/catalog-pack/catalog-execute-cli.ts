import { randomUUID } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

import { createAdminHttpGateway } from "./catalog-admin-http-gateway.ts"
import {
  EMPTY_JOURNAL,
  executeMutationPlan,
  orderOperations,
  type MutationExecutionJournal
} from "./catalog-mutation-executor.ts"
import type { CatalogMutationPlanV1 } from "./catalog-mutation-types.ts"

/**
 * Applies a Phase 9C plan to production, one admin command at a time.
 *
 * Everything that decides what happens was settled earlier: 9A said the pack is `ready`, 9B resolved
 * every reference against a production snapshot, 9C put the operations in a dependency-safe order.
 * This step only carries them out, and its whole job is to be interruptible without leaving a mess.
 *
 * The journal is written after every allocation and every completion, so a crash, a lost network, or
 * a Ctrl-C leaves a file that `--resume` can continue from. Without it a half-finished run is
 * unrecoverable: the plan's creates are not idempotent, and a second run from the start would make a
 * second copy of every food it had already created.
 */

const USAGE = [
  "Usage:",
  "  npm run catalog:execute -- --plan <plan.json> --journal <journal.json> [--resume] [--dry-run]",
  "",
  "Applies a Phase 9C plan through POST /api/admin/catalog.",
  "",
  "Environment:",
  "  BEPNHA_ADMIN_ENDPOINT      full URL of the admin endpoint",
  "  BEPNHA_ADMIN_ACCESS_TOKEN  Supabase access token for an admin user",
  "",
  "--dry-run prints the order and touches neither the network nor the journal.",
  "--resume continues a journal from an interrupted run; without it an existing journal is refused."
].join("\n")

export interface ExecuteCliArgs {
  readonly plan: string
  readonly journal: string
  readonly resume: boolean
  readonly dryRun: boolean
}

export function parseExecuteArgs(
  argv: readonly string[]
): { ok: true; value: ExecuteCliArgs } | { ok: false; message: string } {
  let plan: string | null = null
  let journal: string | null = null
  let resume = false
  let dryRun = false

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--resume") {
      resume = true
      continue
    }
    if (token === "--dry-run") {
      dryRun = true
      continue
    }
    if (token !== "--plan" && token !== "--journal") return { ok: false, message: USAGE }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) return { ok: false, message: USAGE }
    if (token === "--plan") {
      if (plan !== null) return { ok: false, message: USAGE }
      plan = value
    } else {
      if (journal !== null) return { ok: false, message: USAGE }
      journal = value
    }
    index += 1
  }

  if (plan === null || journal === null) return { ok: false, message: USAGE }
  return { ok: true, value: { plan, journal, resume, dryRun } }
}

export interface ExecuteEnvironment {
  readonly endpoint: string
  readonly accessToken: string
}

/**
 * Reads the two secrets the run needs, refusing rather than falling back.
 *
 * A missing token must not quietly become an unauthenticated request: the endpoint would answer 401
 * for every operation and the journal would fill with failures that look like a production problem.
 */
export function readExecuteEnvironment(
  env: NodeJS.ProcessEnv
): { ok: true; value: ExecuteEnvironment } | { ok: false; message: string } {
  const endpoint = env.BEPNHA_ADMIN_ENDPOINT
  const accessToken = env.BEPNHA_ADMIN_ACCESS_TOKEN
  if (endpoint === undefined || endpoint === "") {
    return { ok: false, message: "BEPNHA_ADMIN_ENDPOINT is not set" }
  }
  if (accessToken === undefined || accessToken === "") {
    return { ok: false, message: "BEPNHA_ADMIN_ACCESS_TOKEN is not set" }
  }
  if (!endpoint.startsWith("https://")) {
    return { ok: false, message: "BEPNHA_ADMIN_ENDPOINT must be https" }
  }
  return { ok: true, value: { endpoint, accessToken } }
}

export function readJournal(
  path: string,
  plan: CatalogMutationPlanV1,
  resume: boolean
): { ok: true; value: MutationExecutionJournal | undefined } | { ok: false; message: string } {
  let contents: string
  try {
    contents = readFileSync(path, "utf8")
  } catch {
    return { ok: true, value: undefined }
  }
  if (!resume) {
    return {
      ok: false,
      message: `${path} already exists; pass --resume to continue it, or choose another path`
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    return { ok: false, message: `${path} is not valid JSON` }
  }
  const journal = parsed as MutationExecutionJournal
  if (journal.planInputSha256 !== plan.inputSha256) {
    return { ok: false, message: `${path} belongs to a different plan` }
  }
  return { ok: true, value: journal }
}

function describe(plan: CatalogMutationPlanV1): string {
  const ordered = orderOperations(plan.operations)
  if (!ordered.ok)
    return `plan cannot be ordered: ${ordered.failure.code} ${ordered.failure.detail}`
  const byKind: Record<string, number> = {}
  for (const operation of plan.operations) {
    byKind[operation.kind] = (byKind[operation.kind] ?? 0) + 1
  }
  const lines = [
    `${plan.operations.length} operations, in order:`,
    ...Object.entries(byKind)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([kind, count]) => `  ${String(count).padStart(4)}  ${kind}`)
  ]
  return lines.join("\n")
}

if (import.meta.main) {
  const parsed = parseExecuteArgs(process.argv.slice(2))
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`)
    process.exitCode = 1
  } else {
    const plan = JSON.parse(readFileSync(parsed.value.plan, "utf8")) as CatalogMutationPlanV1
    process.stdout.write(`${describe(plan)}\n`)

    if (parsed.value.dryRun) {
      process.stdout.write("Dry run; nothing sent and no journal written.\n")
    } else {
      const environment = readExecuteEnvironment(process.env)
      const existing = readJournal(parsed.value.journal, plan, parsed.value.resume)
      if (!environment.ok) {
        process.stderr.write(`${environment.message}\n`)
        process.exitCode = 1
      } else if (!existing.ok) {
        process.stderr.write(`${existing.message}\n`)
        process.exitCode = 1
      } else {
        const persist = (journal: MutationExecutionJournal) => {
          writeFileSync(parsed.value.journal, `${JSON.stringify(journal, null, 2)}\n`, "utf8")
        }
        persist(existing.value ?? EMPTY_JOURNAL(plan.inputSha256))

        const result = await executeMutationPlan({
          plan,
          ...(existing.value === undefined ? {} : { journal: existing.value }),
          allocateUuid: randomUUID,
          runOperation: createAdminHttpGateway({
            endpoint: environment.value.endpoint,
            accessToken: environment.value.accessToken,
            fetch: globalThis.fetch
          }),
          onJournalChange: persist
        })

        persist(result.journal)
        process.stdout.write(
          `executed ${result.executed.length}, already done ${result.skipped.length}\n`
        )
        if (!result.ok && result.failure !== null) {
          process.stderr.write(
            `FAILED ${result.failure.code} at ${result.failure.operationId ?? "-"}: ${result.failure.detail}\n`
          )
          process.stderr.write(
            `Journal kept at ${parsed.value.journal}. Check production before resuming.\n`
          )
          process.exitCode = 1
        } else {
          process.stdout.write("Plan applied.\n")
        }
      }
    }
  }
}
