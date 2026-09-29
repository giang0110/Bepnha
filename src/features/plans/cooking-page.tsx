import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type {
  MealRating,
  MealRatingRepository
} from "@/application/meal-rating/meal-rating-repository"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import { useAuth } from "@/app/auth/auth-context"
import { AppPageShell } from "@/app/components/app-page-shell"
import { Button, buttonVariants } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"

import { cookingSequence, type CookingStep } from "./cooking-sequence"
import {
  clearCookingProgress,
  loadCookingProgress,
  saveCookingProgress,
  type TimerProgressV1
} from "./cooking-progress-store"
import { formatCountdown, secondsRemaining } from "./cooking-timer"
import {
  EMPTY_INGREDIENT_LABELS,
  ingredientLabels,
  type IngredientLabels
} from "./ingredient-labels"
import type { PlanItemView, PlannerApi } from "./planner-api"
import { MealRatingControl } from "./meal-rating-control"
import { useWakeLock } from "./use-wake-lock"
import { currentWeekStart } from "./week-start"

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

interface Props {
  readonly foodOptionsRepository: PantryFoodOptionsRepository
  readonly householdRepository: HouseholdRepository
  readonly plannerApi: PlannerApi
  /**
   * Optional, like on the week screen: without it the question simply is not asked, which is better
   * than a control that cannot store the answer.
   */
  readonly mealRatingRepository?: MealRatingRepository
  readonly today?: () => Date
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error" }
  | {
      readonly status: "ready"
      readonly revisionId: string
      readonly item: PlanItemView
      readonly mealName: string
    }

/**
 * The countdown for one step.
 *
 * It re-renders on a half-second interval but reads the clock every time rather than decrementing a
 * counter, so a phone that throttles the tab cannot make it finish late. The interval only decides
 * how often the number is repainted; `secondsRemaining` decides what it says.
 */
function StepTimer({
  minutes,
  progress,
  onProgress
}: Readonly<{
  minutes: number
  progress?: TimerProgressV1
  onProgress: (progress: TimerProgressV1) => void
}>) {
  const total = minutes * 60
  const startedAt = progress?.startedAt ?? null
  const pausedWith = progress?.pausedWith ?? null
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
    const current = Date.now()
    onProgress({ startedAt: current - (total - carry) * 1000, pausedWith: null })
    setNow(current)
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onProgress({ startedAt, pausedWith: remaining })}
          >
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
            onClick={() => onProgress({ startedAt: null, pausedWith: null })}
          >
            Đặt lại
          </Button>
        )}
      </div>
    </div>
  )
}

function StepView({
  step,
  timerProgress,
  onTimerProgress
}: Readonly<{
  step: CookingStep
  timerProgress?: TimerProgressV1
  onTimerProgress: (progress: TimerProgressV1) => void
}>) {
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

      {step.ingredientDetails.length > 0 && (
        <div className="rounded-2xl bg-paper-sunken px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Icon name="leaf" className="size-4 text-herb-600" />
            Nguyên liệu cho bước này
          </p>
          <ul className="mt-1 grid gap-1 text-ink-soft">
            {step.ingredientDetails.map((ingredient) => (
              <li key={ingredient.recipeIngredientId}>{ingredient.label}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Keyed by step so moving on gives a fresh timer: carrying a running countdown into the
          next instruction would time the wrong thing. */}
      {step.timerMinutes === null ? null : (
        <StepTimer
          key={step.key}
          minutes={step.timerMinutes}
          onProgress={onTimerProgress}
          {...(timerProgress === undefined ? {} : { progress: timerProgress })}
        />
      )}
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
  mealRatingRepository,
  today
}: Props) {
  const auth = useAuth()
  const params = useParams()
  const dayIndex = Number(params.dayIndex)
  const accessToken = auth.session?.accessToken

  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [rating, setRating] = useState<MealRating | null>(null)
  const [labels, setLabels] = useState<IngredientLabels>(EMPTY_INGREDIENT_LABELS)
  const [index, setIndex] = useState(0)
  const [timers, setTimers] = useState<Readonly<Record<string, TimerProgressV1>>>({})
  const [loadedProgressScope, setLoadedProgressScope] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

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
        weekStart: currentWeekStart(now())
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
      const progressScope = `${result.value.revisionId}:${String(dayIndex)}`
      const progress = loadCookingProgress(window.localStorage, result.value.revisionId, dayIndex)
      const initialSteps = cookingSequence(item, EMPTY_INGREDIENT_LABELS)
      const restoredIndex =
        progress === null
          ? -1
          : initialSteps.findIndex((candidate) => candidate.key === progress.stepKey)
      setHouseholdId(household.household.householdId)
      setIndex(restoredIndex < 0 ? 0 : restoredIndex)
      setTimers(progress?.timers ?? {})
      setLoadedProgressScope(progressScope)
      setState({
        status: "ready",
        revisionId: result.value.revisionId,
        item,
        mealName: item.mealOptionNameVi
      })
      if (mealRatingRepository !== undefined) {
        const stored = await mealRatingRepository
          .load(household.household.householdId)
          .catch(() => null)
        if (cancelled || stored === null) return
        setRating(
          stored.liked.includes(item.mealOptionId)
            ? "liked"
            : stored.disliked.includes(item.mealOptionId)
              ? "disliked"
              : null
        )
      }
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
  }, [accessToken, dayIndex, householdRepository, mealRatingRepository, plannerApi, reloadToken])

  useWakeLock(state.status === "ready")

  const steps = useMemo(
    () => (state.status === "ready" ? cookingSequence(state.item, labels) : []),
    [labels, state]
  )
  const progressScope = state.status === "ready" ? `${state.revisionId}:${String(dayIndex)}` : null
  const step = steps[index]

  useEffect(() => {
    if (
      state.status !== "ready" ||
      progressScope === null ||
      loadedProgressScope !== progressScope ||
      step === undefined
    ) {
      return
    }
    saveCookingProgress(window.localStorage, {
      version: "cooking-progress-v1",
      revisionId: state.revisionId,
      dayIndex,
      stepKey: step.key,
      timers
    })
  }, [dayIndex, loadedProgressScope, progressScope, state, step, timers])
  // Narrowed here rather than at the call site: the control renders deep inside the ready branch,
  // where TypeScript has lost the discriminant.
  const ratedMealOptionId = state.status === "ready" ? state.item.mealOptionId : null

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
        <div className="grid justify-items-start gap-3" role="alert">
          <p>Không mở được kế hoạch lúc này.</p>
          {/* A cook loses their place on a reload, so this screen needs the retry most of all. */}
          <Button
            type="button"
            onClick={() => {
              setState({ status: "loading" })
              setReloadToken((token) => token + 1)
            }}
          >
            Thử lại
          </Button>
        </div>
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

          <StepView
            step={step}
            onTimerProgress={(progress) =>
              setTimers((current) => ({ ...current, [step.key]: progress }))
            }
            {...(timers[step.key] === undefined ? {} : { timerProgress: timers[step.key] })}
          />

          {/* Only on the last step, and only here. An opinion about a dish is formed by cooking it,
              so this is the one moment the household has an answer — and on the week screen the same
              question sits four taps deep inside a panel about ingredients. It is an offer, not a
              toll: "Nấu xong" leaves whether or not anyone answers. */}
          {index === steps.length - 1 &&
          mealRatingRepository !== undefined &&
          householdId !== null &&
          ratedMealOptionId !== null ? (
            <MealRatingControl
              mealOptionId={ratedMealOptionId}
              rating={rating}
              onRate={(mealOptionId, next) => {
                const previous = rating
                setRating(next)
                void mealRatingRepository
                  .set(householdId, mealOptionId, next)
                  .catch(() => setRating(previous))
              }}
            />
          ) : null}

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
              <Link
                className={buttonVariants({ size: "lg", className: "flex-1" })}
                to="/plan"
                onClick={() => {
                  if (state.status === "ready") {
                    clearCookingProgress(window.localStorage, state.revisionId, dayIndex)
                    setLoadedProgressScope(null)
                  }
                }}
              >
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
