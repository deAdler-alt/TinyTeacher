export function isTtsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speakText(text, lang = 'pl', opts = {}, onEvent) {
  const synth = window.speechSynthesis
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  u.rate = opts.rate ?? 1
  u.pitch = opts.pitch ?? 1
  u.onstart = (e) => onEvent?.({ type: 'start', e })
  u.onend = (e) => onEvent?.({ type: 'end', e })
  synth.cancel()
  synth.speak(u)
  return {
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    cancel: () => synth.cancel()
  }
}
