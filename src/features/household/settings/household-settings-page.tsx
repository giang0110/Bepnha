import { useEffect, useReducer, useState } from "react"
import { Link, useNavigate } from "react-router"

import { loadHousehold, type LoadHouseholdResult } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { saveHousehold } from "@/application/household/save-household"
import { Button } from "@/app/components/ui/button"
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
  const budgetVnd = parseVnd(state.budgetInput)

  async function save() {
    if (budgetVnd === null) return
    setSaveState("saving")
    const result = await saveHousehold(
      repository,
      {
        memberGroups: memberGroupsFromCounts(state.memberCounts),
        weeklyPlanBudgetVnd: budgetVnd,
        maxElapsedMinutes: state.maxElapsedMinutes,
        ruleCodes: [...state.hardRuleCodes, ...state.preferenceCodes]
      },
      household.version
    )
    if (result.ok) {
      onSaved()
      return
    }
    if (result.reason === "STALE_HOUSEHOLD_VERSION") setSaveState("stale-error")
    else if (result.reason === "UNAUTHORIZED") setSaveState("auth-error")
    else setSaveState("retryable-error")
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Bước {state.step}/5</span>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy chỉnh sửa
        </Button>
      </div>
      {state.step === 1 ? (
        <MemberGroupsStep
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
          onBack={() => dispatch({ type: "go-to-step", step: 2 })}
          onContinue={() => dispatch({ type: "go-to-step", step: 4 })}
          onToggle={(code, selected) => dispatch({ type: "toggle-rule", code, selected })}
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
      {state.step === 5 && budgetVnd !== null ? (
        <>
          <ReviewStep
            budgetVnd={budgetVnd}
            hardRuleCodes={state.hardRuleCodes}
            heading="Kiểm tra thay đổi"
            maxElapsedMinutes={state.maxElapsedMinutes}
            memberGroups={memberGroupsFromCounts(state.memberCounts)}
            preferenceCodes={state.preferenceCodes}
            saveLabel="Lưu thay đổi"
            saveState={saveState}
            onBack={() => dispatch({ type: "go-to-step", step: 4 })}
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

  if (state.status === "loading") return <p role="status">Đang tải thông tin để chỉnh sửa…</p>
  if (state.status === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6">
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
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">Không có thông tin để chỉnh sửa</h1>
        <p>Trang này không tạo thêm gia đình.</p>
        <Link to="/onboarding">Quay lại thiết lập</Link>
      </main>
    )
  }
  return (
    <HouseholdSettingsEditor
      key={state.household.version}
      household={state.household}
      repository={repository}
      onCancel={() => void navigate("/household")}
      onReload={load}
      onSaved={() => void navigate("/household")}
    />
  )
}
