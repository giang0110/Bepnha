import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, test } from "vitest"

import type { PantryFoodUnitOption } from "@/application/pantry/pantry-food-options-repository"

import { PantryQuantityPresets } from "./pantry-quantity-presets"

function Form({
  unit,
  disabled = false
}: Readonly<{ unit: PantryFoodUnitOption | undefined; disabled?: boolean }>) {
  const [quantity, setQuantity] = useState("0")
  return (
    <>
      <input
        aria-label="Quantity"
        value={quantity}
        onChange={(event) => setQuantity(event.currentTarget.value)}
      />
      <PantryQuantityPresets
        unit={unit}
        quantity={quantity}
        disabled={disabled}
        onSelect={setQuantity}
      />
    </>
  )
}

describe("PantryQuantityPresets", () => {
  test.each([
    ["g", "gam", "250 g", "250"],
    ["kg", "kilôgam", "0,5 kg", "0.5"],
    ["ml", "mililít", "500 ml", "500"],
    ["l", "lít", "1 l", "1"],
    ["tsp", "muỗng cà phê", "2 muỗng cà phê", "2"],
    ["tbsp", "muỗng canh", "1 muỗng canh", "1"],
    ["item", "quả", "4 quả", "4"]
  ])(
    "fills a decimal quantity for the exact %s unit",
    async (unitCode, unitNameVi, label, value) => {
      render(<Form unit={{ unitId: "published-unit", unitCode, unitNameVi }} />)
      const user = userEvent.setup()
      await user.click(screen.getByRole("button", { name: label }))
      expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue(value)
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true")
    }
  )

  test("disables shortcuts while a save is pending", async () => {
    render(<Form unit={{ unitId: "g", unitCode: "g", unitNameVi: "gam" }} disabled />)
    const user = userEvent.setup()
    const button = screen.getByRole("button", { name: "250 g" })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue("0")
  })

  test.each([undefined, { unitId: "custom", unitCode: "cup", unitNameVi: "gam" }])(
    "does not infer quantities from a missing or unknown unit's display label",
    (unit) => {
      render(<Form unit={unit} />)
      expect(screen.queryByRole("group")).not.toBeInTheDocument()
    }
  )
})
