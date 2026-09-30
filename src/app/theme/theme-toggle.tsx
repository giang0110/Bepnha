import { Icon } from "@/app/components/ui/icon"
import { useTheme } from "./theme-context"

export function ThemeToggle({ className = "" }: Readonly<{ className?: string }>) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      aria-label={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ ban đêm"}
      className={`inline-flex items-center justify-center rounded-2xl border border-edge bg-paper-raised p-2 text-ink transition-colors hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-500 ${className}`}
      type="button"
      onClick={toggleTheme}
    >
      <Icon name={isDark ? "sun" : "moon"} className="size-5 text-herb-700 dark:text-herb-500" />
    </button>
  )
}
