import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  cancelCookingSpeech,
  isSpeaking,
  isSpeechSynthesisSupported,
  speakCookingInstruction
} from "./cooking-speech"

describe("cooking-speech", () => {
  const originalSpeechSynthesis = window.speechSynthesis

  let mockSpeak: ReturnType<typeof vi.fn>
  let mockCancel: ReturnType<typeof vi.fn>
  let mockUtterance: { text: string; lang: string; rate: number; onend: (() => void) | null }

  beforeEach(() => {
    mockSpeak = vi.fn()
    mockCancel = vi.fn()

    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: mockSpeak,
        cancel: mockCancel,
        speaking: false
      },
      writable: true,
      configurable: true
    })

    // Mock SpeechSynthesisUtterance
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string
        lang = ""
        rate = 1
        onend: (() => void) | null = null
        constructor(text: string) {
          this.text = text
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          mockUtterance = this
        }
      },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: originalSpeechSynthesis,
      writable: true,
      configurable: true
    })
  })

  test("detects speech synthesis support correctly", () => {
    expect(isSpeechSynthesisSupported()).toBe(true)
  })

  test("cancels active speech before speaking a new instruction with Vietnamese lang", () => {
    const text = "Thịt gà rửa sạch, gừng thái chỉ"
    const started = speakCookingInstruction(text)

    expect(started).toBe(true)
    expect(mockCancel).toHaveBeenCalledTimes(1)
    expect(mockSpeak).toHaveBeenCalledTimes(1)
    expect(mockUtterance.text).toBe(text)
    expect(mockUtterance.lang).toBe("vi-VN")
    expect(mockUtterance.rate).toBe(0.95)
  })

  test("can explicitly cancel speech synthesis", () => {
    cancelCookingSpeech()
    expect(mockCancel).toHaveBeenCalled()
  })

  test("reports speaking state from speechSynthesis", () => {
    expect(isSpeaking()).toBe(false)
    Object.defineProperty(window.speechSynthesis, "speaking", { value: true, configurable: true })
    expect(isSpeaking()).toBe(true)
  })

  test("returns false when instruction is empty", () => {
    expect(speakCookingInstruction("   ")).toBe(false)
    expect(mockSpeak).not.toHaveBeenCalled()
  })
})
