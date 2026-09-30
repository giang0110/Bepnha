import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ToastContainer, toast } from "./toast"

describe("toast component", () => {
  it("renders toast when toast event is dispatched", () => {
    render(<ToastContainer />)

    act(() => {
      toast.success("Đã lưu thành công!")
    })

    expect(screen.getByText("Đã lưu thành công!")).toBeInTheDocument()
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("dismisses toast when close button is clicked", async () => {
    const user = userEvent.setup()
    render(<ToastContainer />)

    act(() => {
      toast.info("Lời nhắc quan trọng")
    })

    expect(screen.getByText("Lời nhắc quan trọng")).toBeInTheDocument()

    const closeBtn = screen.getByRole("button", { name: "Đóng thông báo" })
    await user.click(closeBtn)

    expect(screen.queryByText("Lời nhắc quan trọng")).not.toBeInTheDocument()
  })
})
