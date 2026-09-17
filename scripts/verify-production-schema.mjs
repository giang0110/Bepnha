/* global process, URL */

import { execFile } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const migrationsDirectory = resolve("supabase/migrations")

/**
 * Read-only verification of a Supabase project against the migration chain committed in this
 * repository. It is the executable form of the post-migration checks in
 * `docs/operations/production-readiness.md`: migration history, expected tables and functions, and
 * row level security on every public table.
 *
 * Every statement runs in a read-only session and the connection string is never printed, so the
 * script cannot mutate production and cannot leak the credential into CI logs or a terminal
 * scrollback.
 */

export const CONNECTION_ENV_VARIABLE = "BEPNHA_PRODUCTION_DB_URL"

/** Each query is wrapped by the runner and must stay a plain read. */
export const SCHEMA_QUERIES = {
  migrations: "select version from supabase_migrations.schema_migrations order by version",
  tables: `select c.relname as name,
                  c.relrowsecurity as rls,
                  (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
            order by c.relname`,
  functions: `select p.proname as name
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'
               order by p.proname`
}

/**
 * Derives what the database must look like from the migration files themselves, so the expectation
 * cannot drift away from the repository the way a hand-maintained list would.
 *
 * @param {readonly { name: string, sql: string }[]} files
 */
export function expectedSchemaFromMigrations(files) {
  if (files.length === 0) {
    throw new Error("No migration files found; refusing to verify against an empty expectation")
  }

  const migrations = files.map((file) => {
    const version = file.name.split("_", 1)[0] ?? ""
    if (!/^\d{14}$/u.test(version)) {
      throw new Error(`Migration file name lacks a 14-digit version prefix: ${file.name}`)
    }
    return version
  })

  /** @param {RegExp} pattern */
  function namesMatching(pattern) {
    const names = new Set()
    for (const file of files) {
      for (const match of file.sql.matchAll(pattern)) {
        const name = match[1]
        if (name !== undefined) names.add(name)
      }
    }
    return [...names].sort()
  }

  return {
    migrations: [...migrations].sort(),
    tables: namesMatching(/^create table public\.([a-z_]+)/gimu),
    functions: namesMatching(/^create (?:or replace )?function public\.([a-z_]+)/gimu)
  }
}

export async function readMigrationFiles(directory = migrationsDirectory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()
  return await Promise.all(
    names.map(async (name) => ({ name, sql: await readFile(join(directory, name), "utf8") }))
  )
}

/**
 * @param {{
 *   expected: ReturnType<typeof expectedSchemaFromMigrations>
 *   observed: {
 *     migrations: readonly { version: string }[]
 *     tables: readonly { name: string, rls: boolean, policies: number }[]
 *     functions: readonly { name: string }[]
 *   }
 * }} input
 */
export function verifyProductionSchema({ expected, observed }) {
  /** @type {{ code: string, detail: string }[]} */
  const findings = []
  /** @type {{ code: string, detail: string }[]} */
  const notes = []

  const observedMigrations = observed.migrations.map((row) => row.version)
  if (observedMigrations.join(",") !== expected.migrations.join(",")) {
    findings.push({
      code: "MIGRATION_HISTORY_MISMATCH",
      detail: `expected [${expected.migrations.join(", ")}] but the database reports [${observedMigrations.join(", ")}]`
    })
  }

  /**
   * @param {readonly string[]} expectedNames
   * @param {readonly string[]} observedNames
   * @param {string} kind
   */
  function compareNames(expectedNames, observedNames, kind) {
    const present = new Set(observedNames)
    const wanted = new Set(expectedNames)
    for (const name of expectedNames) {
      if (!present.has(name)) findings.push({ code: `${kind}_MISSING`, detail: `public.${name}` })
    }
    for (const name of observedNames) {
      if (!wanted.has(name)) findings.push({ code: `${kind}_UNEXPECTED`, detail: `public.${name}` })
    }
  }

  compareNames(
    expected.tables,
    observed.tables.map((row) => row.name),
    "TABLE"
  )
  compareNames(
    expected.functions,
    observed.functions.map((row) => row.name),
    "FUNCTION"
  )

  for (const table of observed.tables) {
    if (!table.rls) {
      findings.push({ code: "RLS_DISABLED", detail: `public.${table.name}` })
      continue
    }
    if (table.policies === 0) {
      // Row level security with no policy denies every non-service-role read and write. That is the
      // safe direction and several catalog tables are deliberately in it, so it is reported rather
      // than failed.
      notes.push({ code: "RLS_WITHOUT_POLICY", detail: `public.${table.name}` })
    }
  }

  return { ok: findings.length === 0, findings, notes }
}

/**
 * Splits the connection string into libpq environment variables. Nothing derived from it is ever
 * passed as a command-line argument: argv is visible in the process list and is echoed back in the
 * message of a failed `execFile`, so a URL placed there would leak the database password into any
 * terminal or CI log that saw the failure.
 *
 * @param {string} connectionString
 */
export function connectionEnvironment(connectionString) {
  let url
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error(`${CONNECTION_ENV_VARIABLE} is not a valid postgres connection URL`)
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${CONNECTION_ENV_VARIABLE} must use the postgres:// scheme`)
  }

  /** @type {Record<string, string>} */
  const environment = {
    PGHOST: url.hostname,
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//u, "")) || "postgres",
    // Supabase terminates TLS on the pooler and the direct host alike; never silently downgrade.
    PGSSLMODE: url.searchParams.get("sslmode") ?? "require",
    // A third read-only guard, applied by the server for every session this script opens.
    PGOPTIONS: "-c default_transaction_read_only=on"
  }
  if (url.port !== "") environment.PGPORT = url.port
  if (url.username !== "") environment.PGUSER = decodeURIComponent(url.username)
  if (url.password !== "") environment.PGPASSWORD = decodeURIComponent(url.password)
  return environment
}

/**
 * Both statements must carry `-c`. A bare trailing argument is read by psql as the database name,
 * not as a query, which fails with the query text quoted back as a missing database.
 *
 * @param {string} sql
 */
export function psqlArguments(sql) {
  return [
    "--no-psqlrc",
    "-q",
    "-t",
    "-A",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "set default_transaction_read_only = on",
    "-c",
    `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`
  ]
}

/**
 * @param {Record<string, string>} connection
 * @param {string} sql
 */
async function runReadOnlyQuery(connection, sql) {
  let stdout
  try {
    ;({ stdout } = await execFileAsync("psql", psqlArguments(sql), {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...connection }
    }))
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : ""
    // The cause carries psql's own argv, which by construction holds no part of the credential.
    throw new Error(`psql failed: ${stderr.trim() || "no stderr"}`, { cause: error })
  }
  return JSON.parse(stdout.trim())
}

async function main() {
  const connectionString = process.env[CONNECTION_ENV_VARIABLE]
  if (connectionString === undefined || connectionString === "") {
    throw new Error(
      `Set ${CONNECTION_ENV_VARIABLE} to the target database connection string. Take it from ` +
        "Supabase → Project Settings → Database → Connection string, and do not commit it."
    )
  }

  const connection = connectionEnvironment(connectionString)
  const expected = expectedSchemaFromMigrations(await readMigrationFiles())
  const observed = {
    migrations: await runReadOnlyQuery(connection, SCHEMA_QUERIES.migrations),
    tables: await runReadOnlyQuery(connection, SCHEMA_QUERIES.tables),
    functions: await runReadOnlyQuery(connection, SCHEMA_QUERIES.functions)
  }

  const result = verifyProductionSchema({ expected, observed })

  process.stdout.write(
    `migrations: ${observed.migrations.length}/${expected.migrations.length}\n` +
      `public tables: ${observed.tables.length}/${expected.tables.length}\n` +
      `public functions: ${observed.functions.length}/${expected.functions.length}\n`
  )
  for (const note of result.notes) {
    process.stdout.write(`note ${note.code}: ${note.detail}\n`)
  }
  for (const finding of result.findings) {
    process.stdout.write(`FAIL ${finding.code}: ${finding.detail}\n`)
  }
  process.stdout.write(result.ok ? "PRODUCTION_SCHEMA_MATCHES_REPOSITORY\n" : "SCHEMA_DRIFT\n")

  if (!result.ok) process.exitCode = 1
}

if (import.meta.main) {
  main().catch((error) => {
    // The connection string is never part of a message this script builds; keep it that way by
    // printing only the error text.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
