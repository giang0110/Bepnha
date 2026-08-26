import { Button } from "@/app/components/ui/button"
import type { HouseholdMemberGroup } from "@/domain/household/household"

import { formatVnd } from "../budget-vnd"
import { memberGroupLabel, ruleLabel } from "../household-display"

export type SaveState = "idle" | "saving" | "retryable-error" | "stale-error" | "auth-error"

interface ReviewStepProps {
  budgetVnd: number
  hardRuleCodes: readonly string[]
  maxElapsedMinutes: number
  memberGroups: readonly HouseholdMemberGroup[]
  preferenceCodes: readonly string[]
  saveState: SaveState
  onBack: () => void
  onSave: () => void
}

function RuleList({ codes, empty }: Readonly<{ codes: readonly string[]; empty: string }>) {
  if (codes.length === 0) return <p className="text-sm text-slate-600">{empty}</p>
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
  hardRuleCodes,
  maxElapsedMinutes,
  memberGroups,
  preferenceCodes,
  saveState,
  onBack,
  onSave
}: ReviewStepProps) {
  const errorMessage =
    saveState === "stale-error"
      ? "Thông tin đã thay đổi. Vui lòng tải lại trước khi lưu."
      : saveState === "auth-error"
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : saveState === "retryable-error"
          ? "Không thể lưu thông tin lúc này. Vui lòng thử lại."
          : null

  return (
    <section aria-labelledby="review-step-heading" className="flex flex-col gap-5">
      <h1 id="review-step-heading" className="text-2xl font-semibold">
        Kiểm tra thông tin
      </h1>
      <div>
        <h2 className="font-semibold">Thành viên</h2>
        <ul>
          {memberGroups.map((group) => (
            <li key={`${group.memberKind}:${group.ageBand}`}>{memberGroupLabel(group)}</li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-semibold">Ngân sách</h2>
        <p>{formatVnd(budgetVnd)} VND cho 7 bữa chính</p>
      </div>
      <div>
        <h2 className="font-semibold">Dị ứng và loại trừ</h2>
        <RuleList codes={hardRuleCodes} empty="Không chọn" />
      </div>
      <div>
        <h2 className="font-semibold">Sở thích</h2>
        <RuleList codes={preferenceCodes} empty="Không chọn" />
      </div>
      <div>
        <h2 className="font-semibold">Thời gian nấu tối đa</h2>
        <p>{maxElapsedMinutes} phút</p>
      </div>
      <p className="text-sm text-slate-600">Kế hoạch sẽ lọc theo các loại trừ đã lưu.</p>
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-red-700">
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
        <Button className="h-11" type="button" disabled={saveState === "saving"} onClick={onSave}>
          {saveState === "saving"
            ? "Đang lưu…"
            : saveState === "retryable-error"
              ? "Thử lưu lại"
              : "Lưu thông tin"}
        </Button>
      </div>
    </section>
  )
}
