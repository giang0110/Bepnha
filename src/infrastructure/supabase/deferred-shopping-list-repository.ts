import type { SupabaseClient } from "@supabase/supabase-js"
import type { VersionedShoppingListRepository } from "../../application/shopping/shopping-list-repository.js"
import type { Database } from "./database.types.js"
/** Load exact-decimal shopping validation when the shopping route is opened. */
export function createDeferredShoppingListRepository(
  client: SupabaseClient<Database>
): VersionedShoppingListRepository {
  let repository: Promise<VersionedShoppingListRepository> | undefined
  function loadRepository() {
    return (repository ??= import("./supabase-shopping-list-repository.js")
      .then((m) => m.createBrowserVersionedShoppingListRepository(client))
      .catch((error: unknown) => {
        repository = undefined
        throw error
      }))
  }
  return {
    load: async (...args) => (await loadRepository()).load(...args),
    setChecked: async (...args) => (await loadRepository()).setChecked(...args),
    applyToPantry: async (...args) => (await loadRepository()).applyToPantry(...args)
  }
}
