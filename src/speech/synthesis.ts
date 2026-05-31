export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const synthesis = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.voice = pickChineseVoice(synthesis.getVoices());

  synthesis.cancel();
  window.setTimeout(() => {
    synthesis.speak(utterance);
  }, 40);
}

function pickChineseVoice(voices: SpeechSynthesisVoice[]) {
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ?? null;
}

export function warmUpSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.getVoices();
}
