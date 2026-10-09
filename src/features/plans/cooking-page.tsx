import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type {
  MealRating,
  MealRatingRepository
} from "@/application/meal-rating/meal-rating-repository"
import type { HouseholdRepository } from "@/application/household/household-repository"
import {
  PantryRepositoryError,
  type PantryRepository
} from "@/application/pantry/pantry-repository"
import type {
  PantryFoodOption,
  PantryFoodOptionsRepository
} from "@/application/pantry/pantry-food-options-repository"
import { useAuth } from "@/app/auth/auth-context"
import { AppPageShell } from "@/app/components/app-page-shell"
import { Button } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
import { toast } from "@/app/components/ui/toast"
import {
  calculatePantryCookingDeduction,
  type CookingPantryDeductionResultItem
} from "@/domain/pantry/pantry-cooking-deduction"
import { PantryCookingDeductionModal } from "./pantry-cooking-deduction-modal"

import { cookingSequence, mealRoleLabel, type CookingStep } from "./cooking-sequence"
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
import {
  cancelCookingSpeech,
  isSpeechSynthesisSupported,
  speakCookingInstruction
} from "./cooking-speech"
import { FamilyCookingNotes } from "./family-cooking-notes"
import {
  extractMealPrePrepGroups,
  extractStapleRiceSummary,
  type PrePrepDishGroup
} from "./cooking-pre-prep"
import {
  isTimerSoundEnabled,
  playKitchenTimerChime,
  setTimerSoundEnabled,
  startTimerAlarmLoop,
  triggerVibration
} from "./cooking-timer-alarm"
import { CondimentPairingCard } from "./condiment-pairing-card"
import { LeftoverStorageGuideCard } from "./leftover-storage-guide-card"
import { KitchenMeasurementModal } from "./kitchen-measurement-modal"

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
  readonly pantryRepository?: PantryRepository
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
  onProgress,
  counterMode = false
}: Readonly<{
  minutes: number
  progress?: TimerProgressV1
  onProgress: (progress: TimerProgressV1) => void
  counterMode?: boolean | undefined
}>) {
  const total = minutes * 60
  const startedAt = progress?.startedAt ?? null
  const pausedWith = progress?.pausedWith ?? null
  const [now, setNow] = useState(() => Date.now())
  const [alarmDismissed, setAlarmDismissed] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => isTimerSoundEnabled())

  const running = startedAt !== null && pausedWith === null

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  const remaining = secondsRemaining(total, startedAt, pausedWith, now)
  const done = startedAt !== null && remaining <= 0
  const alarmActive = done && !alarmDismissed

  useEffect(() => {
    if (!alarmActive) return
    const stop = startTimerAlarmLoop({
      isSoundEnabled: () => soundEnabled
    })
    return () => {
      stop()
    }
  }, [alarmActive, soundEnabled])

  const stopAlarm = () => {
    setAlarmDismissed(true)
  }

  const start = () => {
    setAlarmDismissed(false)
    const carry = pausedWith ?? total
    const current = Date.now()
    onProgress({ startedAt: current - (total - carry) * 1000, pausedWith: null })
    setNow(current)
  }

  const handleReset = () => {
    setAlarmDismissed(false)
    onProgress({ startedAt: null, pausedWith: null })
  }

  const handleToggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    if (typeof window !== "undefined") {
      setTimerSoundEnabled(window.localStorage, next)
    }
    toast.info(next ? "Đã bật chuông báo đếm giờ" : "Đã tắt chuông báo đếm giờ")
  }

  const handleTestSound = () => {
    playKitchenTimerChime()
    triggerVibration([100, 50, 100])
    toast.info("Đang thử chuông báo")
  }

  return (
    <div
      className={`rounded-3xl border p-4 text-center shadow-soft transition-colors ${
        done && alarmActive
          ? "border-chilli-300 bg-chilli-50/50 dark:border-chilli-800 dark:bg-chilli-950/20"
          : "border-edge bg-paper-raised"
      }`}
    >
      <p
        className={`tabular-nums font-black transition-all ${
          counterMode ? "py-2 text-6xl sm:text-7xl" : "text-5xl font-extrabold"
        } ${done ? "text-chilli-700 animate-pulse" : "text-ink"}`}
      >
        {formatCountdown(remaining)}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink-soft" role="status">
        {done
          ? alarmActive
            ? "🔔 Hết giờ! Đang báo chuông"
            : "Hết giờ"
          : `Hẹn giờ ${minutes} phút`}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {done && alarmActive ? (
          <Button
            type="button"
            variant="destructive"
            className="gap-1.5 font-bold animate-pulse"
            data-testid="dismiss-alarm-btn"
            onClick={stopAlarm}
          >
            <Icon name="speaker" className="size-4" />
            Dừng chuông
          </Button>
        ) : null}
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
          <Button type="button" variant="ghost" onClick={handleReset}>
            Đặt lại
          </Button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 border-t border-edge/60 pt-2.5 text-xs text-ink-soft">
        <button
          type="button"
          onClick={handleToggleSound}
          className="inline-flex items-center gap-1 font-medium hover:text-ink"
          data-testid="toggle-timer-sound-btn"
          title={soundEnabled ? "Tắt chuông báo" : "Bật chuông báo"}
        >
          <Icon
            name="speaker"
            className={`size-3.5 ${soundEnabled ? "text-herb-700" : "text-ink-muted opacity-50"}`}
          />
          <span>{soundEnabled ? "Chuông: Bật" : "Chuông: Tắt"}</span>
        </button>
        <span className="text-edge-strong">·</span>
        <button
          type="button"
          onClick={handleTestSound}
          className="hover:text-ink hover:underline"
          data-testid="test-timer-sound-btn"
        >
          Thử chuông
        </button>
      </div>
    </div>
  )
}

function resumeTimer(
  total: number,
  pausedWith: number | null
): { readonly progress: TimerProgressV1; readonly now: number } {
  const carry = pausedWith ?? total
  const current = Date.now()
  return {
    progress: { startedAt: current - (total - carry) * 1000, pausedWith: null },
    now: current
  }
}

function ActiveTimerBanner({
  bgStep,
  progress,
  onProgress,
  onJumpToStep
}: Readonly<{
  bgStep: CookingStep
  progress: TimerProgressV1
  onProgress: (progress: TimerProgressV1) => void
  onJumpToStep: () => void
}>) {
  const total = (bgStep.timerMinutes ?? 0) * 60
  const startedAt = progress.startedAt
  const pausedWith = progress.pausedWith
  const [now, setNow] = useState(() => Date.now())
  const [alarmDismissed, setAlarmDismissed] = useState(false)

  const running = startedAt !== null && pausedWith === null

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  const remaining = secondsRemaining(total, startedAt, pausedWith, now)
  const done = startedAt !== null && remaining <= 0
  const alarmActive = done && !alarmDismissed

  useEffect(() => {
    if (!alarmActive) return
    const stop = startTimerAlarmLoop({
      isSoundEnabled: () => isTimerSoundEnabled()
    })
    return () => {
      stop()
    }
  }, [alarmActive])

  const stopAlarm = () => {
    setAlarmDismissed(true)
  }

  const handleTogglePause = () => {
    setAlarmDismissed(false)
    if (running) {
      onProgress({ startedAt, pausedWith: remaining })
    } else {
      const resumed = resumeTimer(total, pausedWith)
      onProgress(resumed.progress)
      setNow(resumed.now)
    }
  }

  return (
    <div
      aria-label={`Đang đếm giờ: ${bgStep.dishLabel} bước ${bgStep.stepNumber}`}
      className={`flex items-center justify-between gap-3 rounded-2xl border p-3 shadow-soft transition-all ${
        done
          ? "border-chilli-300 bg-chilli-50 text-chilli-900 animate-pulse dark:border-chilli-800 dark:bg-chilli-950/40 dark:text-chilli-200"
          : "border-herb-300 bg-herb-50 text-herb-900 dark:border-herb-800 dark:bg-herb-950/40 dark:text-herb-200"
      }`}
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon
          name={done ? "flame" : "clock"}
          className={`size-4.5 shrink-0 ${done ? "text-chilli-600" : "text-herb-600"}`}
        />
        <div className="min-w-0 text-xs sm:text-sm">
          <p className="truncate font-bold">
            {bgStep.dishLabel} · Bước {bgStep.stepNumber}: {bgStep.instructionVi}
          </p>
          <p className="font-extrabold tabular-nums">
            {done
              ? alarmActive
                ? "🔔 Hết giờ! Đang báo chuông"
                : "Hết giờ!"
              : `${formatCountdown(remaining)} còn lại`}
            {pausedWith !== null && !done ? " (Đang tạm dừng)" : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {done && alarmActive ? (
          <Button
            size="sm"
            variant="destructive"
            className="h-8 rounded-full px-3 text-xs font-bold animate-pulse"
            type="button"
            data-testid="banner-dismiss-alarm-btn"
            onClick={stopAlarm}
          >
            Dừng chuông
          </Button>
        ) : null}
        {!done && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full px-2.5 text-xs font-semibold"
            type="button"
            onClick={handleTogglePause}
          >
            {running ? "Tạm dừng" : "Tiếp tục"}
          </Button>
        )}
        <Button
          size="sm"
          className="h-8 rounded-full px-3 text-xs font-bold"
          type="button"
          onClick={onJumpToStep}
        >
          Xem bước
        </Button>
      </div>
    </div>
  )
}

function PrePrepModal({
  dishGroups,
  isOpen,
  onClose
}: Readonly<{
  dishGroups: readonly PrePrepDishGroup[]
  isOpen: boolean
  onClose: () => void
}>) {
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set())

  if (!isOpen) return null

  const allIngredients = dishGroups.flatMap((g) => g.ingredients)
  const totalCount = allIngredients.length
  const completedCount = allIngredients.filter((i) => checkedIds.has(i.recipeIngredientId)).length

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <dialog
      className="fixed inset-x-4 top-auto bottom-[calc(var(--app-nav-height)+0.75rem)] m-0 mx-auto max-h-[calc(100svh-var(--app-nav-height)-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-herb-200 bg-paper-raised p-5 text-ink shadow-lift backdrop:bg-black/30 backdrop:backdrop-blur-xs sm:p-6 lg:left-auto lg:right-8 lg:mx-0 lg:w-[min(42rem,calc(100vw-19rem))]"
      open
      aria-label="Khâu sơ chế & Chuẩn bị nguyên liệu"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="leaf" className="size-5 text-herb-700" />
            <h2 className="text-lg font-bold text-ink">Sơ chế & Chuẩn bị nguyên liệu</h2>
          </div>
          <p className="mt-1 text-xs text-ink-soft sm:text-sm">
            Rửa sạch, thái nhỏ và ướp sẵn các nguyên liệu trước khi bật bếp nấu
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-herb-100 px-3 py-1 text-xs font-bold text-herb-900 tabular-nums">
          Đã sơ chế {completedCount}/{totalCount}
        </span>
      </div>

      <div className="mt-4 grid gap-5">
        {dishGroups.map((group) => (
          <div key={group.dishLabel} className="grid gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-herb-800">
              {group.dishLabel}
            </h3>
            {group.ingredients.length === 0 ? (
              <p className="text-xs text-ink-muted">Không có nguyên liệu cần sơ chế riêng.</p>
            ) : (
              <ul className="grid gap-1.5">
                {group.ingredients.map((ingredient) => {
                  const checked = checkedIds.has(ingredient.recipeIngredientId)
                  return (
                    <li key={ingredient.recipeIngredientId}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors ${
                          checked
                            ? "border-herb-200 bg-herb-50/60 text-ink-soft dark:border-herb-900/40 dark:bg-herb-950/20"
                            : "border-edge bg-paper-sunken/40 hover:bg-paper-sunken"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChecked(ingredient.recipeIngredientId)}
                          className="size-4.5 rounded accent-herb-600"
                        />
                        <span
                          className={`min-w-0 flex-1 text-sm select-none ${
                            checked
                              ? "line-through text-ink-soft opacity-75"
                              : "font-medium text-ink"
                          }`}
                        >
                          {ingredient.label}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onClose}>
          Đã sẵn sàng nấu
        </Button>
      </div>
    </dialog>
  )
}

function CondimentModal({
  mealName,
  dishNames,
  dishRoles,
  isOpen,
  onClose
}: Readonly<{
  mealName: string
  dishNames: readonly string[]
  dishRoles: readonly string[]
  isOpen: boolean
  onClose: () => void
}>) {
  if (!isOpen) return null

  return (
    <dialog
      className="fixed inset-x-4 top-auto bottom-[calc(var(--app-nav-height)+0.75rem)] m-0 mx-auto max-h-[calc(100svh-var(--app-nav-height)-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-amber-200 bg-paper-raised p-5 text-ink shadow-lift backdrop:bg-black/30 backdrop:backdrop-blur-xs sm:p-6 lg:left-auto lg:right-8 lg:mx-0 lg:w-[min(42rem,calc(100vw-19rem))]"
      open
      aria-label="Gợi ý nước chấm & Ăn kèm chuẩn vị"
    >
      <div className="flex items-center justify-between border-b border-edge/60 pb-3">
        <h2 className="text-base font-extrabold text-ink flex items-center gap-2">
          <Icon name="bowl" className="size-5 text-amber-700" />
          <span>Nước chấm & Ăn kèm chuẩn vị</span>
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Đóng bảng gợi ý nước chấm">
          ✕
        </Button>
      </div>

      <div className="mt-4">
        <CondimentPairingCard
          compact
          mealNameVi={mealName}
          dishNames={dishNames}
          dishRoles={dishRoles}
        />
      </div>

      <div className="mt-5 border-t border-edge/60 pt-3">
        <Button size="default" variant="outline" className="w-full" onClick={onClose}>
          Đã xong, quay lại nấu
        </Button>
      </div>
    </dialog>
  )
}

function StepView({
  step,
  timerProgress,
  onTimerProgress,
  counterMode
}: Readonly<{
  step: CookingStep
  timerProgress?: TimerProgressV1
  onTimerProgress: (progress: TimerProgressV1) => void
  counterMode?: boolean
}>) {
  return (
    <div className={`grid ${counterMode ? "gap-6" : "gap-4"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full bg-clay-50 font-bold text-clay-900 ${
            counterMode ? "px-4 py-1.5 text-base" : "px-3 py-1 text-sm"
          }`}
        >
          {step.dishLabel}
        </span>
        <span className={`font-semibold text-ink-soft ${counterMode ? "text-base" : "text-sm"}`}>
          Bước {step.stepNumber}/{step.stepCount}
        </span>
      </div>

      <p
        className={`leading-snug font-bold text-balance text-ink ${
          counterMode ? "text-3xl sm:text-4xl lg:text-5xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {step.instructionVi}
      </p>

      {step.conditions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {step.conditions.map((condition) => (
            <li
              className={`rounded-full bg-broth-50 font-bold text-broth-900 ${
                counterMode ? "px-4 py-1.5 text-base" : "px-3 py-1 text-sm"
              }`}
              key={condition}
            >
              {condition}
            </li>
          ))}
        </ul>
      )}

      {step.ingredientDetails.length > 0 && (
        <div
          className={`rounded-2xl bg-paper-sunken ${
            counterMode ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"
          }`}
        >
          <p
            className={`flex items-center gap-1.5 font-bold text-ink ${
              counterMode ? "text-base" : "text-sm"
            }`}
          >
            <Icon
              name="leaf"
              className={counterMode ? "size-5 text-herb-600" : "size-4 text-herb-600"}
            />
            Nguyên liệu cho bước này
          </p>
          <ul
            className={`mt-1 grid gap-1 text-ink-soft ${
              counterMode ? "text-base sm:text-lg" : "text-sm"
            }`}
          >
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
          counterMode={counterMode}
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
  pantryRepository,
  today
}: Props) {
  const auth = useAuth()
  const navigate = useNavigate()
  const params = useParams()
  const dayIndex = Number(params.dayIndex)
  const accessToken = auth.session?.accessToken

  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [rating, setRating] = useState<MealRating | null>(null)
  const [labels, setLabels] = useState<IngredientLabels>(EMPTY_INGREDIENT_LABELS)
  const [rawFoodOptions, setRawFoodOptions] = useState<readonly PantryFoodOption[]>([])
  const [deductionItems, setDeductionItems] = useState<readonly CookingPantryDeductionResultItem[]>(
    []
  )
  const [showDeductionModal, setShowDeductionModal] = useState(false)
  const [isDeductingPantry, setIsDeductingPantry] = useState(false)
  const [deductionError, setDeductionError] = useState<string | null>(null)
  const [checkingPantry, setCheckingPantry] = useState(false)
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
        if (!cancelled) {
          setRawFoodOptions(options)
          setLabels(ingredientLabels(options))
        }
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

  const wakeLockState = useWakeLock(state.status === "ready")
  const [counterMode, setCounterMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const [skipRice, setSkipRice] = useState(() => {
    if (typeof window === "undefined") return true
    const saved = window.localStorage.getItem("bepnha:cooking:skip-rice")
    return saved === null ? true : saved === "true"
  })
  const [showPrePrep, setShowPrePrep] = useState(false)
  const [showCondiments, setShowCondiments] = useState(false)
  const [showStorageGuide, setShowStorageGuide] = useState(false)
  const [showMeasurementConverter, setShowMeasurementConverter] = useState(false)

  const toggleSkipRice = () => {
    setSkipRice((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        window.localStorage.setItem("bepnha:cooking:skip-rice", String(next))
      }
      setIndex(0)
      return next
    })
  }

  const steps = useMemo(
    () =>
      state.status === "ready" ? cookingSequence(state.item, labels, { skipStaple: skipRice }) : [],
    [labels, skipRice, state]
  )
  const prePrepGroups = useMemo(
    () => (state.status === "ready" ? extractMealPrePrepGroups(state.item, labels) : []),
    [labels, state]
  )
  const stapleRiceSummary = useMemo(
    () => (state.status === "ready" ? extractStapleRiceSummary(state.item, labels) : null),
    [labels, state]
  )
  const storageDishes = useMemo(() => {
    if (state.status !== "ready") return []
    const components = state.item.components
    return components.map((c) => ({
      name:
        components.length === 1
          ? state.mealName
          : `${mealRoleLabel(c.mealRole)}: ${state.mealName}`,
      role: c.mealRole
    }))
  }, [state])
  const backgroundTimers = useMemo(() => {
    return steps
      .map((s, sIndex) => ({ step: s, stepIndex: sIndex }))
      .filter(({ step: s, stepIndex: sIndex }) => {
        if (sIndex === index || s.timerMinutes === null) return false
        const t = timers[s.key]
        return Boolean(t && t.startedAt !== null)
      })
  }, [steps, index, timers])

  const hasStaple =
    state.status === "ready" && state.item.components.some((c) => c.mealRole === "staple")
  const progressScope = state.status === "ready" ? `${state.revisionId}:${String(dayIndex)}` : null
  const step = steps[index]

  useEffect(() => {
    return () => {
      cancelCookingSpeech()
    }
  }, [])

  const mealOptionId = state.status === "ready" ? state.item.mealOptionId : null

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
      cancelCookingSpeech()
      setSpeaking(false)
      setIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(steps.length - 1, 0)))
    },
    [steps.length]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        go(-1)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        go(1)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [go])

  const dayLabel = DAY_LABELS[dayIndex] ?? "Bữa chính"

  const finishCooking = async () => {
    if (state.status !== "ready") return

    if (pantryRepository !== undefined && householdId !== null) {
      setCheckingPantry(true)
      try {
        const pantryItems = await pantryRepository.load(householdId)
        const deductions = calculatePantryCookingDeduction(
          pantryItems,
          state.item.scaledIngredients,
          rawFoodOptions
        )
        if (deductions.length > 0) {
          setDeductionItems(deductions)
          setDeductionError(null)
          setShowDeductionModal(true)
          setCheckingPantry(false)
          return
        }
      } catch {
        // Fallback to completing meal if pantry check fails
      }
      setCheckingPantry(false)
    }

    clearCookingProgress(window.localStorage, state.revisionId, dayIndex)
    setLoadedProgressScope(null)
    toast.success("Bữa cơm đã hoàn thành!")
    void navigate("/plan")
  }

  const handleConfirmDeduction = async (
    selectedItems: readonly CookingPantryDeductionResultItem[]
  ) => {
    if (pantryRepository === undefined || householdId === null || state.status !== "ready") return
    if (selectedItems.length === 0) {
      clearCookingProgress(window.localStorage, state.revisionId, dayIndex)
      setLoadedProgressScope(null)
      setShowDeductionModal(false)
      void navigate("/plan")
      return
    }

    setIsDeductingPantry(true)
    setDeductionError(null)

    try {
      for (const item of selectedItems) {
        if (item.action === "remove") {
          await pantryRepository.remove(item.pantryItemId, item.expectedVersion)
        } else {
          await pantryRepository.upsert({
            householdId,
            foodId: item.foodId,
            foodFactVersionId: item.foodFactVersionId,
            unitId: item.unitId,
            quantity: item.remainingQuantity,
            expectedVersion: item.expectedVersion
          })
        }
      }

      clearCookingProgress(window.localStorage, state.revisionId, dayIndex)
      setLoadedProgressScope(null)
      setShowDeductionModal(false)
      toast.success(`Đã trừ kho tủ bếp cho ${selectedItems.length} nguyên liệu!`)
      void navigate("/plan")
    } catch (err: unknown) {
      if (err instanceof PantryRepositoryError && err.code === "VERSION_CONFLICT") {
        setDeductionError(
          "Dữ liệu tủ bếp đã thay đổi trên thiết bị khác. Vui lòng thử lại hoặc bỏ qua."
        )
      } else {
        setDeductionError("Không thể cập nhật tủ bếp lúc này. Bạn có thể thử lại hoặc bỏ qua.")
      }
    } finally {
      setIsDeductingPantry(false)
    }
  }

  const handleSkipDeduction = () => {
    if (state.status === "ready") {
      clearCookingProgress(window.localStorage, state.revisionId, dayIndex)
      setLoadedProgressScope(null)
    }
    setShowDeductionModal(false)
    void navigate("/plan")
  }

  return (
    <AppPageShell
      className={`mx-auto flex min-h-screen w-full flex-col gap-5 px-4 py-6 text-ink sm:px-6 ${
        counterMode ? "max-w-4xl" : "max-w-2xl"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-herb-700">{dayLabel}</p>
          <h1
            className={`${counterMode ? "text-2xl sm:text-3xl" : "text-xl"} font-extrabold tracking-tight text-ink`}
          >
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge/60 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={showPrePrep ? "default" : "outline"}
                onClick={() => setShowPrePrep(true)}
                className="flex items-center gap-1.5 rounded-full"
                title="Xem danh sách sơ chế và chuẩn bị nguyên liệu"
              >
                <Icon name="leaf" className="size-4" />
                <span>Sơ chế</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant={showCondiments ? "default" : "outline"}
                onClick={() => setShowCondiments(true)}
                className="flex items-center gap-1.5 rounded-full"
                title="Xem gợi ý nước chấm và đồ ăn kèm chuẩn vị"
              >
                <Icon name="bowl" className="size-4 text-amber-700" />
                <span>Nước chấm</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant={showStorageGuide ? "default" : "outline"}
                onClick={() => setShowStorageGuide((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-full"
                title="Xem hướng dẫn bảo quản thức ăn thừa sau nấu"
                data-testid="cooking-storage-guide-btn"
              >
                <span>🥡</span>
                <span>Bảo quản</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant={showMeasurementConverter ? "default" : "outline"}
                onClick={() => setShowMeasurementConverter((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-full"
                title="Quy đổi thìa, bát, gam, ml và ước lượng gia vị bếp Việt"
                data-testid="cooking-measurement-converter-btn"
              >
                <span>⚖️</span>
                <span>Quy đổi</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant={counterMode ? "default" : "outline"}
                onClick={() => setCounterMode((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-full"
                title="Phóng to chữ và nút bấm để nhìn rõ từ xa trên kệ bếp"
              >
                <Icon name="expand" className="size-4" />
                <span>{counterMode ? "Chế độ kệ bếp: Bật" : "Kệ bếp"}</span>
              </Button>

              {isSpeechSynthesisSupported() ? (
                <Button
                  type="button"
                  size="sm"
                  variant={speaking ? "default" : "outline"}
                  onClick={() => {
                    if (speaking) {
                      cancelCookingSpeech()
                      setSpeaking(false)
                    } else {
                      const ok = speakCookingInstruction(step.instructionVi, () =>
                        setSpeaking(false)
                      )
                      if (ok) setSpeaking(true)
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-full"
                  title="Đọc to hướng dẫn nấu bằng giọng nói"
                >
                  <Icon name="speaker" className="size-4" />
                  <span>{speaking ? "Dừng đọc" : "Đọc bước"}</span>
                </Button>
              ) : null}
            </div>

            {wakeLockState.isSupported ? (
              <Button
                type="button"
                size="sm"
                variant={wakeLockState.isLocked ? "outline" : "ghost"}
                onClick={wakeLockState.toggle}
                className={`flex items-center gap-1.5 rounded-full ${
                  wakeLockState.isLocked
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "text-ink-soft"
                }`}
                title={
                  wakeLockState.isLocked
                    ? "Màn hình đang giữ luôn sáng"
                    : "Chạm để giữ màn hình luôn sáng"
                }
              >
                <Icon
                  name="sun"
                  className={`size-4 ${wakeLockState.isLocked ? "text-amber-600" : ""}`}
                />
                <span className="text-xs">
                  {wakeLockState.isLocked ? "Màn hình sáng" : "Màn hình tự tắt"}
                </span>
              </Button>
            ) : null}
          </div>

          {hasStaple ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-herb-200 bg-herb-50/70 p-3 text-xs text-herb-900 shadow-soft dark:border-herb-800/40 dark:bg-herb-950/30 dark:text-herb-200">
              <div className="flex items-center gap-2">
                <Icon name="bowl" className="size-4 shrink-0 text-herb-700 dark:text-herb-400" />
                <span>
                  <strong>Nồi cơm điện:</strong>{" "}
                  {skipRice ? (
                    <>
                      Đã ẩn các bước cắm cơm.{" "}
                      {stapleRiceSummary ? (
                        <span className="font-semibold text-herb-800 dark:text-herb-300">
                          Nhớ cắm nồi: {stapleRiceSummary} trước khi bật bếp.
                        </span>
                      ) : (
                        "Nhớ cắm nồi cơm trước khi nấu."
                      )}
                    </>
                  ) : (
                    "Đang hiển thị bước cắm cơm chi tiết."
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleSkipRice}
                className="shrink-0 font-bold text-herb-800 underline hover:text-herb-950 dark:text-herb-300 dark:hover:text-herb-100"
              >
                {skipRice ? "Hiện lại bước nấu cơm" : "Bỏ qua bước nấu cơm"}
              </button>
            </div>
          ) : null}

          {backgroundTimers.length > 0 && (
            <div className="grid gap-2">
              {backgroundTimers.map(({ step: bgStep, stepIndex: bgIndex }) => {
                const progress = timers[bgStep.key] ?? { startedAt: null, pausedWith: null }
                return (
                  <ActiveTimerBanner
                    key={bgStep.key}
                    bgStep={bgStep}
                    progress={progress}
                    onProgress={(p) => setTimers((current) => ({ ...current, [bgStep.key]: p }))}
                    onJumpToStep={() => setIndex(bgIndex)}
                  />
                )
              })}
            </div>
          )}

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
            counterMode={counterMode}
            onTimerProgress={(progress) =>
              setTimers((current) => ({ ...current, [step.key]: progress }))
            }
            {...(timers[step.key] === undefined ? {} : { timerProgress: timers[step.key] })}
          />

          {mealOptionId !== null && (
            <FamilyCookingNotes key={mealOptionId} mealOptionId={mealOptionId} />
          )}

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

          {(showStorageGuide || index === steps.length - 1) && storageDishes.length > 0 && (
            <div className="mt-4" data-testid="cooking-storage-guide-section">
              <LeftoverStorageGuideCard
                dishes={storageDishes}
                title="Bảo quản thức ăn thừa sau nấu"
                defaultExpanded={index === steps.length - 1 ? false : true}
              />
            </div>
          )}

          <div className="mt-auto flex gap-3 pt-4">
            <Button
              className={`flex-1 ${counterMode ? "min-h-16 text-lg font-extrabold sm:text-xl" : ""}`}
              disabled={index === 0}
              size="lg"
              type="button"
              variant="outline"
              onClick={() => go(-1)}
            >
              Bước trước
            </Button>
            {index === steps.length - 1 ? (
              <Button
                className={`flex-1 ${counterMode ? "min-h-16 text-lg font-extrabold sm:text-xl" : ""}`}
                disabled={checkingPantry}
                size="lg"
                type="button"
                onClick={() => void finishCooking()}
              >
                {checkingPantry ? "Đang đối chiếu kho…" : "Nấu xong"}
              </Button>
            ) : (
              <Button
                className={`flex-1 ${counterMode ? "min-h-16 text-lg font-extrabold sm:text-xl" : ""}`}
                size="lg"
                type="button"
                onClick={() => go(1)}
              >
                Bước tiếp
              </Button>
            )}
          </div>
        </>
      )}

      <PrePrepModal
        dishGroups={prePrepGroups}
        isOpen={showPrePrep}
        onClose={() => setShowPrePrep(false)}
      />

      {state.status === "ready" && (
        <CondimentModal
          dishNames={state.item.components
            .map((c) => (c.recipe.steps.length > 0 ? c.recipe.recipeId : ""))
            .filter(Boolean)}
          dishRoles={state.item.components.map((c) => c.mealRole)}
          isOpen={showCondiments}
          mealName={state.mealName}
          onClose={() => setShowCondiments(false)}
        />
      )}

      <PantryCookingDeductionModal
        items={deductionItems}
        isOpen={showDeductionModal}
        isSubmitting={isDeductingPantry}
        errorMessage={deductionError}
        onConfirm={(selected) => void handleConfirmDeduction(selected)}
        onSkip={handleSkipDeduction}
      />

      <KitchenMeasurementModal
        isOpen={showMeasurementConverter}
        onClose={() => setShowMeasurementConverter(false)}
      />
    </AppPageShell>
  )
}
