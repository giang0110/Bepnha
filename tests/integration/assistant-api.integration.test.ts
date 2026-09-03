import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { beforeAll, describe, expect, test, vi } from "vitest"

import type { MealAssistantPort } from "@/application/assistant/meal-assistant.js"
import { createAssistantHttpHandler } from "@/infrastructure/server/assistant-http.js"
import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher.js"
import { createPlannerHttpHandlers } from "@/infrastructure/server/planner-http.js"
import { createSupabaseAssistantContextRepository } from "@/infrastructure/server/supabase-assistant-context-repository.js"
import { createSupabasePlannerInputLoader } from "@/infrastructure/server/supabase-planner-input-loader.js"
import {
  createSupabasePlannerRepository,
  type PlannerRpcClient
} from "@/infrastructure/server/supabase-planner-repository.js"
import type { Database } from "@/infrastructure/supabase/database.types.js"
import { createServerAuthVerifier } from "@/infrastructure/supabase/server-auth.js"
import { createSupabasePantryRepository } from "@/infrastructure/supabase/supabase-pantry-repository.js"
import { createSupabaseShoppingListRepository } from "@/infrastructure/supabase/supabase-shopping-list-repository.js"

const calculationDate = "2026-08-26"
const assistantWeekStart = "2026-09-14"
const hasher = new NodeContentHasher()

let url: string
let publishableKey: string
let secretKey: string
let publicClient: SupabaseClient<Database>
let secretClient: SupabaseClient<Database>
let ownerClient: SupabaseClient<Database>
let ownerUserId: string
let ownerToken: string
let otherToken: string
let householdId: string
let planId: string
let revisionId: string

function rpcClient(client: SupabaseClient<Database>): PlannerRpcClient {
  return {
    rpc(name, args) {
      return client.rpc(name as keyof Database["public"]["Functions"], args as never) as never
    }
  }
}

function authenticatedClient(accessToken: string) {
  return createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  })
}

function responseDouble() {
  const headers = new Map<string, string>()
  const state = { body: undefined as unknown, statusCode: 0, headers }
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(",") : String(value))
      return response
    },
    status(code: number) {
      state.statusCode = code
      response.statusCode = code
      return response
    },
    json(body: unknown) {
      state.body = body
      return response
    }
  } as unknown as VercelResponse
  return { state, response }
}

function request(body: unknown, accessToken: string | null): VercelRequest {
  return {
    method: "POST",
    headers: {
      ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
      "content-type": "application/json"
    },
    body,
    query: {}
  } as unknown as VercelRequest
}

function plannerHandlers() {
  return createPlannerHttpHandlers({
    auth: createServerAuthVerifier(publicClient),
    repositoryFor: (_actorUserId, accessToken) => {
      const client = authenticatedClient(accessToken)
      return createSupabasePlannerRepository({
        userClient: rpcClient(client),
        loader: createSupabasePlannerInputLoader(client),
        secretClientFactory: () => rpcClient(secretClient)
      })
    },
    hasher,
    calculationDate: () => calculationDate
  })
}

function fakeAssistant(
  result: Awaited<ReturnType<MealAssistantPort["respond"]>> = {
    ok: true,
    value: {
      kind: "explanation",
      summaryVi: "Kế hoạch được giải thích từ dữ liệu tất định.",
      observationsVi: ["Không có quyền ghi dữ liệu."]
    }
  }
) {
  const calls: Parameters<MealAssistantPort["respond"]>[0][] = []
  const assistant: MealAssistantPort = {
    respond: vi.fn(async (input) => {
      calls.push(input)
      return result
    })
  }
  return { assistant, calls }
}

function assistantHandler(assistant: MealAssistantPort | null, correlation = "assistant-int-1") {
  return createAssistantHttpHandler({
    auth: createServerAuthVerifier(publicClient),
    contextRepositoryFor(accessToken) {
      const client = authenticatedClient(accessToken)
      return createSupabaseAssistantContextRepository({
        userClient: rpcClient(client),
        loader: createSupabasePlannerInputLoader(client)
      })
    },
    assistant,
    telemetry: { emit() {} },
    createCorrelationId: () => correlation,
    now: () => 100
  })
}

async function authoritativeState() {
  const plan = await secretClient
    .from("meal_plans")
    .select("version, current_revision_id")
    .eq("id", planId)
    .single()
  const revisions = await secretClient
    .from("meal_plan_revisions")
    .select("id", { count: "exact" })
    .eq("meal_plan_id", planId)
  if (plan.error !== null || revisions.error !== null) {
    throw new Error("Unable to snapshot authoritative assistant state")
  }

  const pantry = await createSupabasePantryRepository(ownerClient).load(householdId)
  const shopping = await createSupabaseShoppingListRepository(ownerClient).load(planId)
  return JSON.stringify({
    plan: plan.data,
    revisionCount: revisions.count,
    pantry,
    shopping
  })
}

beforeAll(async () => {
  url = process.env.SUPABASE_URL ?? ""
  publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
  secretKey = process.env.SUPABASE_SECRET_KEY ?? ""
  const parsed = new URL(url)
  if (
    publishableKey === "" ||
    secretKey === "" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error("Assistant integration requires loopback Supabase configuration")
  }

  publicClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  secretClient = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })

  const users = await secretClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (users.error !== null) {
    throw new Error("Unable to inspect local planner fixture user")
  }
  const plannerUser = users.data.users.find((user) => user.email?.startsWith("phase3-planner-"))
  if (plannerUser?.email === undefined) {
    throw new Error("Assistant integration requires planner integration fixture first")
  }

  const owner = await publicClient.auth.signInWithPassword({
    email: plannerUser.email,
    password: "phase3-local-planner-password"
  })
  if (owner.error !== null || owner.data.user === null || owner.data.session === null) {
    throw new Error("Unable to sign in planner fixture owner")
  }
  ownerUserId = owner.data.user.id
  ownerToken = owner.data.session.access_token
  ownerClient = authenticatedClient(ownerToken)

  const household = await ownerClient.from("households").select("id").limit(1).maybeSingle()
  if (household.error !== null || household.data === null) {
    throw new Error("Unable to load planner fixture household")
  }
  householdId = household.data.id

  const generatedResponse = responseDouble()
  await plannerHandlers().generate(
    request(
      {
        householdId,
        weekStart: assistantWeekStart,
        idempotencyKey: crypto.randomUUID()
      },
      ownerToken
    ),
    generatedResponse.response
  )
  if (generatedResponse.state.statusCode !== 200) {
    throw new Error(
      `Unable to generate assistant fixture plan: ${generatedResponse.state.statusCode}`
    )
  }
  const generated = generatedResponse.state.body as {
    planId: string
    revisionId: string
    planVersion: number
  }
  planId = generated.planId
  revisionId = generated.revisionId

  const other = await publicClient.auth.signUp({
    email: `phase7-assistant-other-${crypto.randomUUID()}@example.test`,
    password: "phase7-local-assistant-other-password"
  })
  if (other.error !== null || other.data.session === null) {
    throw new Error("Unable to create second assistant integration user")
  }
  otherToken = other.data.session.access_token
}, 120_000)

describe("Phase 7 assistant API integration", () => {
  test("serves owner-scoped minimal evidence and writes nothing", async () => {
    const fake = fakeAssistant()
    const handler = assistantHandler(fake.assistant)
    const before = await authoritativeState()
    const response = responseDouble()

    await handler(
      request(
        {
          planId,
          expectedRevisionId: revisionId,
          question: "Giải thích kế hoạch"
        },
        ownerToken
      ),
      response.response
    )

    expect(response.state.statusCode).toBe(200)
    expect(response.state.body).toEqual({
      kind: "explanation",
      summaryVi: "Kế hoạch được giải thích từ dữ liệu tất định.",
      observationsVi: ["Không có quyền ghi dữ liệu."]
    })
    expect(fake.calls).toHaveLength(1)

    const evidence = fake.calls[0]!.evidence
    expect(Object.keys(evidence).sort()).toEqual(
      ["budgetStatus", "budgetVnd", "meals", "totalEstimatedCostVnd", "warningCodes"].sort()
    )
    expect(evidence.meals).toHaveLength(7)
    expect(Object.keys(evidence.meals[0]!).sort()).toEqual(
      ["dayIndex", "dayLabelVi", "elapsedMinutes", "mealNameVi"].sort()
    )

    const serializedEvidence = JSON.stringify(evidence)
    for (const forbidden of [ownerUserId, householdId, planId, revisionId, ownerToken]) {
      expect(serializedEvidence).not.toContain(forbidden)
    }
    expect(await authoritativeState()).toBe(before)
  }, 60_000)

  test("denies a cross-owner plan before invoking the provider", async () => {
    const fake = fakeAssistant()
    const response = responseDouble()
    await assistantHandler(fake.assistant)(
      request({ planId, expectedRevisionId: revisionId, question: "Giải thích" }, otherToken),
      response.response
    )

    expect(response.state.statusCode).toBe(403)
    expect(response.state.body).toEqual({ error: "UNAUTHORIZED" })
    expect(fake.calls).toHaveLength(0)
  })

  test("rejects stale revision before invoking the provider", async () => {
    const fake = fakeAssistant()
    const response = responseDouble()
    await assistantHandler(fake.assistant)(
      request(
        {
          planId,
          expectedRevisionId: "00000000-0000-0000-0000-000000000001",
          question: "Giải thích"
        },
        ownerToken
      ),
      response.response
    )

    expect(response.state.statusCode).toBe(409)
    expect(response.state.body).toEqual({ error: "STALE_ASSISTANT_CONTEXT" })
    expect(fake.calls).toHaveLength(0)
  })

  test("maps provider failure to a safe response and correlation id", async () => {
    const fake = fakeAssistant({ ok: false, error: "ASSISTANT_UNAVAILABLE" })
    const response = responseDouble()
    await assistantHandler(fake.assistant, "assistant-int-provider-failure")(
      request({ planId, expectedRevisionId: revisionId, question: "Giải thích" }, ownerToken),
      response.response
    )

    expect(response.state.statusCode).toBe(503)
    expect(response.state.body).toEqual({ error: "ASSISTANT_UNAVAILABLE" })
    expect(response.state.headers.get("x-correlation-id")).toBe("assistant-int-provider-failure")
    expect(fake.calls).toHaveLength(1)
  })

  test("rejects missing authentication without provider invocation", async () => {
    const fake = fakeAssistant()
    const response = responseDouble()
    await assistantHandler(fake.assistant)(
      request({ planId, expectedRevisionId: revisionId, question: "Giải thích" }, null),
      response.response
    )

    expect(response.state.statusCode).toBe(401)
    expect(response.state.body).toEqual({ error: "UNAUTHORIZED" })
    expect(fake.calls).toHaveLength(0)
  })
})
