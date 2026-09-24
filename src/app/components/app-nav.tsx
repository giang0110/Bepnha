import { NavLink } from "react-router"
import { Icon } from "./ui/icon"

const links = [
  { to: "/household", label: "Gia đình", shortLabel: "Nhà" },
  { to: "/plan", label: "Kế hoạch", shortLabel: "Kế hoạch" },
  // One of the two things this app is for every week, and it had no entry here at all: the only
  // door was a button on the plan page.
  { to: "/shopping", label: "Đi chợ", shortLabel: "Đi chợ" },
  { to: "/pantry", label: "Tủ bếp", shortLabel: "Tủ bếp" },
  { to: "/settings/account", label: "Tài khoản", shortLabel: "Tài khoản" }
] as const

function NavGlyph({ index }: Readonly<{ index: number }>) {
  const paths = [
    "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z",
    "M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2 4h10M7 12h4m-4 4h7",
    "M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L21 8H6M10 20.5h.01M17 20.5h.01",
    "M4 7h16l-1.5 13h-13L4 7Zm3-3h10l1 3H6l1-3Z",
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0"
  ] as const

  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d={paths[index] ?? paths[0]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

/**
 * Mobile uses a persistent bottom bar; desktop turns the same landmark into a calm left rail.
 * The route order is stable because accessibility and navigation tests intentionally pin it.
 */
export function AppNav() {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-edge bg-paper-raised/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgb(107_93_84_/_0.1)] backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-t-0 lg:pb-0 lg:shadow-none"
    >
      <div className="hidden px-5 pb-5 pt-7 lg:block">
        <p className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-herb-700">
          <span className="grid size-8 place-items-center rounded-2xl bg-herb-100 text-herb-700">
            <Icon name="bowl" className="size-[18px]" />
          </span>
          Bếp Nhà
        </p>
        <p className="mt-3 text-lg font-bold text-ink">Bữa cơm gọn hơn mỗi tuần</p>
        <p className="mt-1 text-xs leading-5 text-ink-soft">
          Kế hoạch, tủ bếp và danh sách đi chợ trong cùng một nơi.
        </p>
      </div>

      <ul className="grid grid-cols-5 gap-1 px-2 py-2 lg:grid-cols-1 lg:gap-1 lg:px-3 lg:py-1">
        {links.map((link, index) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                [
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-semibold transition-all sm:text-xs",
                  "lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm",
                  isActive
                    ? "bg-herb-100 text-herb-900 shadow-soft ring-1 ring-inset ring-herb-200"
                    : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
                ].join(" ")
              }
            >
              <NavGlyph index={index} />
              <span className="lg:hidden">{link.shortLabel}</span>
              <span className="hidden lg:inline">{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
