import type { ProteinGroup } from "@/domain/planner/meal-rotation-insights.js"
import type { WeeklyPlanFilterCounts } from "@/domain/planner/weekly-plan-filter.js"

export interface WeeklyPlanFilterBarProps {
  readonly searchQuery: string
  readonly onSearchChange: (query: string) => void
  readonly activeProtein: ProteinGroup | "all"
  readonly onProteinChange: (protein: ProteinGroup | "all") => void
  readonly quickCookOnly: boolean
  readonly onQuickCookToggle: () => void
  readonly coolingOnly: boolean
  readonly onCoolingToggle: () => void
  readonly counts: WeeklyPlanFilterCounts
  readonly totalMatches: number
  readonly totalItems: number
  readonly onResetFilters: () => void
}

export function WeeklyPlanFilterBar({
  searchQuery,
  onSearchChange,
  activeProtein,
  onProteinChange,
  quickCookOnly,
  onQuickCookToggle,
  coolingOnly,
  onCoolingToggle,
  counts,
  totalMatches,
  totalItems,
  onResetFilters
}: Readonly<WeeklyPlanFilterBarProps>) {
  const isFiltering =
    searchQuery.trim() !== "" || activeProtein !== "all" || quickCookOnly || coolingOnly

  return (
    <div className="grid gap-2.5" data-print="hide">
      {/* Search Bar */}
      <div className="relative flex items-center">
        <span
          className="pointer-events-none absolute left-3.5 text-xs text-ink-soft sm:text-sm"
          aria-hidden="true"
        >
          🔍
        </span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm món trong tuần (cá, canh, sườn, gà...)"
          aria-label="Tìm món trong tuần"
          data-testid="meal-search-input"
          className="w-full rounded-2xl border border-edge bg-paper-sunken py-2.5 pr-9 pl-9 text-xs text-ink placeholder:text-ink-muted focus:border-herb-500 focus:bg-paper focus:outline-none sm:text-sm"
        />
        {searchQuery !== "" && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Xóa tìm kiếm"
            className="absolute right-3 text-xs font-bold text-ink-soft hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter Chips Bar */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none"
        role="group"
        aria-label="Bộ lọc nhanh bữa ăn"
      >
        <button
          type="button"
          aria-pressed={activeProtein === "all" && !quickCookOnly && !coolingOnly}
          onClick={() => {
            onProteinChange("all")
            if (quickCookOnly) onQuickCookToggle()
            if (coolingOnly) onCoolingToggle()
          }}
          className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
            activeProtein === "all" && !quickCookOnly && !coolingOnly
              ? "bg-herb-700 text-on-herb shadow-xs"
              : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
          }`}
          data-testid="filter-chip-all"
        >
          Tất cả ({counts.all})
        </button>

        {counts.quickCook > 0 && (
          <button
            type="button"
            aria-pressed={quickCookOnly}
            onClick={onQuickCookToggle}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
              quickCookOnly
                ? "bg-herb-700 text-on-herb shadow-xs"
                : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
            }`}
            data-testid="filter-chip-quick-cook"
          >
            ⚡ Nấu nhanh ≤30p ({counts.quickCook})
          </button>
        )}

        {counts.seafood > 0 && (
          <button
            type="button"
            aria-pressed={activeProtein === "seafood"}
            onClick={() => onProteinChange(activeProtein === "seafood" ? "all" : "seafood")}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
              activeProtein === "seafood"
                ? "bg-herb-700 text-on-herb shadow-xs"
                : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
            }`}
            data-testid="filter-chip-seafood"
          >
            🐟 Cá & Hải sản ({counts.seafood})
          </button>
        )}

        {counts.cooling > 0 && (
          <button
            type="button"
            aria-pressed={coolingOnly}
            onClick={onCoolingToggle}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
              coolingOnly
                ? "bg-blue-700 text-white shadow-xs"
                : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
            }`}
            data-testid="filter-chip-cooling"
          >
            🌿 Thanh nhiệt ({counts.cooling})
          </button>
        )}

        {counts.poultry > 0 && (
          <button
            type="button"
            aria-pressed={activeProtein === "poultry"}
            onClick={() => onProteinChange(activeProtein === "poultry" ? "all" : "poultry")}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
              activeProtein === "poultry"
                ? "bg-herb-700 text-on-herb shadow-xs"
                : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
            }`}
            data-testid="filter-chip-poultry"
          >
            🍗 Thịt gà/vịt ({counts.poultry})
          </button>
        )}

        {counts.pork > 0 && (
          <button
            type="button"
            aria-pressed={activeProtein === "pork"}
            onClick={() => onProteinChange(activeProtein === "pork" ? "all" : "pork")}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
              activeProtein === "pork"
                ? "bg-herb-700 text-on-herb shadow-xs"
                : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
            }`}
            data-testid="filter-chip-pork"
          >
            🥩 Thịt heo ({counts.pork})
          </button>
        )}

        {counts.beef > 0 && (
          <button
            type="button"
            aria-pressed={activeProtein === "beef"}
            onClick={() => onProteinChange(activeProtein === "beef" ? "all" : "beef")}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
              activeProtein === "beef"
                ? "bg-herb-700 text-on-herb shadow-xs"
                : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
            }`}
            data-testid="filter-chip-beef"
          >
            🥩 Thịt bò ({counts.beef})
          </button>
        )}

        {counts.eggTofu > 0 && (
          <button
            type="button"
            aria-pressed={activeProtein === "egg_tofu"}
            onClick={() => onProteinChange(activeProtein === "egg_tofu" ? "all" : "egg_tofu")}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors ${
              activeProtein === "egg_tofu"
                ? "bg-herb-700 text-on-herb shadow-xs"
                : "bg-paper-sunken text-ink-soft hover:bg-paper-raised hover:text-ink"
            }`}
            data-testid="filter-chip-egg-tofu"
          >
            🥚 Trứng & Đậu ({counts.eggTofu})
          </button>
        )}
      </div>

      {/* Filter status & Reset button */}
      {isFiltering && (
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <span>
            Hiển thị <strong className="font-bold text-ink">{totalMatches}</strong>/{totalItems} bữa
          </span>
          <button
            type="button"
            onClick={onResetFilters}
            className="font-semibold text-herb-700 hover:text-herb-900 hover:underline"
            data-testid="filter-reset-button"
          >
            Xem lại cả 7 bữa
          </button>
        </div>
      )}
    </div>
  )
}
