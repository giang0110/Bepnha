import { Button } from "@/app/components/ui/button"
import type { HouseholdMemberGroup } from "@/domain/household/household"
import { calculateAdultEquivalent } from "@/domain/portion/calculate-adult-equivalent"

import { formatVnd } from "../budget-vnd"
import { memberGroupLabel, ruleLabel } from "../household-display"

import type { HouseholdNutritionSetupV1 } from "@/domain/household/member-profile"
import { calculateMemberEnergyTarget } from "@/domain/nutrition/member-energy-target"
import { energyReasonLabel, goalLabel } from "../household-display"

export type SaveState =
  "schema-error" | "idle" | "saving" | "retryable-error" | "stale-error" | "auth-error"

interface ReviewStepProps {
  nutritionSetup?: HouseholdNutritionSetupV1 | undefined
  canSave?: boolean
  budgetVnd: number
  hardRuleCodes: readonly string[]
  heading?: string
  maxElapsedMinutes: number
  memberGroups: readonly HouseholdMemberGroup[]
  preferenceCodes: readonly string[]
  saveLabel?: string
  saveState: SaveState
  onBack: () => void
  onSave: () => void
}

function RuleList({ codes, empty }: Readonly<{ codes: readonly string[]; empty: string }>) {
  if (codes.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>
  return (
    <ul>
      {codes.map((code) => (
        <li key={code}>{ruleLabel(code)}</li>
      ))}
    </ul>
  )
}

export function ReviewStep({
  budgetVnd,
  nutritionSetup,
  canSave = true,
  hardRuleCodes,
  heading = "Kiểm tra thông tin",
  maxElapsedMinutes,
  memberGroups,
  preferenceCodes,
  saveLabel = "Lưu thông tin",
  saveState,
  onBack,
  onSave
}: ReviewStepProps) {
  const adultEquivalent = calculateAdultEquivalent(memberGroups)
  const errorMessage =
    saveState === "schema-error"
      ? "Máy chủ chưa sẵn sàng lưu hồ sơ dinh dưỡng. Thông tin bạn nhập vẫn được giữ; hãy thử lại sau."
      : saveState === "stale-error"
        ? "Thông tin đã thay đổi. Vui lòng tải lại trước khi lưu."
        : saveState === "auth-error"
          ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
          : saveState === "retryable-error"
            ? "Không thể lưu thông tin lúc này. Vui lòng thử lại."
            : null

  return (
    <section aria-labelledby="review-step-heading" className="flex flex-col gap-5">
      <h1 id="review-step-heading" className="text-2xl font-extrabold tracking-tight text-ink">
        {heading}
      </h1>
      <div>
        <h2 className="font-bold text-ink">Thành viên</h2>
        <ul>
          {memberGroups.map((group) => (
            <li key={`${group.memberKind}:${group.ageBand}`}>{memberGroupLabel(group)}</li>
          ))}
        </ul>
        {adultEquivalent.ok ? (
          <p className="mt-2 text-sm text-ink-soft">
            Tương đương {adultEquivalent.value.adultEquivalent.replace(".", ",")} suất người lớn
          </p>
        ) : null}
      </div>
      {nutritionSetup ? (
        <div>
          <h2 className="font-bold text-ink">Mục tiêu và khẩu phần</h2>
          <p className="text-sm text-ink-soft">
            Một bữa chính mỗi ngày, {nutritionSetup.plannedMealSharePercent}% năng lượng ngày; 7 bữa
            mỗi tuần.
          </p>
          <ul>
            {nutritionSetup.memberProfiles.map((p) => {
              const energy = calculateMemberEnergyTarget(p, nutritionSetup.plannedMealSharePercent)
              return (
                <li className="mt-2" key={p.id}>
                  {p.label ||
                    `${p.memberKind === "adult" ? "Người lớn" : "Người cao tuổi"} ${p.sortOrder}`}
                  : {goalLabel(p.goal)} —{" "}
                  {energy.status === "applied"
                    ? `${Math.round(Number(energy.mealTargetKcal)).toLocaleString("vi-VN")} kcal/bữa`
                    : energyReasonLabel(energy.reason)}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {!canSave ? (
        <p role="alert">Kiểm tra lại thông tin thành viên và tỷ lệ năng lượng ở bước Thành viên.</p>
      ) : null}
      <div>
        <h2 className="font-bold text-ink">Ngân sách</h2>
        <p>{formatVnd(budgetVnd)} VND cho 7 bữa chính</p>
      </div>
      <div>
        <h2 className="font-bold text-ink">Dị ứng và loại trừ</h2>
        <RuleList codes={hardRuleCodes} empty="Không chọn" />
      </div>
      <div>
        <h2 className="font-bold text-ink">Sở thích</h2>
        <RuleList codes={preferenceCodes} empty="Không chọn" />
      </div>
      <div>
        <h2 className="font-bold text-ink">Thời gian nấu tối đa</h2>
        <p>{maxElapsedMinutes} phút</p>
      </div>
      <p className="text-sm text-ink-soft">Kế hoạch sẽ lọc theo các loại trừ đã lưu.</p>
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-chilli-700">
          {errorMessage}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button
          className="h-11"
          type="button"
          variant="outline"
          disabled={saveState === "saving"}
          onClick={onBack}
        >
          Quay lại
        </Button>
        <Button
          className="h-11"
          type="button"
          disabled={saveState === "saving" || !canSave}
          onClick={onSave}
        >
          {saveState === "saving"
            ? "Đang lưu…"
            : saveState === "retryable-error"
              ? "Thử lưu lại"
              : saveLabel}
        </Button>
      </div>
    </section>
  )
}
