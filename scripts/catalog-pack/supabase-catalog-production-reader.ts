import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "../../src/infrastructure/supabase/database.types.ts"
import {
  createCatalogProductionReader,
  type CatalogProductionTable,
  type CatalogReferenceReader,
  type CatalogSelectFilter,
  type CatalogSelectGateway,
  type CatalogSelectRequest
} from "./catalog-production-reader.ts"

interface CatalogSelectQueryResult {
  readonly data: unknown
  readonly error: unknown
}

interface CatalogSelectQuery extends PromiseLike<CatalogSelectQueryResult> {
  readonly eq: (column: string, value: string | number) => CatalogSelectQuery
  readonly in: (column: string, values: readonly (string | number)[]) => CatalogSelectQuery
}

interface CatalogSelectTable {
  readonly select: (columns: string) => CatalogSelectQuery
}

interface CatalogSelectClient {
  readonly from: (table: CatalogProductionTable) => CatalogSelectTable
}

function isScalar(value: CatalogSelectFilter["value"]): value is string | number {
  return typeof value === "string" || typeof value === "number"
}

function applyFilters(
  initial: CatalogSelectQuery,
  request: CatalogSelectRequest
): CatalogSelectQuery | null {
  let query = initial
  for (const filter of request.filters) {
    if (filter.operation === "eq") {
      if (!isScalar(filter.value)) return null
      query = query.eq(filter.column, filter.value)
      continue
    }
    if (isScalar(filter.value)) return null
    query = query.in(filter.column, [...filter.value])
  }
  return query
}

export function createSupabaseCatalogSelectGateway(
  client: SupabaseClient<Database>
): CatalogSelectGateway {
  const selectClient = client as unknown as CatalogSelectClient
  return {
    async select(request) {
      const initial = selectClient.from(request.table).select(request.columns)
      const query = applyFilters(initial, request)
      if (query === null) return { ok: false }
      const { data, error } = await query
      if (error !== null || !Array.isArray(data)) return { ok: false }
      return { ok: true, rows: data as readonly unknown[] }
    }
  }
}

export function createSupabaseCatalogProductionReader(
  client: SupabaseClient<Database>
): CatalogReferenceReader {
  return createCatalogProductionReader(createSupabaseCatalogSelectGateway(client))
}

export function createRuntimeCatalogProductionReader(
  env: NodeJS.ProcessEnv
): CatalogReferenceReader | null {
  const url = env.SUPABASE_URL
  const secretKey = env.SUPABASE_SECRET_KEY
  if (url === undefined || secretKey === undefined || url.length === 0 || secretKey.length === 0) {
    return null
  }

  const client = createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  })
  return createSupabaseCatalogProductionReader(client)
}
