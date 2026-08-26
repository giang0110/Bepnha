import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { createServerSupabaseAuthVerifier } from "@/infrastructure/supabase/server-auth.js"
import type { Database } from "@/infrastructure/supabase/database.types.js"

function localPublicConfig() {
  const url = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || publishableKey === undefined) {
    throw new Error("Local Supabase public environment is required")
  }
  const parsed = new URL(url)
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("Integration tests accept loopback Supabase only")
  }
  return { url, publishableKey }
}

function newClient(): SupabaseClient<Database> {
  const config = localPublicConfig()
  return createClient<Database>(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
}

describe("local Supabase Auth integration", () => {
  it("signs up, restores identity, signs out/in, and verifies only genuine access tokens", async () => {
    const client = newClient()
    const email = `phase1-auth-${crypto.randomUUID()}@example.test`
    const password = "phase1-local-test-password"

    const signUp = await client.auth.signUp({ email, password })
    expect(signUp.error).toBeNull()
    expect(signUp.data.user?.email).toBe(email)
    expect(signUp.data.session?.access_token).toBeTruthy()

    const initialToken = signUp.data.session?.access_token
    if (initialToken === undefined) throw new Error("Local sign-up did not return a session")
    const profile = await client.from("profiles").select("user_id, locale").single()
    expect(profile.error).toBeNull()
    expect(profile.data).toEqual({ user_id: signUp.data.user?.id, locale: "vi-VN" })

    const verifier = createServerSupabaseAuthVerifier(localPublicConfig())
    await expect(verifier.verify(initialToken)).resolves.toEqual({ userId: signUp.data.user?.id })
    await expect(verifier.verify("forged.phase1.token")).resolves.toBeNull()

    const signOut = await client.auth.signOut()
    expect(signOut.error).toBeNull()
    expect((await client.auth.getSession()).data.session).toBeNull()

    const signIn = await client.auth.signInWithPassword({ email, password })
    expect(signIn.error).toBeNull()
    expect(signIn.data.session?.user.id).toBe(signUp.data.user?.id)
  })
})
