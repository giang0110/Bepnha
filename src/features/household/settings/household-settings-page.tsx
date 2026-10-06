import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { loadHousehold, type LoadHouseholdResult } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { saveHousehold } from "@/application/household/save-household"
import { Button } from "@/app/components/ui/button"
import { toast } from "@/app/components/ui/toast"
import { AppPageShell } from "@/app/components/app-page-shell"
import type { HouseholdSetup } from "@/domain/household/household"

import { parseVnd } from "../budget-vnd"
import { BudgetStep } from "../components/budget-step"
import { HardRulesStep } from "../components/hard-rules-step"
import { MemberGroupsStep } from "../components/member-groups-step"
import { PreferencesTimeStep } from "../components/preferences-time-step"
import { ReviewStep, type SaveState } from "../components/review-step"
import {
  householdFormReducer,
  householdFormStateFromSetup,
  validateHouseholdForm,
  nutritionSetupFromForm,
  memberGroupsFromCounts
} from "../household-form-state"

interface HouseholdSettingsPageProps {
  repository: HouseholdRepository
}

type PageState =
  | { status: "loading" }
  | { status: "ready"; household: HouseholdSetup | null }
  | { status: "error"; reason: Exclude<LoadHouseholdResult, { ok: true }>["reason"] }

function resultToPageState(result: LoadHouseholdResult): PageState {
  return result.ok
    ? { status: "ready", household: result.household }
    : { status: "error", reason: result.reason }
}

const TAB_MAP: Record<string, 1 | 2 | 3 | 4 | 5> = {
  members: 1,
  budget: 2,
  allergies: 3,
  time: 4,
  preferences: 4,
  review: 5
}

const STEP_TO_TAB: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "members",
  2: "budget",
  3: "allergies",
  4: "time",
  5: "review"
}

const TAB_TITLES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Thành viên",
  2: "Ngân sách",
  3: "Dị ứng & Loại trừ",
  4: "Sở thích & Thời gian",
  5: "Xem lại & Lưu"
}

interface HouseholdSettingsEditorProps {
  household: HouseholdSetup
  repository: HouseholdRepository
  onCancel: () => void
  onReload: () => void
  onSaved: () => void
}

function HouseholdSettingsEditor({
  household,
  repository,
  onCancel,
  onReload,
  onSaved
}: HouseholdSettingsEditorProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const initialStep: 1 | 2 | 3 | 4 | 5 = useMemo(() => {
    if (tabParam && tabParam in TAB_MAP) {
      const step = TAB_MAP[tabParam]
      if (step !== undefined) return step
    }
    return 1
  }, [tabParam])

  const [initialFormState] = useState(() => householdFormStateFromSetup(household))
  const [state, dispatch] = useReducer(householdFormReducer, initialFormState, (initial) => {
    if (initialStep !== 1) {
      return { ...initial, step: initialStep }
    }
    return initial
  })

  const [saveState, setSaveState] = useState<SaveState>("idle")
  const nutritionValidation = nutritionSetupFromForm(state)
  const setupValidation = validateHouseholdForm(state)
  const budgetVnd = parseVnd(state.budgetInput)
  const requestEpoch = useRef(0)

  useEffect(() => {
    requestEpoch.current += 1
    return () => {
      requestEpoch.current += 1
    }
  }, [repository])

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && tab in TAB_MAP) {
      const targetStep = TAB_MAP[tab]
      if (targetStep !== undefined && state.step !== targetStep) {
        dispatch({ type: "go-to-step", step: targetStep })
      }
    }
  }, [searchParams, state.step])

  function goToStep(nextStep: 1 | 2 | 3 | 4 | 5) {
    dispatch({ type: "go-to-step", step: nextStep })
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set("tab", STEP_TO_TAB[nextStep])
        return next
      },
      { replace: true }
    )
  }

  const isDirty = useMemo(() => {
    const initial = initialFormState
    if (state.budgetInput.trim() !== initial.budgetInput.trim()) return true
    if (state.maxElapsedMinutes !== initial.maxElapsedMinutes) return true
    if (state.mealEnergyShareInput.trim() !== initial.mealEnergyShareInput.trim()) return true
    if (JSON.stringify(state.memberCounts) !== JSON.stringify(initial.memberCounts)) return true
    if (
      JSON.stringify([...state.hardRuleCodes].sort()) !==
      JSON.stringify([...initial.hardRuleCodes].sort())
    )
      return true
    if (
      JSON.stringify([...state.preferenceCodes].sort()) !==
      JSON.stringify([...initial.preferenceCodes].sort())
    )
      return true
    if (JSON.stringify(state.allergenStrictness) !== JSON.stringify(initial.allergenStrictness))
      return true

    if (state.memberProfiles.length !== initial.memberProfiles.length) return true
    for (let i = 0; i < state.memberProfiles.length; i++) {
      const p1 = state.memberProfiles[i]
      const p2 = initial.memberProfiles[i]
      if (!p1 || !p2) return true
      if (
        p1.memberKind !== p2.memberKind ||
        p1.sortOrder !== p2.sortOrder ||
        p1.label !== p2.label ||
        p1.heightInput !== p2.heightInput ||
        p1.weightInput !== p2.weightInput ||
        p1.ageInput !== p2.ageInput ||
        p1.sexForEquation !== p2.sexForEquation ||
        p1.activityLevel !== p2.activityLevel ||
        p1.goal !== p2.goal
      ) {
        return true
      }
    }
    return false
  }, [state, initialFormState])

  async function save() {
    const draft = validateHouseholdForm(state)
    if (!draft.ok) {
      goToStep(5)
      return
    }
    const epoch = requestEpoch.current
    setSaveState("saving")
    const result = await saveHousehold(repository, draft.value, household.version)
    if (epoch !== requestEpoch.current) return
    if (result.ok) {
      toast.success("Đã lưu thay đổi thông tin gia đình!")
      onSaved()
      return
    }
    goToStep(5)
    if (result.reason === "STALE_HOUSEHOLD_VERSION") setSaveState("stale-error")
    else if (result.reason === "UNAUTHORIZED") setSaveState("auth-error")
    else if (result.reason === "DEPENDENCY_SCHEMA_NOT_READY") setSaveState("schema-error")
    else setSaveState("retryable-error")
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-screen w-full max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <div className="sticky top-0 z-20 mb-6 rounded-2xl border border-edge bg-paper-raised/95 p-3.5 backdrop-blur-md shadow-soft sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <p className="text-sm font-bold text-ink">Chỉnh sửa gia đình</p>
              <p className="text-xs text-ink-soft">
                Bước {state.step}/5 · {TAB_TITLES[state.step]}
              </p>
            </div>
            {isDirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                Chưa lưu thay đổi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-herb-300 bg-herb-50 px-2.5 py-0.5 text-xs font-semibold text-herb-900 dark:border-herb-700/60 dark:bg-herb-950/40 dark:text-herb-300">
                <span className="h-1.5 w-1.5 rounded-full bg-herb-600" />
                Đã đồng bộ
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Hủy chỉnh sửa
            </Button>
            {state.step !== 5 ? (
              <Button
                type="button"
                size="sm"
                disabled={saveState === "saving"}
                onClick={() => void save()}
              >
                {saveState === "saving" ? "Đang lưu…" : "Lưu nhanh"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <nav aria-label="Các bước cài đặt" className="mb-6 flex flex-wrap gap-1.5 sm:gap-2">
        {[
          { step: 1, label: "Thành viên" },
          { step: 2, label: "Ngân sách" },
          { step: 3, label: "Dị ứng & Loại trừ" },
          { step: 4, label: "Sở thích & Thời gian" },
          { step: 5, label: "Xem lại & Lưu" }
        ].map((item) => (
          <button
            key={item.step}
            type="button"
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-xs font-semibold transition-colors sm:text-sm",
              state.step === item.step
                ? "bg-herb-100 text-herb-900 ring-1 ring-inset ring-herb-200"
                : "bg-paper-raised text-ink-soft hover:bg-paper-sunken hover:text-ink"
            ].join(" ")}
            aria-current={state.step === item.step ? "step" : undefined}
            onClick={() => goToStep(item.step as 1 | 2 | 3 | 4 | 5)}
          >
            {item.step}. {item.label}
          </button>
        ))}
      </nav>
      {state.step === 1 ? (
        <MemberGroupsStep
          profiles={state.memberProfiles}
          mealShareInput={state.mealEnergyShareInput}
          onProfileAction={dispatch}
          counts={state.memberCounts}
          heading="Chỉnh sửa thành viên"
          onChange={(key, count) => dispatch({ type: "set-member-count", key, count })}
          onContinue={() => goToStep(2)}
        />
      ) : null}
      {state.step === 2 ? (
        <BudgetStep
          heading="Chỉnh sửa ngân sách"
          value={state.budgetInput}
          onBack={() => goToStep(1)}
          onChange={(value) => dispatch({ type: "set-budget", value })}
          onContinue={() => goToStep(3)}
        />
      ) : null}
      {state.step === 3 ? (
        <HardRulesStep
          heading="Chỉnh sửa dị ứng và loại trừ"
          selectedCodes={state.hardRuleCodes}
          allergenStrictness={state.allergenStrictness}
          onBack={() => goToStep(2)}
          onContinue={() => goToStep(4)}
          onToggle={(code, selected) => dispatch({ type: "toggle-rule", code, selected })}
          onStrictnessChange={(code, strictness) =>
            dispatch({ type: "set-allergen-strictness", code, strictness })
          }
        />
      ) : null}
      {state.step === 4 ? (
        <PreferencesTimeStep
          hardRuleCodes={state.hardRuleCodes}
          heading="Chỉnh sửa sở thích và thời gian"
          maxElapsedMinutes={state.maxElapsedMinutes}
          selectedCodes={state.preferenceCodes}
          onBack={() => goToStep(3)}
          onContinue={() => goToStep(5)}
          onTimeChange={(minutes) => dispatch({ type: "set-max-elapsed-minutes", minutes })}
          onToggle={(code, selected) => dispatch({ type: "toggle-rule", code, selected })}
        />
      ) : null}
      {state.step === 5 ? (
        <>
          <ReviewStep
            nutritionSetup={nutritionValidation.ok ? nutritionValidation.value : undefined}
            budgetVnd={budgetVnd}
            hardRuleCodes={state.hardRuleCodes}
            heading="Kiểm tra thay đổi"
            maxElapsedMinutes={state.maxElapsedMinutes}
            memberGroups={memberGroupsFromCounts(state.memberCounts)}
            preferenceCodes={state.preferenceCodes}
            saveLabel="Lưu thay đổi"
            saveState={saveState}
            onBack={() => goToStep(4)}
            canSave={setupValidation.ok}
            validationErrors={setupValidation.ok ? [] : setupValidation.errors}
            onSave={() => void save()}
          />
          {saveState === "stale-error" ? (
            <Button
              className="mt-3 w-full"
              type="button"
              variant="outline"
              onClick={() => {
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    next.delete("tab")
                    return next
                  },
                  { replace: true }
                )
                onReload()
              }}
            >
              Tải lại thông tin mới nhất
            </Button>
          ) : null}
        </>
      ) : null}
    </main>
  )
}

export function HouseholdSettingsPage({ repository }: HouseholdSettingsPageProps) {
  const [state, setState] = useState<PageState>({ status: "loading" })
  const navigate = useNavigate()

  function load() {
    setState({ status: "loading" })
    void loadHousehold(repository).then((result) => setState(resultToPageState(result)))
  }

  useEffect(() => {
    let active = true
    void loadHousehold(repository).then((result) => {
      if (active) setState(resultToPageState(result))
    })
    return () => {
      active = false
    }
  }, [repository])

  if (state.status === "loading") {
    return (
      <AppPageShell className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <p role="status">Đang tải thông tin để chỉnh sửa…</p>
      </AppPageShell>
    )
  }
  if (state.status === "error") {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        <p role="alert">
          {state.reason === "UNAUTHORIZED"
            ? "Phiên đăng nhập đã hết hạn."
            : "Không thể tải thông tin để chỉnh sửa."}
        </p>
        <Button type="button" onClick={load}>
          Thử lại
        </Button>
      </main>
    )
  }
  if (state.household === null) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Không có thông tin để chỉnh sửa
        </h1>
        <p>Trang này không tạo thêm gia đình.</p>
        <Link to="/onboarding">Quay lại thiết lập</Link>
      </main>
    )
  }
  return (
    <HouseholdSettingsEditor
      key={`${state.household.householdId}:${state.household.version}`}
      household={state.household}
      repository={repository}
      onCancel={() => void navigate("/household")}
      onReload={load}
      onSaved={() => void navigate("/household")}
    />
  )
}
