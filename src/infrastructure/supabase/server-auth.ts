import { createClient } from "@supabase/supabase-js"

import type { PublicSupabaseConfig } from "./browser-client.js"

type AuthorizationHeader = readonly string[] | string | undefined

interface AuthUserResponse {
  data: { user: { id: string } | null }
  error: unknown
}

export interface ServerAuthClient {
  auth: {
    getUser(accessToken: string): Promise<AuthUserResponse>
  }
}

export interface VerifiedIdentity {
  userId: string
}

export interface ServerAuthVerifier {
  verify(accessToken: string): Promise<VerifiedIdentity | null>
}

export function parseBearerToken(header: AuthorizationHeader): string | null {
  if (typeof header !== "string") {
    return null
  }

  const match = /^Bearer ([^\s]+)$/iu.exec(header)
  return match?.[1] ?? null
}

export function createServerAuthVerifier(client: ServerAuthClient): ServerAuthVerifier {
  return {
    async verify(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken)
      if (error !== null || data.user === null || data.user.id.trim() === "") {
        return null
      }
      return { userId: data.user.id }
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
) => ServerAuthClient

export function createServerSupabaseAuthVerifier(
  config: PublicSupabaseConfig,
  factory: ServerClientFactory = createClient
): ServerAuthVerifier {
  const client = factory(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  })
  return createServerAuthVerifier(client)
}
