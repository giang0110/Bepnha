import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { PlanTrustPanel } from "./plan-trust-panel"

describe("PlanTrustPanel", () => {
  it("explains calculation provenance without making a medical claim", async () => {
    const user = userEvent.setup()
    render(
      <PlanTrustPanel
        trust={{
          calculationDate: "2026-08-26",
          adultEquivalent: "2.55",
          priceObservedFrom: "2026-06-15",
          priceObservedTo: "2026-08-20",
          stalePriceCount: 1,
          coverage: {
            serving: "complete",
            nutrition: "complete",
            cost: "complete",
            hardConstraints: "complete"
          },
          explanationCodes: ["REUSE_DISTINCT_FOODS"]
        }}
      />
    )

    expect(screen.getByRole("heading", { name: "Vì sao kế hoạch này phù hợp" })).toBeInTheDocument()
    expect(screen.getByText(/2,55 suất người lớn/i)).toBeInTheDocument()
    expect(screen.getByText(/giá quan sát 15\/06\/2026–20\/08\/2026/i)).toBeInTheDocument()
    expect(screen.getByText(/1 mức giá cũ nhưng vẫn dùng được/i)).toBeInTheDocument()
    await user.click(screen.getByText("Xem tiêu chí xếp hạng"))
    expect(screen.getByText("Tận dụng nguyên liệu giữa các bữa")).toBeInTheDocument()
    expect(screen.getByText(/không phải khuyến nghị y khoa/i)).toBeInTheDocument()
  })
})
