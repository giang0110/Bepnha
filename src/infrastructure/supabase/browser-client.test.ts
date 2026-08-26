import { describe, expect, it, vi } from "vitest"

import { createBrowserSupabaseClient } from "./browser-client"

describe("createBrowserSupabaseClient", () => {
  it("uses only passed public config and explicit persistent browser auth options", () => {
    const client = { marker: "client" }
    const createClient = vi.fn(() => client)

    expect(
      createBrowserSupabaseClient(
        { url: "https://supabase.test", publishableKey: "public-test-key" },
        createClient
      )
    ).toBe(client)
    expect(createClient).toHaveBeenCalledWith("https://supabase.test", "public-test-key", {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  })

  it("rejects invalid public configuration before creating a client", () => {
    const createClient = vi.fn(() => ({ unexpected: true }))

    expect(() =>
      createBrowserSupabaseClient(
        { url: "file:///private", publishableKey: "public-test-key" },
        createClient
      )
    ).toThrow("Supabase URL must use HTTP(S)")
    expect(createClient).not.toHaveBeenCalled()
  })
})
