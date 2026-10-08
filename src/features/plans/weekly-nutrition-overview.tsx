import { useMemo, useState } from "react"

import { Icon } from "@/app/components/ui/icon"
import { calculateWeeklyNutritionOverview } from "@/domain/nutrition/weekly-nutrition-overview"

import type { PlanItemView } from "./planner-api"

export interface WeeklyNutritionOverviewPanelProps {
  readonly items: readonly PlanItemView[]
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "protein_rich":
      return {
        label: "Nhiều đạm",
        className: "bg-clay-100 text-clay-900 border-clay-300"
      }
    case "fat_rich":
      return {
        label: "Nhiều chất béo",
        className: "bg-amber-100 text-amber-900 border-amber-300"
      }
    case "carb_rich":
      return {
        label: "Nhiều tinh bột",
        className: "bg-broth-100 text-broth-900 border-broth-300"
      }
    case "balanced":
      return {
        label: "Cân đối hài hòa",
        className: "bg-herb-100 text-herb-900 border-herb-300"
      }
    default:
      return {
        label: "Tham khảo",
        className: "bg-paper-sunken text-ink-soft border-edge"
      }
  }
}

export function WeeklyNutritionOverviewPanel({
  items
}: Readonly<WeeklyNutritionOverviewPanelProps>) {
  const [expanded, setExpanded] = useState(true)

  const overview = useMemo(
    () =>
      calculateWeeklyNutritionOverview(
        items.map((item) => ({ nutrients: item.nutrition.nutrients }))
      ),
    [items]
  )

  if (overview.mealCount === 0) return null

  const badge = statusBadge(overview.macroBalanceStatus)

  return (
    <section
      aria-label="Cân bằng dinh dưỡng cả tuần"
      className="rounded-3xl border border-edge bg-paper-raised p-5 shadow-soft sm:p-6"
      data-print="hide"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-ink sm:text-base">
            <Icon name="soup" className="size-5 text-broth-700" />
            Cân bằng dinh dưỡng cả tuần
          </p>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <button
          aria-expanded={expanded}
          aria-label="Chi tiết dinh dưỡng"
          className="inline-flex size-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <svg
            className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
        </button>
      </div>

      <p className="mt-1 text-xs text-ink-soft">
        Ước tính trung bình mỗi bữa chính ({overview.mealCount} bữa trong kế hoạch tuần)
      </p>

      {/* Macronutrient Distribution Bar */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink">
          <span>Phân bổ năng lượng đa lượng</span>
          <span className="text-ink-soft">100% Calo</span>
        </div>
        <div
          aria-label="Tỷ lệ năng lượng đa lượng"
          className="flex h-3 w-full overflow-hidden rounded-full bg-paper-sunken shadow-inner"
        >
          <div
            className="bg-clay-600 transition-all duration-300"
            style={{ width: `${overview.proteinCaloriePercent}%` }}
            title={`Chất đạm: ${overview.proteinCaloriePercent}%`}
          />
          <div
            className="bg-broth-600 transition-all duration-300"
            style={{ width: `${overview.carbCaloriePercent}%` }}
            title={`Tinh bột: ${overview.carbCaloriePercent}%`}
          />
          <div
            className="bg-amber-500 transition-all duration-300"
            style={{ width: `${overview.fatCaloriePercent}%` }}
            title={`Chất béo: ${overview.fatCaloriePercent}%`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <span className="inline-block size-2.5 rounded-full bg-clay-600" />
            Đạm {overview.proteinCaloriePercent.toLocaleString("vi-VN")}%
          </span>
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <span className="inline-block size-2.5 rounded-full bg-broth-600" />
            Tinh bột {overview.carbCaloriePercent.toLocaleString("vi-VN")}%
          </span>
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <span className="inline-block size-2.5 rounded-full bg-amber-500" />
            Chất béo {overview.fatCaloriePercent.toLocaleString("vi-VN")}%
          </span>
        </div>
      </div>

      {expanded && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-edge bg-paper px-3 py-2.5">
              <dt className="text-xs font-medium text-ink-soft">Năng lượng TB</dt>
              <dd className="mt-1 text-base font-bold text-ink tabular-nums">
                {overview.averageEnergyKcal.toLocaleString("vi-VN")} kcal
              </dd>
            </div>
            <div className="rounded-2xl border border-edge bg-paper px-3 py-2.5">
              <dt className="text-xs font-medium text-ink-soft">Chất đạm TB</dt>
              <dd className="mt-1 text-base font-bold text-clay-800 tabular-nums">
                {overview.averageProteinG.toLocaleString("vi-VN")} g
              </dd>
            </div>
            <div className="rounded-2xl border border-edge bg-paper px-3 py-2.5">
              <dt className="text-xs font-medium text-ink-soft">Tinh bột TB</dt>
              <dd className="mt-1 text-base font-bold text-broth-900 tabular-nums">
                {overview.averageCarbohydrateG.toLocaleString("vi-VN")} g
              </dd>
            </div>
            <div className="rounded-2xl border border-edge bg-paper px-3 py-2.5">
              <dt className="text-xs font-medium text-ink-soft">Chất béo TB</dt>
              <dd className="mt-1 text-base font-bold text-amber-800 tabular-nums">
                {overview.averageFatG.toLocaleString("vi-VN")} g
              </dd>
            </div>
            <div className="rounded-2xl border border-edge bg-paper px-3 py-2.5">
              <dt className="text-xs font-medium text-ink-soft">Chất xơ TB</dt>
              <dd className="mt-1 text-base font-bold text-herb-800 tabular-nums">
                {overview.averageFibreG.toLocaleString("vi-VN")} g
              </dd>
            </div>
            <div className="rounded-2xl border border-edge bg-paper px-3 py-2.5">
              <dt className="text-xs font-medium text-ink-soft">Natri TB</dt>
              <dd className="mt-1 text-base font-bold text-ink tabular-nums">
                {overview.averageSodiumMg.toLocaleString("vi-VN")} mg
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs leading-relaxed text-ink-soft">💡 {overview.summaryMessage}</p>
        </>
      )}
    </section>
  )
}
