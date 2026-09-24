const APP_NAME = "Bếp Nhà"

/**
 * What each route is called, in the words the page itself uses.
 *
 * Patterns are matched in order, so a specific path wins over a prefix. `:param` matches one
 * segment; nothing here needs more than that.
 */
const TITLES: readonly (readonly [string, string])[] = Object.freeze([
  ["/sign-in", "Đăng nhập"],
  ["/sign-up", "Tạo tài khoản"],
  ["/forgot-password", "Quên mật khẩu"],
  ["/reset-password", "Đặt lại mật khẩu"],
  ["/onboarding", "Thiết lập gia đình"],
  ["/household", "Gia đình"],
  ["/settings/account", "Tài khoản"],
  ["/settings/household", "Cài đặt gia đình"],
  ["/plan/:dayIndex/cook", "Đang nấu"],
  ["/plan", "Kế hoạch tuần"],
  ["/pantry", "Tủ bếp"],
  ["/shopping/:planId", "Đi chợ"],
  ["/shopping", "Đi chợ"],
  ["/privacy", "Chính sách riêng tư"],
  ["/terms", "Điều khoản sử dụng"]
])

function matches(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/")
  const pathParts = pathname.split("/")
  if (patternParts.length !== pathParts.length) return false
  return patternParts.every(
    (part, index) => part.startsWith(":") || part === (pathParts[index] ?? "")
  )
}

/**
 * The document title for a path.
 *
 * Every page shipped as plain "Bếp Nhà", which is a title in the sense that the tag was present and
 * useless in every sense that matters: a screen reader announces the same words on arrival at every
 * screen, browser history is fourteen identical entries, and a person with the plan and the
 * shopping list open in two tabs cannot tell which is which.
 *
 * An unknown path falls back to the app name alone rather than inventing a name for a page that
 * does not exist — that is what the not-found screen is for, and it says so itself.
 */
export function documentTitle(pathname: string): string {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
  const found = TITLES.find(([pattern]) => matches(pattern, normalized))
  return found === undefined ? APP_NAME : `${found[1]} · ${APP_NAME}`
}
