export type ShareOutcome = "shared" | "copied" | "unavailable"

interface ShareCapableNavigator {
  readonly share?: (data: { readonly title?: string; readonly text: string }) => Promise<void>
  readonly clipboard?: { readonly writeText: (text: string) => Promise<void> }
}

export async function shareText(
  text: string,
  title: string,
  navigatorLike: ShareCapableNavigator = typeof navigator !== "undefined" ? navigator : {}
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
