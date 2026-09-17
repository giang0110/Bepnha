import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { LEGAL_OPERATOR, PRIVACY_SECTIONS, TERMS_SECTIONS } from "./legal-content"
import { PrivacyPage, TermsPage } from "./legal-page"

function renderPrivacy() {
  render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>
  )
}

function renderTerms() {
  render(
    <MemoryRouter>
      <TermsPage />
    </MemoryRouter>
  )
}

describe("legal notices", () => {
  it("renders every privacy section under one page heading", () => {
    renderPrivacy()

    expect(screen.getByRole("heading", { level: 1, name: "Chính sách riêng tư" })).toBeVisible()
    for (const section of PRIVACY_SECTIONS) {
      expect(screen.getByRole("heading", { level: 2, name: section.heading })).toBeVisible()
    }
  })

  it("renders every terms section under one page heading", () => {
    renderTerms()

    expect(screen.getByRole("heading", { level: 1, name: "Điều khoản sử dụng" })).toBeVisible()
    for (const section of TERMS_SECTIONS) {
      expect(screen.getByRole("heading", { level: 2, name: section.heading })).toBeVisible()
    }
  })

  it("states the non-collection guarantees the schema actually enforces", () => {
    renderPrivacy()

    const text = document.body.textContent ?? ""
    // These match README's stated guarantee; the database has no column for any of them.
    expect(text).toContain("Họ tên, ngày sinh, giới tính hay cân nặng")
    expect(text).toContain("Chẩn đoán y tế")
    expect(text).toContain("Quy tắc ăn uống dạng văn bản tự do")
    expect(text).toContain("Trẻ em không có tài khoản riêng")
  })

  it("records what the assistant provider is never given", () => {
    renderPrivacy()

    const text = document.body.textContent ?? ""
    expect(text).toContain("không nhận mã đăng nhập")
    expect(text).toContain("không nhận dữ liệu tủ bếp")
  })

  it("refuses to promise allergy safety while explaining the fail-closed rule", () => {
    renderTerms()

    const text = document.body.textContent ?? ""
    expect(text).toContain("không thể bảo đảm an toàn dị ứng")
    expect(text).toContain("bị loại bỏ thay vì được đoán là an toàn")
  })

  it("gives a contact address that can actually receive mail", () => {
    // RFC 2606 reserves these for documentation and testing; mail to any of them is guaranteed to
    // bounce. A privacy notice naming one tells people to write somewhere nobody reads.
    expect(LEGAL_OPERATOR.contactEmail).not.toMatch(/\.(invalid|test|example|localhost)$/u)
    expect(LEGAL_OPERATOR.contactEmail).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/u)
  })

  it.each([
    ["privacy", renderPrivacy],
    ["terms", renderTerms]
  ])("prints that address on the %s notice", (_name, render) => {
    render()

    expect(document.body.textContent).toContain(LEGAL_OPERATOR.contactEmail)
  })

  it("cross-links the two notices so either one reaches the other", () => {
    renderPrivacy()

    expect(screen.getByRole("link", { name: "Điều khoản sử dụng" })).toHaveAttribute(
      "href",
      "/terms"
    )
    expect(screen.getByRole("link", { name: "Chính sách riêng tư" })).toHaveAttribute(
      "href",
      "/privacy"
    )
  })
})
