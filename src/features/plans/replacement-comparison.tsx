import type { PlanItemView } from "./planner-api"

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

const ROLE_LABEL: Readonly<Record<string, string>> = {
  staple: "Món tinh bột",
  main: "Món chính",
  vegetable: "Món rau",
  soup: "Món canh"
}

function mealSummary(item: PlanItemView) {
  return [...item.components]
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((component) => ROLE_LABEL[component.mealRole] ?? component.mealRole)
    .join(" · ")
}

export function ReplacementComparison({
  current,
  replacement,
  weeklyCostDeltaVnd
}: Readonly<{
  current: PlanItemView
  replacement: PlanItemView
  weeklyCostDeltaVnd: number
}>) {
  return (
    <div className="mt-3 grid gap-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-2xl bg-paper-sunken p-3" aria-label="Bữa hiện tại">
          <p className="text-xs font-semibold text-ink-soft">Hiện tại</p>
          <p className="mt-1 font-bold text-ink">{current.mealOptionNameVi}</p>
          <p className="mt-1 text-ink-soft">{current.elapsedMinutes} phút</p>
          <p className="mt-1 text-ink-soft">{mealSummary(current)}</p>
        </section>
        <section className="rounded-2xl bg-herb-50 p-3" aria-label="Bữa thay thế">
          <p className="text-xs font-semibold text-herb-800">Thay bằng</p>
          <p className="mt-1 font-bold text-ink">{replacement.mealOptionNameVi}</p>
          <p className="mt-1 text-ink-soft">{replacement.elapsedMinutes} phút</p>
          <p className="mt-1 text-ink-soft">{mealSummary(replacement)}</p>
        </section>
      </div>
      <p className="font-medium text-ink">
        {weeklyCostDeltaVnd >= 0 ? "Tăng" : "Giảm"} {formatVnd(Math.abs(weeklyCostDeltaVnd))} VND
        cho cả tuần
      </p>
      <p className="text-xs leading-5 text-ink-soft">
        Giỏ mua của cả 7 bữa được tính lại đầy đủ vì số gói cần mua không cộng trừ tuyến tính theo
        từng món.
      </p>
    </div>
  )
}
