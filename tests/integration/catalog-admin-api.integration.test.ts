import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, test } from "vitest"

import { createCatalogAdminHandler } from "../../api/admin/catalog.js"
import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher.js"
import { createSupabaseCatalogAdminRepository } from "@/infrastructure/server/supabase-catalog-admin-repository.js"
import { createServerAdminAuthVerifier } from "@/infrastructure/supabase/server-admin-auth.js"
import { createSupabaseCatalogReadRepository } from "@/infrastructure/supabase/supabase-catalog-read-repository.js"
import type { Database } from "@/infrastructure/supabase/database.types.js"

let url: string
let publishableKey: string
let secretKey: string
let publicClient: SupabaseClient<Database>
let secretClient: SupabaseClient<Database>
let token: string

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
    throw new Error(
      "Catalog admin integration requires loopback Supabase administrator configuration"
    )
  }
  publicClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  secretClient = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  const signUp = await publicClient.auth.signUp({
    email: `phase2-admin-${crypto.randomUUID()}@example.test`,
    password: "phase2-local-admin-password"
  })
  if (signUp.error !== null || signUp.data.user === null || signUp.data.session === null) {
    throw new Error("Unable to create local catalog administrator")
  }
  const promotion = await secretClient.auth.admin.updateUserById(signUp.data.user.id, {
    app_metadata: { role: "admin" }
  })
  if (promotion.error !== null) throw new Error("Unable to bootstrap local catalog administrator")
  token = signUp.data.session.access_token
})

function responseDouble() {
  const result = { body: undefined as unknown, statusCode: 0 }
  const response = {
    setHeader() {},
    status(code: number) {
      result.statusCode = code
      return response
    },
    json(body: unknown) {
      result.body = body
      return response
    }
  } as unknown as VercelResponse
  return { result, response }
}

async function command(body: unknown) {
  const handler = createCatalogAdminHandler({
    auth: createServerAdminAuthVerifier(publicClient),
    repositoryFor: (actorUserId) => createSupabaseCatalogAdminRepository(secretClient, actorUserId),
    hasher: new NodeContentHasher()
  })
  const { result, response } = responseDouble()
  await handler(
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body
    } as VercelRequest,
    response
  )
  return result
}

function successBody(result: Awaited<ReturnType<typeof command>>) {
  expect(result.statusCode).toBe(200)
  expect(typeof (result.body as { id?: unknown }).id).toBe("string")
  expect(typeof (result.body as { revision?: unknown }).revision).toBe("number")
  return result.body as { id: string; revision: number; contentHash?: string }
}

describe("trusted catalog administrator flow", () => {
  test("creates immutable fact/recipe/price lineage and exposes exact published calculation input", async () => {
    const food = successBody(
      await command({
        action: "create_food",
        input: {
          code: `gao_${crypto.randomUUID().replaceAll("-", "")}`,
          nameVi: "Gạo kiểm thử",
          baseDimension: "mass",
          baseUnitId: "70010000-0000-0000-0000-000000000001"
        }
      })
    )
    const factId = crypto.randomUUID()
    const allergens = await secretClient.from("allergens").select("code").order("code")
    const nutrients = await secretClient.from("nutrients").select("code").order("code")
    expect(allergens.error).toBeNull()
    expect(nutrients.error).toBeNull()
    successBody(
      await command({
        action: "save_food_fact_draft",
        input: {
          foodFactVersionId: factId,
          expectedRevision: 1,
          foodId: food.id,
          versionNumber: 1,
          categoryId: "70020000-0000-0000-0000-000000000013",
          edibleFraction: "1",
          provenance: "Local integration fixture",
          allergenAssessments: allergens.data!.map(({ code }) => ({
            allergenCode: code,
            status: "absent",
            provenance: "Local integration fixture"
          })),
          nutrients: nutrients.data!.map(({ code }) => ({
            nutrientCode: code,
            amountPer100g: code === "energy_kcal" ? "350" : "0",
            provenance: "Local integration fixture"
          })),
          categoryAncestry: ["staple", "food"],
          dietaryTagCodes: ["vegetarian"],
          conversions: [
            {
              unitId: "70010000-0000-0000-0000-000000000001",
              baseQuantityPerUnit: "1",
              grossGramsPerUnit: "1",
              displayStep: "5",
              provenance: "Gram identity"
            },
            {
              unitId: "70010000-0000-0000-0000-000000000002",
              baseQuantityPerUnit: "1000",
              grossGramsPerUnit: "1000",
              displayStep: "0.1",
              provenance: "Kilogram conversion"
            }
          ]
        }
      })
    )
    const publishedFact = successBody(
      await command({
        action: "publish_food_fact",
        input: { foodFactVersionId: factId, expectedRevision: 1 }
      })
    )
    expect(publishedFact.contentHash).toMatch(/^[0-9a-f]{64}$/u)

    const recipe = successBody(
      await command({
        action: "create_recipe",
        input: { code: `com_${crypto.randomUUID().replaceAll("-", "")}`, nameVi: "Cơm kiểm thử" }
      })
    )
    const recipeVersionId = crypto.randomUUID()
    successBody(
      await command({
        action: "save_recipe_version_draft",
        input: {
          recipeVersionId,
          expectedRevision: 1,
          recipeId: recipe.id,
          versionNumber: 1,
          yieldAdultEquivalent: "4",
          activeMinutes: 10,
          elapsedMinutes: 20,
          ingredients: [
            {
              recipeIngredientId: "rice-local-reference",
              foodId: food.id,
              foodFactVersionId: factId,
              quantity: "500",
              unitId: "70010000-0000-0000-0000-000000000001",
              preparationNoteVi: null,
              order: 1
            }
          ],
          steps: [
            {
              order: 1,
              instructionVi: "Vo gạo, nấu chín rồi dọn món.",
              timerMinutes: 20,
              ingredientIds: ["rice-local-reference"]
            }
          ],
          tagIds: ["70070000-0000-0000-0000-000000000013"]
        }
      })
    )
    const publishedRecipe = successBody(
      await command({
        action: "publish_recipe",
        input: { recipeVersionId, expectedRevision: 1 }
      })
    )
    expect(publishedRecipe.contentHash).toMatch(/^[0-9a-f]{64}$/u)

    const book = successBody(
      await command({
        action: "create_price_book",
        input: {
          regionId: "70060000-0000-0000-0000-000000000001",
          versionNumber: 1,
          effectiveFrom: new Date().toISOString().slice(0, 10),
          effectiveTo: null
        }
      })
    )
    successBody(
      await command({
        action: "save_price_book_draft",
        input: {
          priceBookId: book.id,
          expectedRevision: 1,
          effectiveFrom: new Date().toISOString().slice(0, 10),
          effectiveTo: null,
          prices: [
            {
              foodPriceId: "price-local-reference",
              foodId: food.id,
              foodFactVersionId: factId,
              packageQuantity: "1",
              packageUnitId: "70010000-0000-0000-0000-000000000002",
              packageBaseQuantity: "1000",
              baseUnitId: "70010000-0000-0000-0000-000000000001",
              packagePriceVnd: 30_000,
              purchaseIncrement: "1",
              observedAt: new Date().toISOString().slice(0, 10),
              sourceReference: "Local integration fixture"
            }
          ]
        }
      })
    )
    successBody(
      await command({
        action: "publish_price_book",
        input: { priceBookId: book.id, expectedRevision: 2 }
      })
    )

    const read = createSupabaseCatalogReadRepository(publicClient)
    const exact = await read.getPublishedRecipeCalculation(recipeVersionId, book.id)
    expect(exact).toMatchObject({
      ok: true,
      value: {
        recipe: {
          recipeVersionId,
          ingredients: [{ food: { foodId: food.id }, fact: { foodFactVersionId: factId } }]
        },
        priceBook: { priceBookId: book.id, prices: [{ foodId: food.id }] }
      }
    })

    const immutable = await secretClient
      .from("recipe_steps")
      .update({ instruction_vi: "Không được thay đổi" })
      .eq("recipe_version_id", recipeVersionId)
    expect(immutable.error).not.toBeNull()
    const audit = await publicClient.from("admin_audit_log").select("id")
    expect(audit.data).toBeNull()
    expect(audit.error).not.toBeNull()
  }, 30_000)
})
