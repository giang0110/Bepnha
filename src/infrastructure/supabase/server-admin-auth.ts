import { createClient } from "@supabase/supabase-js"

import type { PublicSupabaseConfig } from "./browser-client.js"

interface AdminAuthUser {
  readonly id: string
  readonly app_metadata: Record<string, unknown>
  readonly user_metadata: Record<string, unknown>
}

export interface ServerAdminAuthClient {
  readonly auth: {
    readonly getUser: (accessToken: string) => Promise<{
      readonly data: { readonly user: AdminAuthUser | null }
      readonly error: unknown
    }>
  }
}

export interface ServerAdminAuthVerifier {
  readonly verify: (accessToken: string) => Promise<{
    readonly userId: string
    readonly isAdmin: boolean
  } | null>
}

export function createServerAdminAuthVerifier(
  client: ServerAdminAuthClient
): ServerAdminAuthVerifier {
  return {
    async verify(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken)
      if (error !== null || data.user === null || data.user.id.trim() === "") {
        return null
      }
      return { userId: data.user.id, isAdmin: data.user.app_metadata.role === "admin" }
    }
  }
}

type ServerClientFactory = (
  url: string,
  publishableKey: string,
  options: {
    auth: {
      autoRefreshToken: false
      detectSessionInUrl: false
      persistSession: false
    }
  }
) => ServerAdminAuthClient

export function createServerSupabaseAdminAuthVerifier(
  config: PublicSupabaseConfig,
  factory: ServerClientFactory = createClient
): ServerAdminAuthVerifier {
  return createServerAdminAuthVerifier(
    factory(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    })
  )
}
