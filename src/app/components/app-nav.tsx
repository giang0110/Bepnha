import { NavLink } from "react-router"

/**
 * Primary navigation for signed-in routes. Rendered after the skip link so keyboard users can jump
 * past it, and wrapped so four labels still fit the 320 px viewport the accessibility suite checks
 * without introducing horizontal overflow.
 *
 * The shopping list is intentionally absent: it is addressed by plan id, so there is no stable route
 * to link to from here.
 */
const links = [
  { to: "/household", label: "Gia đình" },
  { to: "/plan", label: "Kế hoạch" },
  { to: "/pantry", label: "Tủ bếp" },
  { to: "/settings/account", label: "Tài khoản" }
] as const

export function AppNav() {
  return (
    <nav aria-label="Điều hướng chính" className="border-b bg-white">
      <ul className="mx-auto flex w-full max-w-md flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm">
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                isActive
                  ? "font-semibold text-slate-950 underline"
                  : "text-slate-700 underline-offset-4 hover:underline"
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
