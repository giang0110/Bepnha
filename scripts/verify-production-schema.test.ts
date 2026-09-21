// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  CONNECTION_ENV_VARIABLE,
  SCHEMA_QUERIES,
  connectionEnvironment,
  expectedSchemaFromMigrations,
  psqlArguments,
  readMigrationFiles,
  standaloneSql,
  verifyProductionSchema
} from "./verify-production-schema.mjs"

const migrations = [
  {
    name: "20260825000000_phase_0_security_baseline.sql",
    sql: [
      "create table public.profiles (id uuid primary key);",
      "alter table public.profiles enable row level security;",
      "create function public.save_household_setup() returns void as $$ $$ language sql;",
      "create table private.audit_state (id uuid primary key);",
      "create function private.assert_catalog_admin() returns void as $$ $$ language sql;"
    ].join("\n")
  },
  {
    name: "20260826000000_phase_1_household.sql",
    sql: [
      "create table public.households (id uuid primary key);",
      "create or replace function public.save_household_setup() returns void as $$ $$ language sql;"
    ].join("\n")
  }
]

const expected = expectedSchemaFromMigrations(migrations)

function observed(
  overrides: Partial<Parameters<typeof verifyProductionSchema>[0]["observed"]> = {}
) {
  return {
    migrations: [{ version: "20260825000000" }, { version: "20260826000000" }],
    tables: [
      { name: "households", rls: true, policies: 2 },
      { name: "profiles", rls: true, policies: 3 }
    ],
    functions: [{ name: "save_household_setup" }],
    ...overrides
  }
}

describe("expectedSchemaFromMigrations", () => {
  it("derives the expectation from the migration files rather than a maintained list", () => {
    expect(expected).toEqual({
      migrations: ["20260825000000", "20260826000000"],
      tables: ["households", "profiles"],
      functions: ["save_household_setup"]
    })
  })

  it("ignores the private schema, which PostgREST does not expose", () => {
    expect(expected.tables).not.toContain("audit_state")
    expect(expected.functions).not.toContain("assert_catalog_admin")
  })

  it("counts a replaced function once", () => {
    expect(expected.functions).toEqual(["save_household_setup"])
  })

  it("refuses an empty migration set instead of trivially passing", () => {
    expect(() => expectedSchemaFromMigrations([])).toThrow(/empty expectation/iu)
  })

  it("rejects a migration file without a version prefix", () => {
    expect(() => expectedSchemaFromMigrations([{ name: "adhoc.sql", sql: "" }])).toThrow(
      /14-digit version/iu
    )
  })

  it("matches the thirteen migrations committed to this repository", async () => {
    const repository = expectedSchemaFromMigrations(await readMigrationFiles())

    expect(repository.migrations).toHaveLength(13)
    expect(repository.migrations[0]).toBe("20260825000000")
    expect(repository.tables).toHaveLength(40)
    expect(repository.functions).toHaveLength(22)
  })
})

describe("verifyProductionSchema", () => {
  it("passes when the database is exactly the repository's migration chain", () => {
    expect(verifyProductionSchema({ expected, observed: observed() })).toEqual({
      ok: true,
      findings: [],
      notes: []
    })
  })

  it("fails a partially applied migration chain", () => {
    const result = verifyProductionSchema({
      expected,
      observed: observed({ migrations: [{ version: "20260825000000" }] })
    })

    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual({
      code: "MIGRATION_MISSING",
      detail: "20260826000000"
    })
  })

  it("fails a database carrying a migration this repository does not have", () => {
    const result = verifyProductionSchema({
      expected,
      observed: observed({
        migrations: [
          { version: "20260825000000" },
          { version: "20260826000000" },
          { version: "20260930000000" }
        ]
      })
    })

    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual({
      code: "MIGRATION_UNEXPECTED",
      detail: "20260930000000"
    })
  })

  it("reports a missing table and an unexpected leftover table separately", () => {
    const result = verifyProductionSchema({
      expected,
      observed: observed({
        tables: [
          { name: "households", rls: true, policies: 2 },
          { name: "launch_fixtures", rls: true, policies: 1 }
        ]
      })
    })

    expect(result.findings).toContainEqual({ code: "TABLE_MISSING", detail: "public.profiles" })
    expect(result.findings).toContainEqual({
      code: "TABLE_UNEXPECTED",
      detail: "public.launch_fixtures"
    })
  })

  it("reports a missing rpc", () => {
    const result = verifyProductionSchema({ expected, observed: observed({ functions: [] }) })

    expect(result.findings).toContainEqual({
      code: "FUNCTION_MISSING",
      detail: "public.save_household_setup"
    })
  })

  it("fails a public table with row level security switched off", () => {
    const result = verifyProductionSchema({
      expected,
      observed: observed({
        tables: [
          { name: "households", rls: true, policies: 2 },
          { name: "profiles", rls: false, policies: 3 }
        ]
      })
    })

    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual({ code: "RLS_DISABLED", detail: "public.profiles" })
  })

  it("notes but does not fail a deny-all table, because no policy denies rather than exposes", () => {
    const result = verifyProductionSchema({
      expected,
      observed: observed({
        tables: [
          { name: "households", rls: true, policies: 2 },
          { name: "profiles", rls: true, policies: 0 }
        ]
      })
    })

    expect(result.ok).toBe(true)
    expect(result.notes).toEqual([{ code: "RLS_WITHOUT_POLICY", detail: "public.profiles" }])
  })
})

describe("read-only and credential handling", () => {
  it.each(Object.entries(SCHEMA_QUERIES))("keeps the %s query free of any write", (_name, sql) => {
    expect(sql).not.toMatch(
      /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|copy)\b/iu
    )
  })

  it("reads only catalogue relations, never application rows", () => {
    const sources = Object.values(SCHEMA_QUERIES).join("\n")
    expect(sources).toMatch(/pg_class|pg_proc|pg_policy|schema_migrations/u)
    expect(sources).not.toMatch(/\bpublic\.(?!_)/u)
  })

  it("carries the credential in libpq environment variables, never on the command line", () => {
    const environment = connectionEnvironment(
      "postgres://postgres.abc:s3cr3t@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
    )

    expect(environment.PGPASSWORD).toBe("s3cr3t")
    expect(environment.PGHOST).toBe("aws-0-ap-southeast-1.pooler.supabase.com")
    expect(environment.PGPORT).toBe("5432")
    expect(environment.PGUSER).toBe("postgres.abc")
    expect(environment.PGDATABASE).toBe("postgres")
  })

  it("requires TLS unless the connection string names another mode", () => {
    expect(connectionEnvironment("postgres://u:p@host:5432/postgres").PGSSLMODE).toBe("require")
    expect(
      connectionEnvironment("postgres://u:p@host:5432/postgres?sslmode=verify-full").PGSSLMODE
    ).toBe("verify-full")
  })

  it("asks the server to refuse writes for the whole session", () => {
    expect(connectionEnvironment("postgres://u:p@host:5432/postgres").PGOPTIONS).toBe(
      "-c default_transaction_read_only=on"
    )
  })

  it("decodes a percent-encoded password rather than sending it literally", () => {
    expect(connectionEnvironment("postgres://u:p%40ss%3Aword@host:5432/postgres").PGPASSWORD).toBe(
      "p@ss:word"
    )
  })

  it("marks every statement with -c, so psql never reads one as a database name", () => {
    const argv = psqlArguments(SCHEMA_QUERIES.migrations)
    const statements = argv.filter(
      (argument) => !argument.startsWith("-") && argument !== "ON_ERROR_STOP=1"
    )

    expect(statements).toHaveLength(2)
    for (const statement of statements) {
      expect(argv[argv.indexOf(statement) - 1]).toBe("-c")
    }
  })

  it("puts the session into read-only mode before it reads anything", () => {
    const argv = psqlArguments(SCHEMA_QUERIES.tables)

    expect(argv).toContain("set default_transaction_read_only = on")
    expect(argv.indexOf("set default_transaction_read_only = on")).toBeLessThan(
      argv.findIndex((argument) => argument.startsWith("select coalesce"))
    )
  })

  it("passes no part of the connection string on the command line", () => {
    const argv = psqlArguments(SCHEMA_QUERIES.functions).join(" ")

    expect(argv).not.toMatch(/postgres:\/\/|@|password/iu)
  })

  it.each([
    ["a non-url", "not-a-url"],
    ["a wrong scheme", "https://vkrqzwlpneocgjwhqbsl.supabase.co"]
  ])("refuses %s instead of guessing a target", (_name, value) => {
    expect(() => connectionEnvironment(value)).toThrow(new RegExp(CONNECTION_ENV_VARIABLE, "u"))
  })
})

describe("standaloneSql", () => {
  const sql = standaloneSql(expected)

  it("inlines the expectation so the statement needs nothing but a SQL editor", () => {
    expect(sql).toContain("('20260825000000'), ('20260826000000')")
    expect(sql).toContain("('households'), ('profiles')")
    expect(sql).toContain("('save_household_setup')")
  })

  it("reports the same verdict strings as the psql path", () => {
    expect(sql).toContain("PRODUCTION_SCHEMA_MATCHES_REPOSITORY")
    expect(sql).toContain("SCHEMA_DRIFT")
  })

  it("covers the same finding codes as the psql path", () => {
    for (const code of [
      "MIGRATION_MISSING",
      "MIGRATION_UNEXPECTED",
      "TABLE_MISSING",
      "TABLE_UNEXPECTED",
      "FUNCTION_MISSING",
      "FUNCTION_UNEXPECTED",
      "RLS_DISABLED",
      "RLS_WITHOUT_POLICY"
    ]) {
      expect(sql).toContain(code)
    }
  })

  it("stays a single read, so pasting it into a SQL editor cannot change anything", () => {
    expect(sql.trimStart().startsWith("with ")).toBe(true)
    expect(sql).not.toMatch(
      /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|copy)\b/iu
    )
  })

  it("refuses to inline an identifier outside the derived character set", () => {
    expect(() =>
      standaloneSql({ ...expected, tables: ["households'; drop table households; --"] })
    ).toThrow(/unexpected identifier/iu)
  })
})
