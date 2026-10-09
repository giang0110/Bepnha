import { memo, useMemo, useState } from "react"
import { Icon } from "@/app/components/ui/icon"
import {
  analyzeWeeklyCookingTime,
  type DayCookingTimeInput
} from "@/domain/planner/weekly-cooking-time"

export interface WeeklyCookingScheduleCardProps {
  readonly items: readonly DayCookingTimeInput[]
  readonly eatOutDays?: readonly number[] | undefined
  readonly onSelectDay?: (dayIndex: number) => void
}

export const WeeklyCookingScheduleCard = memo(function WeeklyCookingScheduleCard({
  items,
  eatOutDays,
  onSelectDay
}: WeeklyCookingScheduleCardProps) {
  const [expanded, setExpanded] = useState(true)

  const eatOutSet = useMemo(() => new Set(eatOutDays ?? []), [eatOutDays])
  const cookingItems = useMemo(
    () => items.filter((item) => !eatOutSet.has(item.dayIndex)),
    [items, eatOutSet]
  )

  const summary = useMemo(() => analyzeWeeklyCookingTime(cookingItems), [cookingItems])
  const fullSummary = useMemo(() => analyzeWeeklyCookingTime(items), [items])

  if (fullSummary.days.length === 0) {
    return null
  }

  // Calculate highest duration for relative progress bar scaling (min 60m for balanced visuals)
  const maxMinutes = Math.max(60, ...summary.days.map((d) => d.elapsedMinutes))

  return (
    <section
      aria-label="Thời gian nấu và lịch trình tuần"
      className="grid gap-4 rounded-3xl border border-edge bg-paper-raised p-5 sm:p-6"
      data-testid="weekly-cooking-schedule-card"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-herb-100 text-herb-700 dark:bg-herb-900/50 dark:text-herb-300">
            <Icon name="clock" className="size-4 text-herb-700 dark:text-herb-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Thời gian nấu & Lịch trình tuần</h3>
            <p className="text-xs text-ink-soft">Phân bổ thời lượng 7 bữa cơm gia đình</p>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="cooking-schedule-details"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-paper px-3 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          data-testid="toggle-cooking-schedule-details"
        >
          <span>{expanded ? "Thu gọn" : "Chi tiết lịch trình"}</span>
          <Icon
            name="chevronDown"
            className={`size-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-edge bg-paper-sunken/60 p-3 sm:p-3.5">
          <span className="text-[11px] font-semibold text-ink-soft sm:text-xs">
            Tổng thời gian nấu
          </span>
          <p className="mt-1 text-sm font-extrabold text-ink tabular-nums sm:text-base">
            {summary.formattedTotalTimeVi}
          </p>
          <span className="text-[10px] text-ink-muted sm:text-[11px]">
            {eatOutSet.size > 0
              ? `${cookingItems.length} ngày nấu · ${eatOutSet.size} ngày ăn ngoài`
              : "7 bữa chính tuần"}
          </span>
        </div>

        <div className="rounded-2xl border border-edge bg-paper-sunken/60 p-3 sm:p-3.5">
          <span className="text-[11px] font-semibold text-ink-soft sm:text-xs">Trung bình/bữa</span>
          <p className="mt-1 text-sm font-extrabold text-ink tabular-nums sm:text-base">
            ~{summary.averageMinutes} phút
          </p>
          <span className="text-[10px] text-ink-muted sm:text-[11px]">
            {summary.weekdayAverageMinutes > 0 ? `Thường ~${summary.weekdayAverageMinutes}p` : ""}
          </span>
        </div>

        <div className="rounded-2xl border border-herb-200 bg-herb-50/70 p-3 dark:border-herb-900/40 dark:bg-herb-950/20 sm:p-3.5">
          <span className="text-[11px] font-semibold text-herb-800 dark:text-herb-300 sm:text-xs">
            Bữa nấu nhanh
          </span>
          <p className="mt-1 text-sm font-extrabold text-herb-700 dark:text-herb-300 tabular-nums sm:text-base">
            {summary.quickMealCount} bữa ⚡
          </p>
          <span className="text-[10px] text-herb-800/80 dark:text-herb-400 sm:text-[11px]">
            ≤ 30 phút vào bếp
          </span>
        </div>
      </div>

      {/* Collapsible Timeline and Insights */}
      {expanded && (
        <div id="cooking-schedule-details" className="grid gap-3.5 pt-1">
          {/* 7-Day Timeline Bar Chart */}
          <div
            className="grid gap-2 rounded-2xl border border-edge/80 bg-paper-sunken/40 p-3 sm:p-4"
            data-testid="cooking-schedule-timeline"
          >
            <div className="flex items-center justify-between text-xs text-ink-soft">
              <span className="font-semibold">Lịch trình từng ngày</span>
              <span className="text-[11px] text-ink-muted">Bấm vào ngày để xem bữa ăn</span>
            </div>

            <div className="grid gap-2">
              {fullSummary.days.map((day) => {
                const isEatOut = eatOutSet.has(day.dayIndex)

                if (isEatOut) {
                  return (
                    <button
                      key={day.dayIndex}
                      type="button"
                      onClick={() => onSelectDay?.(day.dayIndex)}
                      className="group flex flex-col gap-1.5 rounded-xl border border-amber-200/60 bg-amber-50/40 p-2 text-left transition-colors hover:border-amber-300 dark:border-amber-900/40 dark:bg-amber-950/20 sm:p-2.5"
                      data-testid={`cooking-schedule-day-${day.dayIndex}`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="font-bold text-ink">{day.dayLabelVi}</span>
                          <span className="truncate text-amber-800 dark:text-amber-300">
                            — Ăn ngoài / Nghỉ nấu
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-300">
                            Ăn ngoài 🍜
                          </span>
                          <span className="font-bold text-amber-900/80 dark:text-amber-300/80 text-[11px]">
                            Nghỉ nấu
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                }

                const percent = Math.min(100, Math.round((day.elapsedMinutes / maxMinutes) * 100))

                const barColor =
                  day.category === "quick"
                    ? "bg-herb-500"
                    : day.category === "standard"
                      ? "bg-clay-500"
                      : "bg-amber-500"

                const badgeBg =
                  day.category === "quick"
                    ? "bg-herb-100 text-herb-800 dark:bg-herb-950/60 dark:text-herb-300"
                    : day.category === "standard"
                      ? "bg-clay-100 text-clay-800 dark:bg-clay-950/60 dark:text-clay-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"

                return (
                  <button
                    key={day.dayIndex}
                    type="button"
                    onClick={() => onSelectDay?.(day.dayIndex)}
                    className="group flex flex-col gap-1.5 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-edge hover:bg-paper sm:p-2.5"
                    data-testid={`cooking-schedule-day-${day.dayIndex}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="font-bold text-ink">{day.dayLabelVi}</span>
                        {day.isWeekend && (
                          <span className="rounded bg-clay-100 px-1 py-0.2 text-[10px] font-bold text-clay-800 dark:bg-clay-900 dark:text-clay-200">
                            Cuối tuần
                          </span>
                        )}
                        <span className="truncate text-ink-soft group-hover:text-ink">
                          — {day.mealOptionNameVi}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeBg}`}
                        >
                          {day.category === "quick"
                            ? "Nhanh"
                            : day.category === "standard"
                              ? "Tiêu chuẩn"
                              : "Nấu kỹ"}
                        </span>
                        <span className="font-extrabold text-ink tabular-nums">
                          {day.elapsedMinutes}p
                        </span>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Schedule Insights */}
          {summary.scheduleInsights.length > 0 && (
            <div
              className="rounded-2xl border border-edge/60 bg-paper p-3 text-xs text-ink-soft sm:p-3.5"
              data-testid="cooking-schedule-insights"
            >
              <div className="mb-2 flex items-center gap-1.5 font-bold text-ink">
                <span>💡</span>
                <span>Gợi ý chuẩn bị trong tuần</span>
              </div>
              <ul className="grid gap-1.5 pl-4 list-disc text-ink-soft">
                {summary.scheduleInsights.map((insight, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
})
