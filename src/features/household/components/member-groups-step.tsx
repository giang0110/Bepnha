import { Button } from "@/app/components/ui/button"

import {
  createMemberProfileDraft,
  memberProfileFromDraft,
  totalMemberCount,
  type HouseholdFormAction,
  type MemberProfileDraft,
  type MemberCountKey,
  type MemberCounts
} from "../household-form-state"
import { MemberCountStepper } from "./member-count-stepper"

import { MemberProfileCard } from "./member-profile-card"
import { MealEnergyShareField } from "./meal-energy-share-field"

const MEMBER_FIELDS: ReadonlyArray<{ key: MemberCountKey; label: string }> = [
  { key: "child_1_3", label: "Trẻ 1–3 tuổi" },
  { key: "child_4_6", label: "Trẻ 4–6 tuổi" },
  { key: "child_7_9", label: "Trẻ 7–9 tuổi" },
  { key: "child_10_12", label: "Trẻ 10–12 tuổi" },
  { key: "child_13_17", label: "Trẻ 13–17 tuổi" }
]

interface MemberGroupsStepProps {
  profiles: readonly MemberProfileDraft[]
  mealShareInput: string
  onProfileAction: (action: HouseholdFormAction) => void
  counts: MemberCounts
  heading?: string
  onChange: (key: MemberCountKey, count: number) => void
  onContinue: () => void
}

export function MemberGroupsStep({
  counts,
  profiles,
  mealShareInput,
  onProfileAction,
  heading = "Thành viên trong gia đình",
  onChange,
  onContinue
}: MemberGroupsStepProps) {
  const total = totalMemberCount(counts)
  const valid =
    total >= 1 &&
    total <= 20 &&
    profiles.every((p) => memberProfileFromDraft(p) !== null) &&
    /^\d{2}$/u.test(mealShareInput.trim()) &&
    Number(mealShareInput) >= 20 &&
    Number(mealShareInput) <= 50
  function add(kind: "adult" | "elderly") {
    const order =
      Math.max(0, ...profiles.filter((p) => p.memberKind === kind).map((p) => p.sortOrder)) + 1
    onProfileAction({
      type: "add-member-profile",
      profile: createMemberProfileDraft(kind, crypto.randomUUID(), order)
    })
  }

  return (
    <section aria-labelledby="member-step-heading" className="flex flex-col gap-5">
      <div>
        <h1 id="member-step-heading" className="text-2xl font-extrabold tracking-tight text-ink">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Thêm từng người lớn và người cao tuổi để điều chỉnh khẩu phần. Trẻ em giữ cách tính theo
          nhóm tuổi.
        </p>
      </div>
      <div className="grid gap-3">
        {profiles.map((profile) => (
          <MemberProfileCard
            key={profile.id}
            profile={profile}
            mealSharePercent={Number(mealShareInput)}
            onChange={(changes) =>
              onProfileAction({ type: "update-member-profile", id: profile.id, changes })
            }
            onRemove={() => onProfileAction({ type: "remove-member-profile", id: profile.id })}
          />
        ))}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            type="button"
            disabled={total >= 20}
            onClick={() => add("adult")}
          >
            Thêm người lớn
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={total >= 20}
            onClick={() => add("elderly")}
          >
            Thêm người cao tuổi
          </Button>
        </div>
        {MEMBER_FIELDS.map((field) => (
          <MemberCountStepper
            key={field.key}
            label={field.label}
            value={counts[field.key]}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </div>
      <MealEnergyShareField
        value={mealShareInput}
        onChange={(value) => onProfileAction({ type: "set-meal-energy-share", value })}
      />
      <p className="text-sm text-ink-soft">Hiện chưa hỗ trợ trẻ dưới 1 tuổi.</p>
      <p className="font-medium">Tổng cộng: {total} người</p>
      {total > 20 ? (
        <p role="alert" className="text-sm text-chilli-700">
          Tối đa 20 thành viên.
        </p>
      ) : null}
      <Button className="h-11" type="button" disabled={!valid} onClick={onContinue}>
        Tiếp tục
      </Button>
    </section>
  )
}
