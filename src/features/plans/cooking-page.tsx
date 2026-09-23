import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import { useAuth } from "@/app/auth/auth-context"
import { AppPageShell } from "@/app/components/app-page-shell"
import { Button, buttonVariants } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"

import { cookingSequence, type CookingStep } from "./cooking-sequence"
import { formatCountdown, secondsRemaining } from "./cooking-timer"
import {
  EMPTY_INGREDIENT_LABELS,
  ingredientLabels,
  type IngredientLabels
} from "./ingredient-labels"
import type { PlanItemView, PlannerApi } from "./planner-api"
import { useWakeLock } from "./use-wake-lock"
import { planWeekStart } from "./week-start"

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

interface Props {
  readonly foodOptionsRepository: PantryFoodOptionsRepository
  readonly householdRepository: HouseholdRepository
  readonly plannerApi: PlannerApi
  readonly today?: () => Date
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly item: PlanItemView; readonly mealName: string }

/**
 * The countdown for one step.
 *
 * It re-renders on a half-second interval but reads the clock every time rather than decrementing a
 * counter, so a phone that throttles the tab cannot make it finish late. The interval only decides
 * how often the number is repainted; `secondsRemaining` decides what it says.
 */
function StepTimer({ minutes }: Readonly<{ minutes: number }>) {
  const total = minutes * 60
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [pausedWith, setPausedWith] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const running = startedAt !== null && pausedWith === null

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  const remaining = secondsRemaining(total, startedAt, pausedWith, now)
  const done = startedAt !== null && remaining <= 0

  const start = () => {
    const carry = pausedWith ?? total
    setStartedAt(Date.now() - (total - carry) * 1000)
    setPausedWith(null)
    setNow(Date.now())
  }

  return (
    <div className="rounded-3xl border border-edge bg-paper-raised p-4 text-center shadow-soft">
      <p
        className={`text-5xl font-extrabold tabular-nums ${done ? "text-chilli-700" : "text-ink"}`}
      >
        {formatCountdown(remaining)}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink-soft" role="status">
        {done ? "Hết giờ" : `Hẹn giờ ${minutes} phút`}
      </p>
      <div className="mt-3 flex justify-center gap-2">
        {running ? (
          <Button type="button" variant="outline" onClick={() => setPausedWith(remaining)}>
            Tạm dừng
          </Button>
        ) : (
          <Button type="button" onClick={start}>
            {pausedWith === null && startedAt === null ? "Bắt đầu" : "Tiếp tục"}
          </Button>
        )}
        {startedAt === null ? null : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStartedAt(null)
              setPausedWith(null)
            }}
          >
            Đặt lại
          </Button>
        )}
      </div>
    </div>
  )
}

function StepView({ step }: Readonly<{ step: CookingStep }>) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-clay-50 px-3 py-1 text-sm font-bold text-clay-900">
          {step.dishLabel}
        </span>
        <span className="text-sm font-semibold text-ink-soft">
          Bước {step.stepNumber}/{step.stepCount}
        </span>
      </div>

      <p className="text-2xl leading-snug font-bold text-balance text-ink sm:text-3xl">
        {step.instructionVi}
      </p>

      {step.conditions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {step.conditions.map((condition) => (
            <li
              className="rounded-full bg-broth-50 px-3 py-1 text-sm font-bold text-broth-900"
              key={condition}
            >
              {condition}
            </li>
          ))}
        </ul>
      )}

      {step.ingredientNames.length > 0 && (
        <div className="rounded-2xl bg-paper-sunken px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Icon name="leaf" className="size-4 text-herb-600" />
            Nguyên liệu cho bước này
          </p>
          <p className="mt-1 text-ink-soft">{step.ingredientNames.join(", ")}</p>
        </div>
      )}

      {/* Keyed by step so moving on gives a fresh timer: carrying a running countdown into the
          next instruction would time the wrong thing. */}
      {step.timerMinutes === null ? null : <StepTimer key={step.key} minutes={step.timerMinutes} />}
    </div>
  )
}

/**
 * One instruction at a time, in the order the meal is cooked.
 *
 * The plan page shows every step at once, which is right for deciding what to make and wrong for
 * standing at the stove: the data a cook needs is a single line, large enough to read from arm's
 * length with wet hands. This screen exists because the step detail — time, heat, temperature,
 * which ingredients — was already being collected and was only ever readable in a fold-out panel.
 *
 * The week is re-read rather than passed through navigation state, so arriving here from a fresh
 * tab, a reload, or a locked phone works the same as arriving from the plan.
 */
export function CookingPage({
  foodOptionsRepository,
  householdRepository,
  plannerApi,
  today
}: Props) {
  const auth = useAuth()
  const params = useParams()
  const dayIndex = Number(params.dayIndex)
  const accessToken = auth.session?.accessToken

  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [labels, setLabels] = useState<IngredientLabels>(EMPTY_INGREDIENT_LABELS)
  const [index, setIndex] = useState(0)

  const now = today ?? (() => new Date())

  useEffect(() => {
    let cancelled = false
    void foodOptionsRepository
      .load()
      .then((options) => {
        if (!cancelled) setLabels(ingredientLabels(options))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [foodOptionsRepository])

  useEffect(() => {
    if (accessToken === undefined) return
    let cancelled = false

    const run = async () => {
      const household = await loadHousehold(householdRepository)
      if (cancelled) return
      if (!household.ok || household.household === null) {
        setState({ status: "missing" })
        return
      }
      const result = await plannerApi.current(accessToken, {
        householdId: household.household.householdId,
        weekStart: planWeekStart(now())
      })
      if (cancelled) return
      if (!result.ok) {
        setState({ status: "error" })
        return
      }
      if (result.value === null) {
        setState({ status: "missing" })
        return
      }
      const item = result.value.plan.items.find((candidate) => candidate.dayIndex === dayIndex)
      if (item === undefined) {
        setState({ status: "missing" })
        return
      }
      setState({ status: "ready", item, mealName: item.mealOptionNameVi })
    }

    void run().catch(() => {
      if (!cancelled) setState({ status: "error" })
    })
    return () => {
      cancelled = true
    }
    // `now` is a clock, not state: re-reading the week whenever it changes identity would refetch
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, dayIndex, householdRepository, plannerApi])

  useWakeLock(state.status === "ready")

  const steps = state.status === "ready" ? cookingSequence(state.item, labels) : []
  const step = steps[index]

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(steps.length - 1, 0)))
    },
    [steps.length]
  )

  const dayLabel = DAY_LABELS[dayIndex] ?? "Bữa chính"

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-6 text-ink sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-herb-700">{dayLabel}</p>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">
            {state.status === "ready" ? state.mealName : "Đang nấu"}
          </h1>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap text-ink-soft hover:bg-paper-sunken"
          to="/plan"
        >
          Xong
        </Link>
      </header>

      {state.status === "loading" ? <p role="status">Đang mở kế hoạch…</p> : null}
      {state.status === "error" ? (
        <p role="alert">Không mở được kế hoạch lúc này. Vui lòng thử lại.</p>
      ) : null}
      {state.status === "missing" ? (
        <p role="alert">
          Chưa có bữa này trong kế hoạch tuần.{" "}
          <Link className="font-bold text-herb-700 underline" to="/plan">
            Về kế hoạch
          </Link>
        </p>
      ) : null}

      {step === undefined ? null : (
        <>
          <div aria-hidden="true" className="flex gap-1">
            {steps.map((candidate, position) => (
              <span
                className={`h-1.5 flex-1 rounded-full ${
                  position <= index ? "bg-herb-500" : "bg-paper-sunken"
                }`}
                key={candidate.key}
              />
            ))}
          </div>

          <p className="text-sm font-semibold text-ink-soft" role="status">
            Món {step.dishNumber}/{step.dishCount} · Tổng bước {index + 1}/{steps.length}
          </p>

          <StepView step={step} />

          <div className="mt-auto flex gap-3 pt-4">
            <Button
              className="flex-1"
              disabled={index === 0}
              size="lg"
              type="button"
              variant="outline"
              onClick={() => go(-1)}
            >
              Bước trước
            </Button>
            {index === steps.length - 1 ? (
              <Link className={buttonVariants({ size: "lg", className: "flex-1" })} to="/plan">
                Nấu xong
              </Link>
            ) : (
              <Button className="flex-1" size="lg" type="button" onClick={() => go(1)}>
                Bước tiếp
              </Button>
            )}
          </div>
        </>
      )}
    </AppPageShell>
  )
}
