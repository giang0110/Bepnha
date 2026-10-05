import { useEffect, useRef, useReducer, useState } from "react"
import { Link, useNavigate } from "react-router"

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
  const [state, dispatch] = useReducer(householdFormReducer, household, householdFormStateFromSetup)
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

  async function save() {
    const draft = validateHouseholdForm(state)
    if (!draft.ok) return
    const epoch = requestEpoch.current
    setSaveState("saving")
    const result = await saveHousehold(repository, draft.value, household.version)
    if (epoch !== requestEpoch.current) return
    if (result.ok) {
      toast.success("Đã lưu thay đổi thông tin gia đình!")
      onSaved()
      return
    }
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
      <div className="mb-4 rounded-2xl border border-edge bg-paper-raised p-4 shadow-soft sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="mb-3 sm:mb-0">
          <p className="text-sm font-medium text-herb-700">Chỉnh sửa gia đình</p>
          <p className="mt-1 text-sm text-ink-soft">Bước {state.step}/5</p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy chỉnh sửa
        </Button>
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
            onClick={() => dispatch({ type: "go-to-step", step: item.step as 1 | 2 | 3 | 4 | 5 })}
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
          onContinue={() => dispatch({ type: "go-to-step", step: 2 })}
        />
      ) : null}
      {state.step === 2 ? (
        <BudgetStep
          heading="Chỉnh sửa ngân sách"
          value={state.budgetInput}
          onBack={() => dispatch({ type: "go-to-step", step: 1 })}
          onChange={(value) => dispatch({ type: "set-budget", value })}
          onContinue={() => dispatch({ type: "go-to-step", step: 3 })}
        />
      ) : null}
      {state.step === 3 ? (
        <HardRulesStep
          heading="Chỉnh sửa dị ứng và loại trừ"
          selectedCodes={state.hardRuleCodes}
          allergenStrictness={state.allergenStrictness}
          onBack={() => dispatch({ type: "go-to-step", step: 2 })}
          onContinue={() => dispatch({ type: "go-to-step", step: 4 })}
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
          onBack={() => dispatch({ type: "go-to-step", step: 3 })}
          onContinue={() => dispatch({ type: "go-to-step", step: 5 })}
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
            onBack={() => dispatch({ type: "go-to-step", step: 4 })}
            canSave={setupValidation.ok}
            validationErrors={setupValidation.ok ? [] : setupValidation.errors}
            onSave={() => void save()}
          />
          {saveState === "stale-error" ? (
            <Button className="mt-3 w-full" type="button" variant="outline" onClick={onReload}>
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
