import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, test } from "vitest"

import { createSupabaseCatalogReadRepository } from "@/infrastructure/supabase/supabase-catalog-read-repository.js"
import type { Database } from "@/infrastructure/supabase/database.types.js"

let url: string
let publishableKey: string

beforeAll(() => {
  url = process.env.SUPABASE_URL ?? ""
  publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
  const parsed = new URL(url)
  if (publishableKey === "" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("Catalog integration requires loopback Supabase public configuration")
  }
})

describe("published catalog Data API boundary", () => {
  test("keeps anon closed and authenticated users read-only with draft exact IDs invisible", async () => {
    const anon = createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    })
    const authenticated = createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    })
    const signUp = await authenticated.auth.signUp({
      email: `phase2-catalog-${crypto.randomUUID()}@example.test`,
      password: "phase2-local-test-password"
    })
    expect(signUp.error).toBeNull()

    const anonUnits = await anon.from("units").select("id")
    expect(anonUnits.data).toEqual([])
    const units = await authenticated.from("units").select("code").order("code")
    expect(units.error).toBeNull()
    expect(units.data?.map((row) => row.code)).toContain("g")

    const mutation = await authenticated.from("foods").insert({
      code: "forbidden_food",
      name_vi: "Không được tạo",
      base_dimension: "mass",
      base_unit_id: "70010000-0000-0000-0000-000000000001"
    })
    expect(mutation.error).not.toBeNull()

    const repository = createSupabaseCatalogReadRepository(authenticated)
    await expect(
      repository.getPublishedRecipeCalculation(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002"
      )
    ).resolves.toEqual({ ok: false, reason: "NOT_FOUND" })
  })
})
