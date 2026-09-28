/** Narration speeds offered in the workspace and the player. */
export const NARRATION_SPEEDS = [0.5, 0.75, 0.9, 1, 1.15, 1.25, 1.5, 1.75, 2] as const;

/** Snaps any stored rate to the nearest offered speed. */
export function nearestSpeed(rate: number): number {
  return NARRATION_SPEEDS.reduce((best, s) => (Math.abs(s - rate) < Math.abs(best - rate) ? s : best), 1);
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Mic-Open Earcon: A short, rising two-tone chime (F5 -> A5)
 * Signposts that the prompt is finished and it is now the user's turn to think or speak aloud.
 */
export function playMicOpenEarcon(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Tone 1: 698.46 Hz (F5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(698.46, now);
      gain1.gain.setValueAtTime(0.22, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Tone 2: 880 Hz (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.08);
      gain2.gain.setValueAtTime(0.25, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.30);

      setTimeout(resolve, 250);
    } catch {
      resolve();
    }
  });
}

/**
 * Benchmark Earcon: A distinct, crisp single-frequency ping (1046.5 Hz / C6)
 * Signposts that thinking silence is over and the benchmark answer is about to be revealed.
 */
export function playBenchmarkEarcon(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, now);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);

      setTimeout(resolve, 220);
    } catch {
      resolve();
    }
  });
}

/** Strips literal pause tokens (e.g. [pause 2.5s]) so the synthesizer never speaks them aloud. */
export function cleanSpokenText(text: string): string {
  return text.replace(/\[pause(?:\s+[0-9.]*s?)?\]/gi, "").trim();
}

/**
 * Speaks `text` after cancelling anything in progress. `onBoundary` receives the character
 * index (within the cleaned text) of each word as it starts, where the voice supports it.
 */
export function speakText(
  text: string,
  rate = 1,
  onEnd?: () => void,
  onBoundary?: (charIndex: number) => void
): void {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  stopSpeech();
  const u = new SpeechSynthesisUtterance(cleanSpokenText(text));
  u.rate = rate;
  u.onend = () => onEnd?.();
  u.onboundary = (e) => {
    if (e.name === "word") onBoundary?.(e.charIndex ?? 0);
  };
  window.speechSynthesis.speak(u);
}

// Backward compatibility alias
export const speakChunk = speakText;

export function stopSpeech(): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  // Chromium keeps the synth paused across cancel(), which would silently hold the next utterance.
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
}

export function pauseSpeech(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.pause();
}

export function resumeSpeech(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.resume();
}
