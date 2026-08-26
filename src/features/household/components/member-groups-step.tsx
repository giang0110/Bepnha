import { Button } from "@/app/components/ui/button"

import { totalMemberCount, type MemberCountKey, type MemberCounts } from "../household-form-state"

const MEMBER_FIELDS: ReadonlyArray<{ key: MemberCountKey; label: string }> = [
  { key: "adult", label: "Người lớn" },
  { key: "child_1_3", label: "Trẻ 1–3 tuổi" },
  { key: "child_4_6", label: "Trẻ 4–6 tuổi" },
  { key: "child_7_9", label: "Trẻ 7–9 tuổi" },
  { key: "child_10_12", label: "Trẻ 10–12 tuổi" },
  { key: "child_13_17", label: "Trẻ 13–17 tuổi" },
  { key: "elderly", label: "Người cao tuổi" }
]

interface MemberGroupsStepProps {
  counts: MemberCounts
  onChange: (key: MemberCountKey, count: number) => void
  onContinue: () => void
}

export function MemberGroupsStep({ counts, onChange, onContinue }: MemberGroupsStepProps) {
  const total = totalMemberCount(counts)
  const valid = total >= 1 && total <= 20

  return (
    <section aria-labelledby="member-step-heading" className="flex flex-col gap-5">
      <div>
        <h1 id="member-step-heading" className="text-2xl font-semibold">
          Thành viên trong gia đình
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Chỉ nhập số lượng theo nhóm tuổi, không cần tên hay ngày sinh.
        </p>
      </div>
      <div className="grid gap-3">
        {MEMBER_FIELDS.map((field) => (
          <label
            key={field.key}
            className="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 font-medium"
          >
            <span>{field.label}</span>
            <input
              className="h-10 w-20 rounded-md border px-2 text-right"
              aria-label={field.label}
              inputMode="numeric"
              min={0}
              max={20}
              type="number"
              value={counts[field.key]}
              onChange={(event) => onChange(field.key, Number(event.currentTarget.value || 0))}
            />
          </label>
        ))}
      </div>
      <p className="text-sm text-slate-600">Hiện chưa hỗ trợ trẻ dưới 1 tuổi.</p>
      <p className="font-medium">Tổng cộng: {total} người</p>
      {total > 20 ? (
        <p role="alert" className="text-sm text-red-700">
          Tối đa 20 thành viên.
        </p>
      ) : null}
      <Button className="h-11" type="button" disabled={!valid} onClick={onContinue}>
        Tiếp tục
      </Button>
    </section>
  )
}
