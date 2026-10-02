import { Button } from "@/app/components/ui/button"
import { calculateMemberEnergyTarget } from "@/domain/nutrition/member-energy-target"
import type { MemberProfileV1 } from "@/domain/household/member-profile"
import { memberProfileFromDraft, type MemberProfileDraft } from "../household-form-state"
import { energyReasonLabel, goalLabel } from "../household-display"
interface Props {
  readonly profile: MemberProfileDraft
  readonly mealSharePercent: number
  readonly onChange: (
    changes: Partial<Omit<MemberProfileDraft, "id" | "memberKind" | "sortOrder">>
  ) => void
  readonly onRemove: () => void
}
const inputClass = "h-11 w-full rounded-xl border border-edge-strong bg-white px-3"
export function MemberProfileCard({ profile, mealSharePercent, onChange, onRemove }: Props) {
  const person = memberProfileFromDraft(profile),
    energy = person ? calculateMemberEnergyTarget(person, mealSharePercent) : null
  const title = `${profile.memberKind === "adult" ? "Người lớn" : "Người cao tuổi"} ${profile.sortOrder}`
  const fieldId = (key: string) => `profile-${profile.id}-${key}`
  return (
    <fieldset className="min-w-0 rounded-2xl border border-edge bg-paper-raised p-4">
      <legend className="px-1 font-bold">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={fieldId("label")}>
          Tên gọi (không bắt buộc)
          <input
            className={inputClass}
            id={fieldId("label")}
            maxLength={40}
            value={profile.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </label>
        {(
          [
            ["heightInput", "Chiều cao (cm)"],
            ["weightInput", "Cân nặng (kg)"],
            ["ageInput", "Tuổi"]
          ] as const
        ).map(([key, label]) => (
          <label key={key} htmlFor={fieldId(key)}>
            {label}
            <input
              className={inputClass}
              id={fieldId(key)}
              inputMode={key === "ageInput" ? "numeric" : "decimal"}
              type="text"
              value={profile[key]}
              onChange={(e) => onChange({ [key]: e.target.value })}
            />
          </label>
        ))}
        <label htmlFor={fieldId("sex")}>
          Giới tính dùng tính năng lượng
          <select
            className={inputClass}
            id={fieldId("sex")}
            value={profile.sexForEquation ?? ""}
            onChange={(e) =>
              onChange({
                sexForEquation: (e.target.value || null) as MemberProfileV1["sexForEquation"]
              })
            }
          >
            <option value="">Chưa chọn</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
          </select>
        </label>
        <label htmlFor={fieldId("activity")}>
          Mức vận động
          <select
            className={inputClass}
            id={fieldId("activity")}
            value={profile.activityLevel ?? ""}
            onChange={(e) =>
              onChange({
                activityLevel: (e.target.value || null) as MemberProfileV1["activityLevel"]
              })
            }
          >
            <option value="">Chưa chọn</option>
            {[
              ["sedentary", "Ít vận động"],
              ["light", "Nhẹ (1–3 buổi/tuần)"],
              ["moderate", "Vừa (3–5 buổi/tuần)"],
              ["active", "Nhiều (6–7 buổi/tuần)"],
              ["very_active", "Rất nhiều"]
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={fieldId("goal")}>
          Mục tiêu ăn uống
          <select
            className={inputClass}
            id={fieldId("goal")}
            value={profile.goal}
            onChange={(e) => onChange({ goal: e.target.value as MemberProfileV1["goal"] })}
          >
            {(["maintain", "gain", "lose"] as const).map((goal) => (
              <option key={goal} value={goal}>
                {goalLabel(goal)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 text-sm" aria-live="polite">
        {energy?.bmi ? (
          <p>
            BMI:{" "}
            <strong>
              {Number(energy.bmi).toLocaleString("vi-VN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </strong>
          </p>
        ) : (
          <p>BMI: chưa đủ chiều cao và cân nặng.</p>
        )}
        {energy?.status === "applied" ? (
          <p>
            Mục tiêu cho một bữa chính:{" "}
            {Math.round(Number(energy.mealTargetKcal)).toLocaleString("vi-VN")} kcal.
          </p>
        ) : (
          <p>
            {energy
              ? energyReasonLabel(energy.reason)
              : "Kiểm tra chiều cao 100–250 cm, cân nặng 25–350 kg, tuổi 18–100 và số thập phân tối đa 2 chữ số."}
          </p>
        )}
      </div>
      <Button
        className="mt-3"
        variant="outline"
        type="button"
        aria-label={`Xóa ${title}`}
        onClick={onRemove}
      >
        Xóa thành viên
      </Button>
    </fieldset>
  )
}
