export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  )
}

export function isSpeaking(): boolean {
  if (!isSpeechSynthesisSupported()) return false
  return window.speechSynthesis.speaking
}

export function cancelCookingSpeech(): void {
  if (!isSpeechSynthesisSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // Best-effort
  }
}

export function speakCookingInstruction(instructionVi: string, onEnd?: () => void): boolean {
  if (!isSpeechSynthesisSupported()) return false

  const text = instructionVi.trim()
  if (text.length === 0) return false

  try {
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "vi-VN"
    utterance.rate = 0.95 // Slightly slower than 1.0 for crystal-clear cooking clarity

    if (onEnd !== undefined) {
      utterance.onend = onEnd
      utterance.onerror = onEnd
    }

    window.speechSynthesis.speak(utterance)
    return true
  } catch {
    return false
  }
}
