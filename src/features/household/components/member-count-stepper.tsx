import { Button } from "@/app/components/ui/button"

interface MemberCountStepperProps {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
}

const MIN_COUNT = 0
const MAX_COUNT = 20

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_COUNT
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.trunc(value)))
}

export function MemberCountStepper({ label, value, onChange }: MemberCountStepperProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-edge-strong bg-paper-raised px-3 py-2">
      <label className="min-w-0 flex-1 font-medium" htmlFor={`member-count-${label}`}>
        {label}
      </label>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          aria-label={`Giảm ${label}`}
          className="size-10 px-0 text-lg"
          disabled={value <= MIN_COUNT}
          type="button"
          variant="outline"
          onClick={() => onChange(boundedCount(value - 1))}
        >
          −
        </Button>
        <input
          aria-label={label}
          className="h-10 w-12 rounded-xl border border-edge-strong bg-white px-1 text-center font-semibold tabular-nums"
          id={`member-count-${label}`}
          inputMode="numeric"
          max={MAX_COUNT}
          min={MIN_COUNT}
          type="number"
          value={value}
          onChange={(event) => onChange(boundedCount(Number(event.currentTarget.value || 0)))}
        />
        <Button
          aria-label={`Tăng ${label}`}
          className="size-10 px-0 text-lg"
          disabled={value >= MAX_COUNT}
          type="button"
          variant="outline"
          onClick={() => onChange(boundedCount(value + 1))}
        >
          +
        </Button>
      </div>
    </div>
  )
}
