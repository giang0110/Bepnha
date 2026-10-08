import { Icon } from "@/app/components/ui/icon"
import { PANTRY_STORAGE_ZONES, type PantryStorageZone } from "@/domain/pantry/pantry-zones"

export interface PantryInventoryFilterBarProps {
  readonly searchQuery: string
  readonly onSearchChange: (query: string) => void
  readonly activeZone: PantryStorageZone | "all"
  readonly onZoneChange: (zone: PantryStorageZone | "all") => void
  readonly urgentOnly: boolean
  readonly onUrgentToggle: () => void
  readonly sortByUrgency: boolean
  readonly onSortByUrgencyToggle: () => void
  readonly totalCount: number
  readonly matchCount: number
  readonly urgentCount: number
  readonly zoneCounts: Readonly<Record<PantryStorageZone | "all", number>>
  readonly onShareInventory: () => void
  readonly onResetFilters: () => void
}

export function PantryInventoryFilterBar({
  searchQuery,
  onSearchChange,
  activeZone,
  onZoneChange,
  urgentOnly,
  onUrgentToggle,
  sortByUrgency,
  onSortByUrgencyToggle,
  totalCount,
  matchCount,
  urgentCount,
  zoneCounts,
  onShareInventory,
  onResetFilters
}: Readonly<PantryInventoryFilterBarProps>) {
  const isFiltering = searchQuery.trim() !== "" || activeZone !== "all" || urgentOnly

  return (
    <div className="grid gap-3 border-b border-edge pb-3" data-print="hide">
      {/* Search Input & Share Button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-ink-soft sm:text-sm"
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm thực phẩm trong tủ (trứng, thịt, hành, mắm...)"
            aria-label="Tìm thực phẩm trong tủ bếp"
            data-testid="pantry-search-input"
            className="w-full rounded-2xl border border-edge bg-paper-sunken py-2.5 pr-9 pl-9 text-xs text-ink placeholder:text-ink-muted focus:border-herb-500 focus:bg-paper focus:outline-none sm:text-sm"
          />
          {searchQuery !== "" && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Xóa tìm kiếm thực phẩm"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onShareInventory}
          data-testid="pantry-share-button"
          aria-label="Chia sẻ danh sách kiểm kê tủ bếp"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-edge bg-paper-raised px-4 text-xs font-bold text-ink-soft transition-colors hover:border-herb-300 hover:bg-herb-50/50 hover:text-herb-800"
          title="Sao chép hoặc gửi danh sách kiểm kê tủ bếp qua tin nhắn"
        >
          <Icon name="share" className="size-4 text-herb-700" />
          <span>Chia sẻ tủ bếp</span>
        </button>
      </div>

      {/* Filter Navigation & Chips */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Khu vực lưu trữ tủ bếp" className="flex flex-wrap items-center gap-1.5">
          {PANTRY_STORAGE_ZONES.map((zone) => {
            const isSelected = !urgentOnly && activeZone === zone.id
            const count = zoneCounts[zone.id] ?? 0

            return (
              <button
                key={zone.id}
                type="button"
                aria-pressed={isSelected}
                className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  isSelected
                    ? "bg-herb-700 text-on-herb shadow-xs"
                    : "border border-edge bg-paper-raised text-ink-soft hover:bg-paper-sunken"
                }`}
                onClick={() => {
                  if (urgentOnly) onUrgentToggle()
                  onZoneChange(zone.id)
                }}
              >
                {zone.shortLabelVi}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isSelected ? "bg-herb-50 text-herb-900" : "bg-paper-sunken text-ink"
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}

          {urgentCount > 0 && (
            <button
              type="button"
              aria-pressed={urgentOnly}
              data-testid="pantry-filter-urgent"
              className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                urgentOnly
                  ? "bg-chilli-700 text-white shadow-xs"
                  : "border border-chilli-200 bg-chilli-50 text-chilli-800 hover:bg-chilli-100"
              }`}
              onClick={onUrgentToggle}
              title="Chỉ hiển thị thực phẩm sắp hết hạn hoặc cần dùng sớm"
            >
              <span>⚡ Dùng gấp</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  urgentOnly ? "bg-white text-chilli-900" : "bg-chilli-200 text-chilli-900"
                }`}
              >
                {urgentCount}
              </span>
            </button>
          )}
        </nav>

        <button
          type="button"
          aria-pressed={sortByUrgency}
          onClick={onSortByUrgencyToggle}
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
            sortByUrgency
              ? "bg-chilli-700 text-white shadow-xs"
              : "border border-edge bg-paper-raised text-ink-soft hover:bg-paper-sunken hover:text-ink"
          }`}
          data-testid="pantry-sort-urgency-toggle"
          title="Sắp xếp thực phẩm theo mức độ ưu tiên hạn sử dụng"
        >
          Ưu tiên sắp hết hạn
        </button>
      </div>

      {/* Filter Status Summary */}
      {isFiltering && (
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <span>
            Hiển thị <strong className="font-bold text-ink">{matchCount}</strong>/{totalCount} món
          </span>
          <button
            type="button"
            onClick={onResetFilters}
            className="font-semibold text-herb-700 hover:text-herb-900 hover:underline"
            data-testid="pantry-reset-filter-button"
          >
            Xem lại tất cả
          </button>
        </div>
      )}
    </div>
  )
}
