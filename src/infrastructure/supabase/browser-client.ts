import { createClient } from "@supabase/supabase-js"

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

export function createBrowserSupabaseClient<Client = ReturnType<typeof createClient>>(
  config: PublicSupabaseConfig,
  factory: BrowserClientFactory<Client> = createClient as BrowserClientFactory<Client>
): Client {
  assertPublicConfig(config)

  return factory(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  })
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
