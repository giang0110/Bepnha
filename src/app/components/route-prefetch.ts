export function prefetchRoute(to: string): Promise<unknown> | undefined {
  switch (to) {
    case "/plan":
      return import("@/features/plans/weekly-plan-page")
    case "/shopping":
      return Promise.all([
        import("@/features/plans/shopping-entry-page"),
        import("@/features/shopping/shopping-list-page")
      ])
    case "/pantry":
      return import("@/features/pantry/pantry-page")
    case "/settings":
      return import("@/features/settings/settings-page")
    default:
      return undefined
  }
}
