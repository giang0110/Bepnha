import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"
import { MemberProfileCard } from "./member-profile-card"
import { createMemberProfileDraft } from "../household-form-state"
function Card() {
  const [profile, setProfile] = useState(
    createMemberProfileDraft("adult", "10000000-0000-4000-8000-000000000001", 1)
  )
  return (
    <MemberProfileCard
      profile={profile}
      mealSharePercent={33}
      onChange={(changes) => setProfile((p) => ({ ...p, ...changes }))}
      onRemove={() => {}}
    />
  )
}
test("BMI follows comma decimals and incomplete inputs do not apply a goal", async () => {
  const user = userEvent.setup()
  render(<Card />)
  await user.type(screen.getByLabelText("Chiều cao (cm)"), "170")
  await user.type(screen.getByLabelText("Cân nặng (kg)"), "65,00")
  expect(screen.getByText("22,49")).toBeVisible()
  expect(screen.getByText(/Chưa đủ tuổi/)).toBeVisible()
  expect(screen.queryByText(/Mục tiêu cho một bữa chính:/)).toBeNull()
  await user.type(screen.getByLabelText("Tuổi"), "30")
  await user.selectOptions(screen.getByLabelText("Giới tính dùng tính năng lượng"), "male")
  await user.selectOptions(screen.getByLabelText("Mức vận động"), "light")
  expect(screen.getByText(/711 kcal/)).toBeVisible()
  await user.selectOptions(screen.getByLabelText("Mục tiêu ăn uống"), "lose")
  expect(screen.getByText(/640 kcal/)).toBeVisible()
  const weight = screen.getByLabelText("Cân nặng (kg)")
  await user.clear(weight)
  await user.type(weight, "50")
  expect(screen.getByText(/BMI dưới 18,5/)).toBeVisible()
  expect(screen.queryByText(/Mục tiêu cho một bữa chính:/)).toBeNull()
  expect(localStorage).toHaveLength(0)
})
