import { Button } from "@/app/components/ui/button"

import { formatVnd, parseVnd } from "../budget-vnd"

interface BudgetStepProps {
  onBack: () => void
  onChange: (value: string) => void
  onContinue: () => void
  value: string
}

export function BudgetStep({ value, onBack, onChange, onContinue }: BudgetStepProps) {
  const parsed = parseVnd(value)
  const valid = parsed !== null && parsed >= 1 && parsed <= 100_000_000
  const showError = value !== "" && !valid

  return (
    <section aria-labelledby="budget-step-heading" className="flex flex-col gap-5">
      <div>
        <h1 id="budget-step-heading" className="text-2xl font-semibold">
          Ngân sách cho 7 bữa chính
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Ngân sách này chỉ áp dụng cho 7 bữa chính trong tuần.
        </p>
      </div>
      <label className="flex flex-col gap-2 font-medium">
        Ngân sách tuần (VND)
        <input
          className="h-11 rounded-lg border px-3 text-base"
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
      <p className="text-sm text-slate-600">Nhập số tiền từ 1 đến 100.000.000 VND.</p>
      {showError ? (
        <p role="alert" className="text-sm text-red-700">
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
