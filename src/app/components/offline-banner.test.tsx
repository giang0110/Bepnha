import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"

import { OfflineBanner } from "./offline-banner"

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value })
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"))
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "onLine")
})

describe("OfflineBanner", () => {
  test("stays out of the way while there is a network", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
    render(<OfflineBanner />)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  test("says what still works, because the honest answer is only some of it", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false })
    render(<OfflineBanner />)

    expect(screen.getByRole("status")).toHaveTextContent(
      "Đang offline — xem được kế hoạch đã tải, chưa lưu được thay đổi."
    )
  })

  test("appears and disappears with the connection rather than only at load", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true })
    render(<OfflineBanner />)

    setOnline(false)
    expect(screen.getByRole("status")).toBeInTheDocument()

    setOnline(true)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
