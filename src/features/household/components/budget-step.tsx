import { Button } from "@/app/components/ui/button"

import { formatVnd, parseVnd } from "../budget-vnd"
import { BudgetPresets } from "./budget-presets"

interface BudgetStepProps {
  heading?: string
  onBack: () => void
  onChange: (value: string) => void
  onContinue: () => void
  value: string
}

export function BudgetStep({
  heading = "Ngân sách cho 7 bữa chính",
  value,
  onBack,
  onChange,
  onContinue
}: BudgetStepProps) {
  const parsed = parseVnd(value)
  const valid = parsed !== null && parsed >= 1 && parsed <= 100_000_000
  const showError = value !== "" && !valid

  return (
    <section aria-labelledby="budget-step-heading" className="flex flex-col gap-5">
      <div>
        <h1 id="budget-step-heading" className="text-2xl font-extrabold tracking-tight text-ink">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Ngân sách này chỉ áp dụng cho 7 bữa chính trong tuần.
        </p>
      </div>
      <label className="flex flex-col gap-2 font-medium">
        Ngân sách tuần (VND)
        <input
          className="h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 text-base transition-colors focus:border-herb-500"
          inputMode="numeric"
          name="weeklyBudget"
          type="text"
          value={value}
          onBlur={() => {
            if (valid && parsed !== null) onChange(formatVnd(parsed))
          }}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Chọn nhanh</p>
        <BudgetPresets
          selectedVnd={parsed}
          onSelect={(budgetVnd) => onChange(formatVnd(budgetVnd))}
        />
      </div>
      <p className="text-sm text-ink-soft">Nhập số tiền từ 1 đến 100.000.000 VND.</p>
      {valid && parsed !== null ? (
        <div className="rounded-2xl border border-herb-200 bg-herb-50/60 p-3 text-xs text-herb-900 shadow-soft dark:border-herb-800/40 dark:bg-herb-950/30 dark:text-herb-200">
          <p className="font-semibold text-herb-800 dark:text-herb-300">
            Ước tính định mức theo bữa:
          </p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5 text-ink-soft">
            <li>
              Nấu cả 7 ngày: ~
              <strong className="text-ink">{formatVnd(Math.round(parsed / 7))} đ</strong> / bữa
              chính
            </li>
            <li>
              Nấu 5 ngày (T2–T6): ~
              <strong className="text-ink">{formatVnd(Math.round(parsed / 5))} đ</strong> / bữa
              chính
            </li>
          </ul>
        </div>
      ) : null}
      {showError ? (
        <p role="alert" className="text-sm text-chilli-700">
          Ngân sách phải là số VND hợp lệ trong giới hạn.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button className="h-11" type="button" variant="outline" onClick={onBack}>
          Quay lại
        </Button>
        <Button className="h-11" type="button" disabled={!valid} onClick={onContinue}>
          Tiếp tục
        </Button>
      </div>
    </section>
  )
}
