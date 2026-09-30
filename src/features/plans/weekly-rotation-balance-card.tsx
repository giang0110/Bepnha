import { Icon } from "@/app/components/ui/icon"
import {
  analyzeWeeklyRotation,
  proteinGroupLabel,
  type ProteinGroup
} from "@/domain/planner/meal-rotation-insights"
import type { PlanItemView } from "./planner-api"

interface Props {
  readonly items: readonly PlanItemView[]
  readonly weekStart: string
}

export function WeeklyRotationBalanceCard({ items, weekStart }: Props) {
  const report = analyzeWeeklyRotation(items, weekStart)

  const activeProteins = (Object.entries(report.proteinCounts) as [ProteinGroup, number][]).filter(
    ([group, count]) => group !== "other" && count > 0
  )

  return (
    <section
      aria-label="Cân bằng thực đơn và phong tục Việt"
      className="grid gap-3 rounded-3xl border border-edge bg-paper-raised p-5 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge/60 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="bowl" className="size-4 text-clay-700" />
          <h3 className="text-sm font-bold text-ink">Cân bằng đạm & Phong tục tuần này</h3>
        </div>
      </div>

      {/* Protein variety distribution badges */}
      <div>
        <p className="text-xs font-semibold text-ink-soft">Phân bố nguồn đạm trong tuần:</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {activeProteins.map(([group, count]) => (
            <span
              className="rounded-full bg-paper-sunken px-2.5 py-1 text-xs font-bold text-ink"
              key={group}
            >
              {proteinGroupLabel(group)}: <span className="text-herb-700">{count} bữa</span>
            </span>
          ))}
        </div>
      </div>

      {/* Lunar Calendar & Vegetarian Day Advisory */}
      {report.lunarVegetarianDays.length > 0 && (
        <div className="rounded-2xl border border-herb-200 bg-herb-50/70 p-3 text-xs leading-relaxed text-herb-900">
          <div className="flex items-start gap-2">
            <Icon name="leaf" className="mt-0.5 size-4 shrink-0 text-herb-700" />
            <div>
              <p className="font-bold">Lịch Âm & Nhắc ngày Ăn Chay</p>
              {report.lunarVegetarianDays.map((lunarDay) => (
                <p className="mt-1 text-ink" key={lunarDay.dayIndex}>
                  • {lunarDay.advisory}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Consecutive Protein Repeats Advisory (Anti-boredom) */}
      {report.consecutiveRepeats.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900">
          <div className="flex items-start gap-2">
            <Icon name="flame" className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">Gợi ý đổi vị chống ngán</p>
              {report.consecutiveRepeats.map((repeat) => (
                <p className="mt-1 text-ink" key={`${repeat.dayIndex1}-${repeat.dayIndex2}`}>
                  • {repeat.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Weekend meal highlights */}
      {report.weekendMeals.some((w) => w.isCelebratory) && (
        <p className="text-xs text-ink-soft">
          🍲 <strong>Cuối tuần sum họp:</strong>{" "}
          {report.weekendMeals
            .filter((w) => w.isCelebratory)
            .map((w) => `${w.dayName} (${w.mealName})`)
            .join(" · ")}
        </p>
      )}
    </section>
  )
}
