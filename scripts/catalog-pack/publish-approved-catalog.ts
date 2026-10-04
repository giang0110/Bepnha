import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { connectionEnvironment } from "../verify-production-schema.mjs"
import { createAdminHttpGateway } from "./catalog-admin-http-gateway.ts"
import { EMPTY_JOURNAL } from "./catalog-mutation-executor.ts"
import type { CatalogMutationPlanV1 } from "./catalog-mutation-types.ts"
import {
  APPROVED_PACK_SHA256,
  APPROVED_SNAPSHOT_SHA256,
  assertApprovedPlan,
  assertTokenLifetime,
  decodeCheckpoint,
  encodeCheckpoint,
  executeWithCheckpoints
} from "./catalog-publication-actions.ts"
import type { PublicationCheckpoint } from "./catalog-publication-actions.ts"
import { runCatalogPlanCli } from "./catalog-mutation-cli.ts"
import { createCatalogProductionReader } from "./catalog-production-reader.ts"
import { runCatalogResolveCli } from "./catalog-production-resolver-cli.ts"

const ENDPOINT = "https://bepnhatoi.vercel.app/api/admin/catalog"
const PROJECT_REF = "vkrqzwlpneocgjwhqbsl"
const PLAN_CHECK = "Approved catalog publication plan"
const JOURNAL_CHECK = "Approved catalog publication journal"

interface Diagnostic {
  readonly catalogReferenceRows: Readonly<Record<string, readonly Record<string, unknown>[]>>
  readonly activePublishedMealCount: number
  readonly publishedQuantityPolicyCount: number
  readonly referencedFactsMissingPolicyCount: number
  readonly currentPriceBooks: readonly {
    regionCode: string
    bookVersion: number
    purchaseContractVersion: string
    priceCount: number
    fixedPackPriceCount: number
    looseSalePriceCount: number
    missingRequiredPurchaseTerms: number
  }[]
}

interface StoredCheckpoint extends PublicationCheckpoint {
  readonly planCheckId: number
  readonly format: "approved-catalog-publication-v1"
}

function diagnostic(connectionString: string): Diagnostic {
  try {
    const connection = connectionEnvironment(connectionString)
    const validHost =
      connection.PGHOST === `db.${PROJECT_REF}.supabase.co` ||
      (connection.PGHOST!.endsWith(".pooler.supabase.com") &&
        connection.PGUSER === `postgres.${PROJECT_REF}`)
    if (
      !validHost ||
      (connection.PGPORT ?? "5432") !== "5432" ||
      !["require", "verify-ca", "verify-full"].includes(connection.PGSSLMODE!)
    )
      throw new Error()
    return JSON.parse(
      execFileSync(
        "psql",
        [
          "--no-psqlrc",
          "-q",
          "-t",
          "-A",
          "-v",
          "ON_ERROR_STOP=1",
          "--file",
          "scripts/diagnose-planner-catalog.sql"
        ],
        {
          env: { ...process.env, ...connection },
          encoding: "utf8",
          timeout: 30_000,
          stdio: ["ignore", "pipe", "pipe"]
        }
      )
    ) as Diagnostic
  } catch {
    throw new Error("PRODUCTION_DIAGNOSTIC_FAILED")
  }
}

async function main(): Promise<void> {
  if (process.env.GITHUB_REPOSITORY !== "giang0110/Bepnha") throw new Error("REPOSITORY_MISMATCH")
  const publish = process.env.PUBLICATION_PUBLISH === "true"
  if (publish && process.env.GITHUB_REF !== "refs/heads/main") throw new Error("MAIN_REQUIRED")
  const token = process.env.BEPNHA_ADMIN_ACCESS_TOKEN
  const githubToken = process.env.PUBLICATION_CHECK_TOKEN
  if (!token) throw new Error("BEPNHA_ADMIN_ACCESS_TOKEN_MISSING")
  if (!githubToken) throw new Error("CHECK_TOKEN_MISSING")
  const directory = process.env.PUBLICATION_DIRECTORY
  if (!directory) throw new Error("PUBLICATION_DIRECTORY_MISSING")
  mkdirSync(directory, { recursive: true })
  // Invalid command after authentication is a read-only check of the deployed admin guard.
  const preflight = await fetch(ENDPOINT, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "check_admin_token", input: {} })
  })
  const preflightBody = (await preflight.json()) as { error?: string }
  if (preflight.status !== 400 || preflightBody.error !== "VALIDATION_FAILED") {
    throw new Error(
      `ADMIN_PREFLIGHT_FAILED ${preflight.status} ${preflightBody.error ?? "UNKNOWN"}`
    )
  }
  console.log("Admin token verified; no catalog writes during preflight.")
  assertTokenLifetime(token)
  const base = "https://api.github.com/repos/giang0110/Bepnha/check-runs"
  let lastWriteAt = 0
  async function github(
    method: string,
    url: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    if (method !== "GET") {
      const wait = Math.max(0, 1200 - (Date.now() - lastWriteAt))
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      lastWriteAt = Date.now()
    }
    const response = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!response.ok) throw new Error(`CHECK_STORAGE_FAILED ${response.status}`)
    return (await response.json()) as Record<string, unknown>
  }
  async function createCheck(name: string, text: string): Promise<number> {
    const check = await github("POST", base, {
      name,
      head_sha: process.env.GITHUB_SHA,
      status: "completed",
      conclusion: "neutral",
      external_id: process.env.GITHUB_RUN_ID,
      output: {
        title: name,
        summary: "Approved catalog metadata only; no credentials or household profiles.",
        text
      }
    })
    if (typeof check.id !== "number") throw new Error("CHECK_STORAGE_INVALID")
    return check.id
  }
  async function readCheck(
    id: number,
    name: string
  ): Promise<{ value: unknown; headSha: string; externalId: string }> {
    const check = await github("GET", `${base}/${id}`)
    if (check.name !== name) throw new Error("CHECK_NAME_MISMATCH")
    const app = check.app as { slug?: string }
    if (
      app?.slug !== "github-actions" ||
      typeof check.head_sha !== "string" ||
      !/^[0-9a-f]{40}$/u.test(check.head_sha) ||
      typeof check.external_id !== "string" ||
      !/^\d+$/u.test(check.external_id)
    )
      throw new Error("CHECK_PROVENANCE_INVALID")
    const output = check.output as { text?: string }
    if (typeof output?.text !== "string") throw new Error("CHECK_OUTPUT_MISSING")
    return {
      value: decodeCheckpoint(output.text),
      headSha: check.head_sha,
      externalId: check.external_id
    }
  }
  const packPath = join(directory, "pack.json")
  if (createHash("sha256").update(readFileSync(packPath)).digest("hex") !== APPROVED_PACK_SHA256) {
    throw new Error("APPROVED_PACK_MISMATCH")
  }
  const before = diagnostic(process.env.BEPNHA_PRODUCTION_DB_URL ?? "")
  writeFileSync(
    join(directory, "before.json"),
    JSON.stringify({ projectRef: PROJECT_REF, ...before })
  )
  let plan: CatalogMutationPlanV1
  let state: StoredCheckpoint
  let checkpointId: number
  const resumeId = process.env.PUBLICATION_RESUME_CHECK_ID ?? ""
  if (resumeId !== "") {
    if (!/^\d+$/u.test(resumeId)) throw new Error("RESUME_CHECK_INVALID")
    const journalCheck = await readCheck(Number(resumeId), JOURNAL_CHECK)
    state = journalCheck.value as StoredCheckpoint
    if (
      state.format !== "approved-catalog-publication-v1" ||
      !Number.isSafeInteger(state.planCheckId) ||
      state.journal?.planInputSha256 !== APPROVED_PACK_SHA256
    )
      throw new Error("RESUME_CHECK_INVALID")
    const planCheck = await readCheck(state.planCheckId, PLAN_CHECK)
    if (
      planCheck.headSha !== journalCheck.headSha ||
      planCheck.externalId !== journalCheck.externalId
    )
      throw new Error("CHECK_PAIR_MISMATCH")
    plan = planCheck.value as CatalogMutationPlanV1
    checkpointId = Number(resumeId)
  } else {
    const reader = createCatalogProductionReader({
      select(request) {
        const rows = before.catalogReferenceRows[request.table]
        if (!rows) return Promise.resolve({ ok: false })
        return Promise.resolve({
          ok: true,
          rows: rows.filter((row) =>
            request.filters.every((filter) =>
              filter.operation === "eq"
                ? row[filter.column] === filter.value
                : Array.isArray(filter.value) && filter.value.includes(row[filter.column])
            )
          )
        })
      }
    })
    const manifestPath = join(directory, "manifest.json")
    const planPath = join(directory, "plan.json")
    if (
      (await runCatalogResolveCli(["--input", packPath, "--output", manifestPath], {
        createReader: () => reader,
        env: {},
        stdout() {},
        stderr() {}
      })) !== 0
    )
      throw new Error("PRODUCTION_RESOLVE_FAILED")
    if (
      runCatalogPlanCli(["--input", packPath, "--manifest", manifestPath, "--output", planPath], {
        stdout() {},
        stderr() {}
      }) !== 0
    )
      throw new Error("PRODUCTION_PLAN_FAILED")
    plan = JSON.parse(readFileSync(planPath, "utf8")) as CatalogMutationPlanV1
    assertApprovedPlan(plan)
    if (plan.productionSnapshotSha256 !== APPROVED_SNAPSHOT_SHA256)
      throw new Error("PRODUCTION_SNAPSHOT_CHANGED")
    // Also inspect earlier workflow commits: main advancing must not permit a second journal.
    const history = await github(
      "GET",
      "https://api.github.com/repos/giang0110/Bepnha/actions/workflows/production-catalog-publication.yml/runs?branch=main&per_page=100"
    )
    if (
      typeof history.total_count !== "number" ||
      history.total_count > 100 ||
      !Array.isArray(history.workflow_runs)
    )
      throw new Error("PUBLICATION_HISTORY_UNAVAILABLE_USE_RESUME")
    const commits = new Set([
      process.env.GITHUB_SHA,
      ...history.workflow_runs.map((run) => (run as { head_sha: string }).head_sha)
    ])
    for (const sha of commits) {
      if (typeof sha !== "string" || !/^[0-9a-f]{40}$/u.test(sha))
        throw new Error("PUBLICATION_HISTORY_INVALID")
      const existing = await github(
        "GET",
        `https://api.github.com/repos/giang0110/Bepnha/commits/${sha}/check-runs?check_name=${encodeURIComponent(JOURNAL_CHECK)}&filter=all&per_page=100`
      )
      if (!Array.isArray(existing.check_runs)) throw new Error("PUBLICATION_HISTORY_INVALID")
      if (existing.check_runs.length > 0) throw new Error("EXISTING_JOURNAL_USE_RESUME")
    }
    const planCheckId = await createCheck(PLAN_CHECK, encodeCheckpoint(plan))
    state = {
      format: "approved-catalog-publication-v1",
      planCheckId,
      journal: EMPTY_JOURNAL(plan.inputSha256),
      pendingOperationId: null
    }
    checkpointId = await createCheck(JOURNAL_CHECK, encodeCheckpoint(state))
  }
  assertApprovedPlan(plan)
  if (
    resumeId !== "" &&
    state.journal.completed.length === 0 &&
    state.pendingOperationId === null
  ) {
    const resumeManifest = join(directory, "resume-manifest.json")
    const reader = createCatalogProductionReader({
      select(request) {
        const rows = before.catalogReferenceRows[request.table]
        if (!rows) return Promise.resolve({ ok: false })
        return Promise.resolve({
          ok: true,
          rows: rows.filter((row) =>
            request.filters.every((filter) =>
              filter.operation === "eq"
                ? row[filter.column] === filter.value
                : Array.isArray(filter.value) && filter.value.includes(row[filter.column])
            )
          )
        })
      }
    })
    if (
      (await runCatalogResolveCli(["--input", packPath, "--output", resumeManifest], {
        createReader: () => reader,
        env: {},
        stdout() {},
        stderr() {}
      })) !== 0
    )
      throw new Error("PRODUCTION_SNAPSHOT_CHANGED")
    const manifest = JSON.parse(readFileSync(resumeManifest, "utf8")) as {
      productionSnapshotSha256?: string
    }
    if (manifest.productionSnapshotSha256 !== APPROVED_SNAPSHOT_SHA256)
      throw new Error("PRODUCTION_SNAPSHOT_CHANGED")
  }
  writeFileSync(join(directory, "plan.json"), JSON.stringify(plan, null, 2))
  console.log(`Approved plan: ${plan.operations.length} operations; checkpoint ${checkpointId}.`)
  if (!publish) {
    console.log("Read-only preparation complete; no catalog writes.")
    return
  }
  let lastText = ""
  const checkpoint = async (value: PublicationCheckpoint): Promise<void> => {
    state = { ...state, ...value }
    writeFileSync(join(directory, "checkpoint.json"), JSON.stringify(state, null, 2))
    const text = encodeCheckpoint(state)
    if (text === lastText) return
    await github("PATCH", `${base}/${checkpointId}`, {
      output: {
        title: JOURNAL_CHECK,
        summary: `Completed ${value.journal.completed.length}/377; pending ${value.pendingOperationId ?? "none"}.`,
        text
      }
    })
    lastText = text
    console.log(
      `Checkpoint ${checkpointId}: ${value.journal.completed.length}/377; pending ${value.pendingOperationId ?? "none"}`
    )
  }
  const gateway = createAdminHttpGateway({
    endpoint: ENDPOINT,
    accessToken: token,
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" })
  })
  const result = await executeWithCheckpoints({
    plan,
    journal: state.journal,
    pendingOperationId: state.pendingOperationId,
    allocateUuid: randomUUID,
    runOperation: gateway,
    onJournalChange: (journal) => {
      writeFileSync(join(directory, "journal.json"), JSON.stringify(journal, null, 2))
    },
    checkpoint
  })
  if (!result.ok)
    throw new Error(
      `CATALOG_OPERATION_FAILED ${result.failure?.operationId} ${result.failure?.detail}`
    )
  const after = diagnostic(process.env.BEPNHA_PRODUCTION_DB_URL ?? "")
  writeFileSync(
    join(directory, "after.json"),
    JSON.stringify({ projectRef: PROJECT_REF, ...after })
  )
  const book = after.currentPriceBooks.find((book) => book.regionCode === "vn_baseline")
  if (
    result.journal.completed.length !== 377 ||
    after.activePublishedMealCount !== 48 ||
    after.publishedQuantityPolicyCount !== 45 ||
    after.referencedFactsMissingPolicyCount !== 0 ||
    book?.bookVersion !== 4 ||
    book.purchaseContractVersion !== "purchase-v2" ||
    book.priceCount !== 45 ||
    book.fixedPackPriceCount !== 45 ||
    book.looseSalePriceCount !== 0 ||
    book.missingRequiredPurchaseTerms !== 0
  ) {
    throw new Error("POST_PUBLICATION_CHECK_FAILED")
  }
  await github("PATCH", `${base}/${checkpointId}`, {
    status: "completed",
    conclusion: "success",
    output: {
      title: JOURNAL_CHECK,
      summary:
        "377/377 completed; 48 meals, 45 policies, no missing policies, price book v4 verified.",
      text: encodeCheckpoint(state)
    }
  })
  await createCheck(
    "Production catalog publication verification",
    encodeCheckpoint({ projectRef: PROJECT_REF, ...after })
  )
  console.log("Publication verified: 377/377 operations; 48 meals; 45 policies; price book v4.")
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    const message = error instanceof Error ? error.message : "CATALOG_PUBLICATION_FAILED"
    // Native annotations stay accessible when the runner log storage is unavailable to the agent.
    console.error(
      `::error::${message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`
    )
    process.exitCode = 1
  }
}
