import type { PantryFoodUnitOption } from "@/application/pantry/pantry-food-options-repository"

const QUANTITIES = new Map<string, readonly string[]>([
  ["g", ["100", "250", "500", "1000"]],
  ["kg", ["0.25", "0.5", "1", "2"]],
  ["ml", ["100", "250", "500", "1000"]],
  ["l", ["0.25", "0.5", "1", "2"]],
  ["tsp", ["1", "2", "3"]],
  ["tbsp", ["1", "2", "4"]],
  ["item", ["1", "2", "4", "6"]]
])

export function PantryQuantityPresets({
  unit,
  quantity,
  disabled,
  onSelect,
  label = "Chọn nhanh số lượng"
}: Readonly<{
  unit: PantryFoodUnitOption | undefined
  quantity: string
  disabled: boolean
  onSelect: (quantity: string) => void
  label?: string
}>) {
  if (unit === undefined) return null
  const values = QUANTITIES.get(unit.unitCode)
  if (values === undefined) return null
  const unitLabel = ["g", "kg", "ml", "l"].includes(unit.unitCode) ? unit.unitCode : unit.unitNameVi

  return (
    <fieldset aria-label={label} disabled={disabled} className="grid gap-2">
      <legend className="mb-2 text-xs font-medium text-ink-soft">Chọn nhanh số lượng</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={quantity === value}
            className="min-h-11 rounded-xl border border-edge bg-paper-sunken px-3 text-sm font-medium text-ink transition-colors hover:border-herb-500 hover:bg-herb-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-600 disabled:opacity-50 aria-pressed:border-herb-600 aria-pressed:bg-herb-50"
            onClick={() => onSelect(value)}
          >
            {value.replace(".", ",")} {unitLabel}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
