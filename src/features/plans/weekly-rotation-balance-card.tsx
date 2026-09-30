import { useState } from "react"
import { Icon } from "@/app/components/ui/icon"
import {
  analyzeWeeklyRotation,
  proteinGroupLabel,
  type ProteinGroup
} from "@/domain/planner/meal-rotation-insights"
import {
  analyzeSeasonalBalance,
  type WeatherTendency
} from "@/domain/planner/seasonal-weather-insights"
import { summarizeLeftoverEfficiency } from "@/domain/pantry/leftover-meal-matcher"
import type { PlanItemView } from "./planner-api"

interface Props {
  readonly items: readonly PlanItemView[]
  readonly weekStart: string
  readonly availableFoodNames?: readonly string[]
}

export function WeeklyRotationBalanceCard({ items, weekStart, availableFoodNames }: Props) {
  const [weatherOverride, setWeatherOverride] = useState<WeatherTendency | undefined>(undefined)

  const report = analyzeWeeklyRotation(items, weekStart)
  const seasonalReport = analyzeSeasonalBalance(items, weekStart, weatherOverride)
  const leftoverReport =
    availableFoodNames && availableFoodNames.length > 0
      ? summarizeLeftoverEfficiency(availableFoodNames)
      : null

  const activeProteins = (Object.entries(report.proteinCounts) as [ProteinGroup, number][]).filter(
    ([group, count]) => group !== "other" && count > 0
  )

  return (
    <section
      aria-label="Cân bằng thực đơn và phong tục Việt"
      className="grid gap-4 rounded-3xl border border-edge bg-paper-raised p-5 shadow-soft"
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

      {/* Seasonal & Weather Dining Balance (New Feature) */}
      <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3.5 text-xs text-sky-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="sun" className="size-4 shrink-0 text-amber-600" />
            <span className="font-bold text-ink">
              Tiết trời & Cân bằng theo mùa:{" "}
              <span className="text-clay-700">{seasonalReport.seasonLabel}</span>
            </span>
          </div>

          {/* Interactive weather tendency toggle */}
          <div className="flex items-center gap-1 rounded-full bg-paper-sunken p-0.5">
            <button
              type="button"
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                seasonalReport.weatherTendency === "hot"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
              onClick={() => setWeatherOverride("hot")}
              title="Xem gợi ý khi thời tiết nắng nóng, oi bức"
            >
              Nắng nóng ☀️
            </button>
            <button
              type="button"
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                seasonalReport.weatherTendency === "cold_rainy"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
              onClick={() => setWeatherOverride("cold_rainy")}
              title="Xem gợi ý khi thời tiết se lạnh, mưa rét"
            >
              Mưa rét 🌧️
            </button>
            {weatherOverride !== undefined && (
              <button
                type="button"
                className="rounded-full px-2 py-0.5 text-[10px] text-ink-soft underline hover:text-ink"
                onClick={() => setWeatherOverride(undefined)}
              >
                Mặc định
              </button>
            )}
          </div>
        </div>

        {/* Thermal distribution counters */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100/80 px-2.5 py-0.5 font-medium text-blue-900">
            <Icon name="leaf" className="size-3 text-blue-600" />
            {seasonalReport.coolingCount} món thanh nhiệt
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2.5 py-0.5 font-medium text-amber-900">
            <Icon name="flame" className="size-3 text-amber-700" />
            {seasonalReport.warmingCount} món ấm nồng
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-paper-raised px-2.5 py-0.5 font-medium text-ink-soft shadow-xs">
            {seasonalReport.neutralCount} món dịu vị
          </span>
        </div>

        {/* Seasonal Advisory */}
        <p className="mt-2 leading-relaxed text-ink font-medium">💡 {seasonalReport.advisoryVi}</p>

        {seasonalReport.seasonalRecommendations.length > 0 && (
          <ul className="mt-1.5 list-inside list-disc text-[11px] text-ink-soft">
            {seasonalReport.seasonalRecommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Leftover Pantry Reuse (If available pantry items are present) */}
      {leftoverReport !== null &&
        (leftoverReport.readyToCookCount > 0 || leftoverReport.almostReadyCount > 0) && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950">
            <div className="flex items-start gap-2">
              <Icon name="basket" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              <div>
                <p className="font-bold text-emerald-900">Tủ bếp & Tận dụng nguyên liệu tồn kho</p>
                <p className="mt-1 leading-relaxed text-ink">{leftoverReport.adviceVi}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {leftoverReport.suggestedDishes.map((dish) => (
                    <span
                      key={dish.dishId}
                      className={`rounded-full px-2.5 py-0.5 font-semibold text-[11px] ${
                        dish.status === "ready_to_cook"
                          ? "bg-emerald-600 text-white"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {dish.dishNameVi} (
                      {dish.status === "ready_to_cook"
                        ? "Đủ đồ"
                        : `Thiếu ${dish.missingIngredients.length}`}
                      )
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

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
