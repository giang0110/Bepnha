import { describe, expect, test, vi } from "vitest"

import type { ContentHasher } from "@/application/shared/content-hasher"

import {
  executeMealOptionAdminCommand,
  type MealOptionAdminRepository
} from "./execute-meal-option-admin-command"

const aggregate = {
  mealOption: {
    mealOptionId: "option-1",
    code: "com_ga_rau",
    nameVi: "Cơm gà rau",
    revision: 1
  },
  version: {
    mealOptionVersionId: "option-version-1",
    versionNumber: 1,
    revision: 3,
    yieldAdultEquivalent: "4",
    activeMinutes: 20,
    elapsedMinutes: 30,
    publicationStatus: "draft" as const,
    contentHash: null
  },
  components: [
    {
      mealOptionRecipeId: "component-1",
      recipeId: "recipe-1",
      recipeVersionId: "recipe-version-1",
      recipeVersionNumber: 1,
      recipeContentHash: "a".repeat(64),
      recipePublicationStatus: "published" as const,
      recipeYieldAdultEquivalent: "4",
      quantityMultiplier: "1",
      mealRole: "main" as const,
      sortOrder: 1
    }
  ],
  tags: [
    { tagId: "tag-protein", code: "chicken", kind: "protein_hint" },
    { tagId: "tag-style", code: "boil", kind: "cooking_style" }
  ]
}

function repository(overrides: Partial<MealOptionAdminRepository> = {}): MealOptionAdminRepository {
  const draft = {
    ok: true as const,
    value: { id: "option-version-1", revision: 2, status: "draft" as const }
  }
  return {
    create: vi.fn().mockResolvedValue(draft),
    saveDraft: vi.fn().mockResolvedValue(draft),
    loadPublicationAggregate: vi.fn().mockResolvedValue({ ok: true, value: aggregate }),
    publish: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        id: "option-version-1",
        revision: 4,
        status: "published",
        contentHash: "f".repeat(64)
      }
    }),
    retire: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { id: "option-1", revision: 3, status: "retired" } }),
    ...overrides
  }
}

const hasher: ContentHasher = { sha256: vi.fn().mockResolvedValue("f".repeat(64)) }

describe("executeMealOptionAdminCommand", () => {
  test("routes closed create and save commands after validating their complete shape", async () => {
    const repo = repository()
    await expect(
      executeMealOptionAdminCommand(repo, hasher, {
        action: "create_meal_option",
        input: { code: "com_ga_rau", nameVi: "Cơm gà rau" }
      })
    ).resolves.toMatchObject({ ok: true })
    await expect(
      executeMealOptionAdminCommand(repo, hasher, {
        action: "save_meal_option_version_draft",
        input: {
          mealOptionVersionId: "option-version-1",
          mealOptionId: "option-1",
          expectedRevision: 1,
          versionNumber: 1,
          yieldAdultEquivalent: "4",
          activeMinutes: 20,
          elapsedMinutes: 30,
          components: [
            {
              recipeId: "recipe-1",
              recipeVersionId: "recipe-version-1",
              quantityMultiplier: "1",
              mealRole: "main",
              order: 1
            }
          ],
          tagIds: ["tag-protein", "tag-style"]
        }
      })
    ).resolves.toMatchObject({ ok: true })
    expect(repo.create).toHaveBeenCalledOnce()
    expect(repo.saveDraft).toHaveBeenCalledOnce()
  })

  test("reloads the authoritative aggregate before hashing and publishing", async () => {
    const events: string[] = []
    const repo = repository({
      loadPublicationAggregate: vi.fn(() => {
        events.push("load")
        return Promise.resolve({ ok: true as const, value: aggregate })
      }),
      publish: vi.fn((input: Parameters<MealOptionAdminRepository["publish"]>[0]) => {
        events.push("publish")
        return Promise.resolve({
          ok: true as const,
          value: {
            id: input.id,
            revision: 4,
            status: "published" as const,
            contentHash: input.contentHash
          }
        })
      })
    })
    const recordingHasher: ContentHasher = {
      sha256: vi.fn(() => {
        events.push("hash")
        return Promise.resolve("f".repeat(64))
      })
    }

    const result = await executeMealOptionAdminCommand(repo, recordingHasher, {
      action: "publish_meal_option",
      input: { mealOptionVersionId: "option-version-1", expectedRevision: 3 }
    })

    expect(result).toMatchObject({ ok: true })
    expect(events).toEqual(["load", "hash", "publish"])
    expect(repo.publish).toHaveBeenCalledWith({
      id: "option-version-1",
      expectedRevision: 3,
      contentHash: "f".repeat(64)
    })
  })

  test("hashes shuffled aggregate rows identically and rejects incomplete lineage", async () => {
    const bytes: string[] = []
    const recordingHasher: ContentHasher = {
      sha256: vi.fn((value: Uint8Array) => {
        bytes.push(new TextDecoder().decode(value))
        return Promise.resolve("f".repeat(64))
      })
    }
    const shuffled = {
      ...aggregate,
      tags: [...aggregate.tags].reverse(),
      components: [...aggregate.components].reverse()
    }
    for (const value of [aggregate, shuffled]) {
      await executeMealOptionAdminCommand(
        repository({ loadPublicationAggregate: vi.fn().mockResolvedValue({ ok: true, value }) }),
        recordingHasher,
        {
          action: "publish_meal_option",
          input: { mealOptionVersionId: "option-version-1", expectedRevision: 3 }
        }
      )
    }
    expect(bytes[0]).toBe(bytes[1])

    const invalid = {
      ...aggregate,
      components: [{ ...aggregate.components[0]!, recipeContentHash: null }]
    }
    const repo = repository({
      loadPublicationAggregate: vi.fn().mockResolvedValue({ ok: true, value: invalid })
    })
    await expect(
      executeMealOptionAdminCommand(repo, hasher, {
        action: "publish_meal_option",
        input: { mealOptionVersionId: "option-version-1", expectedRevision: 3 }
      })
    ).resolves.toEqual({ ok: false, reason: "PUBLICATION_INCOMPLETE" })
    expect(repo.publish).not.toHaveBeenCalled()
  })

  test("retires by stable identity and exact optimistic revision", async () => {
    const repo = repository()
    await executeMealOptionAdminCommand(repo, hasher, {
      action: "retire_meal_option",
      input: { mealOptionId: "option-1", expectedRevision: 2 }
    })
    expect(repo.retire).toHaveBeenCalledWith({ id: "option-1", expectedRevision: 2 })
  })
})
