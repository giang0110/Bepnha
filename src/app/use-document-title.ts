import { useEffect } from "react"
import { useLocation } from "react-router"

import { documentTitle } from "./document-title"

/**
 * Keeps the tab, the history entry and the screen-reader announcement in step with the route.
 *
 * Mounted once, above the router's own routes, so a new page never has to remember to do it — and
 * so the fourteen screens cannot drift apart one forgotten call at a time.
 */
export function useDocumentTitle(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = documentTitle(pathname)
  }, [pathname])
}
