import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  HouseholdRepository,
  SaveHouseholdResult
} from "@/application/household/household-repository"
import type { HouseholdSetup, HouseholdSetupInput } from "@/domain/household/household"

import type { Database } from "./database.types.js"

/**
 * The household repository, imported the first time something asks it a question.
 *
 * It was built eagerly at start-up, which cost the sign-in screen 101 KB it had no use for —
 * measured by severing the wiring and rebuilding, not guessed. The chain is long: the repository
 * pulls the household domain, which pulls its validation, which pulls zod. None of that is needed
 * to render an email field and a password field, and every screen that does need it is already
 * behind `lazy()`.
 *
 * The interface is preserved exactly, so nothing else in the app changes shape: App, the router and
 * the pages keep the repository they always had, and only the moment of the import moves. The
 * promise is memoised, so ten calls load one module.
 */
export function createDeferredHouseholdRepository(
  client: SupabaseClient<Database>
): HouseholdRepository {
  let loading: Promise<HouseholdRepository> | null = null

  const repository = async (): Promise<HouseholdRepository> => {
    loading ??= import("./supabase-household-repository.js").then((module) =>
      module.createSupabaseHouseholdRepository(client)
    )
    try {
      return await loading
    } catch (error: unknown) {
      // A failed chunk load must not poison every later call: a flaky network on the first attempt
      // would otherwise leave the app permanently unable to read the household.
      loading = null
      throw error
    }
  }

  return {
    async loadOwn(): Promise<HouseholdSetup | null> {
      return await (await repository()).loadOwn()
    },
    async saveOwn(
      input: HouseholdSetupInput,
      expectedVersion: number | null
    ): Promise<SaveHouseholdResult> {
      return await (await repository()).saveOwn(input, expectedVersion)
    }
  }
}
