import { Button } from "@/app/components/ui/button"

import { formatVnd } from "../budget-vnd"

const BUDGET_PRESETS_VND = [500_000, 700_000, 1_000_000, 1_500_000] as const

interface BudgetPresetsProps {
  readonly selectedVnd: number | null
  readonly onSelect: (budgetVnd: number) => void
}

export function BudgetPresets({ selectedVnd, onSelect }: BudgetPresetsProps) {
  return (
    <div aria-label="Chọn nhanh ngân sách" className="grid grid-cols-2 gap-2" role="group">
      {BUDGET_PRESETS_VND.map((budgetVnd) => (
        <Button
          aria-pressed={selectedVnd === budgetVnd}
          className="h-10 px-3 text-sm"
          key={budgetVnd}
          type="button"
          variant={selectedVnd === budgetVnd ? "default" : "outline"}
          onClick={() => onSelect(budgetVnd)}
        >
          {formatVnd(budgetVnd)} VND
        </Button>
      ))}
    </div>
  )
}
