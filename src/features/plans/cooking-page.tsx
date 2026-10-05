import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import {
  cancelCookingSpeech,
  isSpeechSynthesisSupported,
  speakCookingInstruction
} from "./cooking-speech"
import { loadCookingNote, saveCookingNote } from "./cooking-notes-store"

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

function notifyTimerDone(): void {
  if (typeof window === "undefined") return
  try {
    if (
      typeof navigator !== "undefined" &&
      "vibrate" in navigator &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate([200, 100, 200, 100, 300])
    }
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      const ctx = new AudioContextClass()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(587.33, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.5)
    }
  } catch {
    // Autoplay or audio context permission restricted
  }
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
  const hasNotifiedRef = useRef(false)

  const running = startedAt !== null && pausedWith === null

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  const remaining = secondsRemaining(total, startedAt, pausedWith, now)
  const done = startedAt !== null && remaining <= 0

  useEffect(() => {
    if (done && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true
      notifyTimerDone()
    } else if (!done) {
      hasNotifiedRef.current = false
    }
  }, [done])

  const start = () => {
    const carry = pausedWith ?? total
    const current = Date.now()
    onProgress({ startedAt: current - (total - carry) * 1000, pausedWith: null })
    setNow(current)
  }

  return (
    <div className="rounded-3xl border border-edge bg-paper-raised p-4 text-center shadow-soft">
      <p
        className={`tabular-nums font-black transition-all ${
          counterMode ? "py-2 text-6xl sm:text-7xl" : "text-5xl font-extrabold"
        } ${done ? "text-chilli-700" : "text-ink"}`}
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

function FamilyCookingNotes({ mealOptionId }: Readonly<{ mealOptionId: string }>) {
  const [cookingNote, setCookingNote] = useState(
    () => loadCookingNote(window.localStorage, mealOptionId) ?? ""
  )
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false)

  const handleSaveNote = useCallback(
    (newNote: string) => {
      saveCookingNote(window.localStorage, mealOptionId, newNote)
      setCookingNote(newNote.trim())
      setIsEditingNote(false)
      setNoteSavedFeedback(true)
      setTimeout(() => setNoteSavedFeedback(false), 2000)
    },
    [mealOptionId]
  )

  return (
    <div className="rounded-2xl border border-edge bg-paper-raised p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="note" className="size-4 text-herb-700" />
          <h3 className="text-sm font-bold text-ink">Mẹo & Ghi chú của gia đình</h3>
        </div>
        {!isEditingNote && (
          <button
            type="button"
            onClick={() => setIsEditingNote(true)}
            className="text-xs font-semibold text-herb-700 hover:underline"
          >
            {cookingNote ? "Sửa ghi chú" : "+ Thêm ghi chú"}
          </button>
        )}
      </div>

      {isEditingNote ? (
        <div className="mt-2.5 grid gap-2">
          <textarea
            className="w-full rounded-xl border border-edge bg-paper p-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-herb-500 focus:outline-none"
            rows={3}
            placeholder="Ví dụ: Giảm 1 thìa đường, chiên giòn hơn cho bé, ướp tiêu 15 phút..."
            defaultValue={cookingNote}
            id="cooking-note-input"
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingNote(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const input = document.getElementById(
                  "cooking-note-input"
                ) as HTMLTextAreaElement | null
                handleSaveNote(input?.value ?? "")
              }}
            >
              Lưu ghi chú
            </Button>
          </div>
        </div>
      ) : cookingNote ? (
        <p className="mt-2 text-sm whitespace-pre-wrap text-ink-soft">{cookingNote}</p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">
          Chưa có ghi chú khẩu vị cho món này. Thêm mẹo để nhớ cho những lần nấu sau!
        </p>
      )}

      {noteSavedFeedback && (
        <p className="mt-1 text-xs font-bold text-herb-700" role="status">
          ✓ Đã lưu ghi chú cho món này
        </p>
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

  const wakeLockState = useWakeLock(state.status === "ready")
  const [counterMode, setCounterMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const [skipRice, setSkipRice] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("bepnha:cooking:skip-rice") === "true"
  })

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
                  <strong>Cơm điện:</strong>{" "}
                  {skipRice
                    ? "Đã bỏ qua các bước cắm cơm điện (nhớ cắm nồi cơm trước khi nấu)."
                    : "Đang hiển thị bước cắm cơm chi tiết."}
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
              <Link
                className={buttonVariants({
                  size: "lg",
                  className: `flex-1 ${counterMode ? "min-h-16 text-lg font-extrabold sm:text-xl" : ""}`
                })}
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
    </AppPageShell>
  )
}
