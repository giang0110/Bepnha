import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "./database.types.js"

export interface PublicSupabaseConfig {
  publishableKey: string
  url: string
}

interface BrowserAuthOptions {
  auth: {
    autoRefreshToken: true
    detectSessionInUrl: true
    persistSession: true
  }
}

type BrowserClientFactory<Client> = (
  url: string,
  publishableKey: string,
  options: BrowserAuthOptions
) => Client

export function createBrowserSupabaseClient(config: PublicSupabaseConfig): SupabaseClient<Database>
export function createBrowserSupabaseClient<Client>(
  config: PublicSupabaseConfig,
  factory: BrowserClientFactory<Client>
): Client
export function createBrowserSupabaseClient<Client>(
  config: PublicSupabaseConfig,
  factory?: BrowserClientFactory<Client>
): Client | SupabaseClient<Database> {
  assertPublicConfig(config)

  const options: BrowserAuthOptions = {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  }
  return factory === undefined
    ? createClient<Database>(config.url, config.publishableKey, options)
    : factory(config.url, config.publishableKey, options)
}

function assertPublicConfig(config: PublicSupabaseConfig): void {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(config.url)
  } catch {
    throw new Error("Supabase URL must use HTTP(S)")
  }

  if (!(["http:", "https:"] as const).includes(parsedUrl.protocol as "http:" | "https:")) {
    throw new Error("Supabase URL must use HTTP(S)")
  }
  if (config.publishableKey.trim() === "") {
    throw new Error("Supabase publishable key is required")
  }
}
