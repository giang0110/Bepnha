/**
 * Must render before the primary navigation, and before page content, so the first Tab on any
 * protected route reaches it. `RequireAuth` owns it for that reason: putting it inside the page
 * shell would place it after the navigation landmark and make it unreachable in one keypress.
 */
export function AppSkipLink() {
  return (
    <a
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-paper-raised focus:px-3 focus:py-2 focus:text-ink focus:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-600 focus-visible:ring-offset-2"
      href="#main-content"
    >
      Bỏ qua đến nội dung chính
    </a>
  )
}
