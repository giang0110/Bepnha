export type ShareOutcome = "shared" | "copied" | "unavailable"

interface ShareCapableNavigator {
  readonly share?: (data: { readonly title?: string; readonly text: string }) => Promise<void>
  readonly clipboard?: { readonly writeText: (text: string) => Promise<void> }
}

/**
 * Hands a block of text to whatever the device uses for sharing, falling back to the clipboard.
 *
 * Two behaviours worth stating, because both would otherwise read as bugs:
 *
 * A cancelled share is not a failure. `navigator.share` rejects with `AbortError` when the person
 * dismisses the sheet, and reporting that as an error would tell them something went wrong when
 * what happened is that they changed their mind. It resolves as `shared` — nothing to announce.
 *
 * A share that fails for any other reason falls through to the clipboard rather than surfacing the
 * error, because the person's goal is to get the list to someone, and the clipboard still does it.
 * Only when neither route exists does this admit it cannot help.
 */
export async function shareText(
  text: string,
  title: string,
  navigatorLike: ShareCapableNavigator
): Promise<ShareOutcome> {
  if (typeof navigatorLike.share === "function") {
    try {
      await navigatorLike.share({ title, text })
      return "shared"
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return "shared"
    }
  }

  const clipboard = navigatorLike.clipboard
  if (clipboard !== undefined && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text)
      return "copied"
    } catch {
      return "unavailable"
    }
  }

  return "unavailable"
}
