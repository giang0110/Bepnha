/** The message the worker listens for. Exported so the test and the worker cannot drift apart. */
export const PURGE_DATA_MESSAGE = "bepnha:purge-data" as const

interface ServiceWorkerContainerLike {
  readonly register: (url: string, options?: { readonly scope?: string }) => Promise<unknown>
  readonly controller: { readonly postMessage: (message: unknown) => void } | null
  readonly ready?: Promise<{
    readonly active: { readonly postMessage: (m: unknown) => void } | null
  }>
}

interface NavigatorLike {
  readonly serviceWorker?: ServiceWorkerContainerLike
}

/**
 * Registers the worker, and says nothing when it cannot.
 *
 * A browser with no service worker support, a page served over plain HTTP, or a user who has
 * blocked storage all end here, and in every one of those cases the app still works — it is only
 * the offline copy that is missing. There is nothing the person could do about it, so there is
 * nothing worth telling them.
 */
export async function registerServiceWorker(navigatorLike: NavigatorLike): Promise<boolean> {
  const container = navigatorLike.serviceWorker
  if (container === undefined) return false
  try {
    await container.register("/sw.js", { scope: "/" })
    return true
  } catch {
    return false
  }
}

/**
 * Throws away the cached household data.
 *
 * Called on sign-out. A shared phone is the ordinary case this exists for: the next person to open
 * the app must not find last week's meal plan sitting in a cache because the previous user's
 * session ended. Best-effort by nature — if no worker is controlling the page there is no cache to
 * clear either, so having nothing to talk to is success, not failure.
 */
export async function purgeCachedHouseholdData(navigatorLike: NavigatorLike): Promise<void> {
  const container = navigatorLike.serviceWorker
  if (container === undefined) return
  try {
    if (container.controller !== null) {
      container.controller.postMessage({ type: PURGE_DATA_MESSAGE })
      return
    }
    const registration = await container.ready
    registration?.active?.postMessage({ type: PURGE_DATA_MESSAGE })
  } catch {
    // Nothing to purge, or nothing listening. Either way the page has done what it can.
  }
}
