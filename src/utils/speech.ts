export function speakChunk(text: string, rate = 1, onEnd?: () => void, onBoundary?: (snippet: string) => void) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.onend = () => onEnd?.();
  // boundary event gives us word-level granularity where supported
  // @ts-ignore
  u.onboundary = (e: SpeechSynthesisEvent) => {
    if (e.name === "word") {
      const snippet = text.slice(e.charIndex ?? 0, (e.charIndex ?? 0) + 40);
      onBoundary?.(snippet);
    }
  };
  window.speechSynthesis.speak(u);
}

export function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
export function pauseSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.pause();
}
export function resumeSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.resume();
}
