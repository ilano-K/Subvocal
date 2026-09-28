import { useEffect, useRef } from "react";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { speakText, stopSpeech, pauseSpeech, resumeSpeech, cleanSpokenText } from "../utils/speech";

type Phase = "idle" | "speaking" | "paused" | "gap" | "gap-paused";

/**
 * Drives speech synthesis from the audio queue store. Mount exactly once.
 * Chunk changes and replays arrive as `playToken` bumps. Pausing and speed changes
 * keep the position: a new speed re-speaks the rest of the chunk from the current word.
 */
export function usePlaybackEngine() {
  const playToken = useAudioQueueStore((s) => s.playToken);
  const isPlaying = useAudioQueueStore((s) => s.isPlaying);
  const rate = useAudioQueueStore((s) => s.rate);

  const phase = useRef<Phase>("idle");
  const runId = useRef(0);
  const gapTimer = useRef<number | null>(null);
  // Character offset (in the chunk's cleaned text) of the word being spoken, and the rate it's spoken at.
  const spokenOffset = useRef(0);
  const spokenRate = useRef<number | null>(null);

  const clearGap = () => {
    if (gapTimer.current) window.clearTimeout(gapTimer.current);
    gapTimer.current = null;
  };

  const startGap = (id: number) => {
    phase.current = "gap";
    const ms = Math.max(800, useAudioQueueStore.getState().pauseSec * 1000);
    gapTimer.current = window.setTimeout(() => {
      gapTimer.current = null;
      if (id !== runId.current) return;
      phase.current = "idle";
      useAudioQueueStore.getState().advance();
    }, ms);
  };

  const speakCurrent = (from = 0) => {
    const { queue, index, rate, setLiveSnippet } = useAudioQueueStore.getState();
    const chunk = queue[index];
    if (!chunk) return;
    const text = cleanSpokenText(chunk.text);
    const id = ++runId.current;
    phase.current = "speaking";
    spokenOffset.current = from;
    spokenRate.current = rate;
    if (from >= text.length) {
      stopSpeech();
      startGap(id);
      return;
    }
    speakText(
      text.slice(from),
      rate,
      () => {
        if (id === runId.current) startGap(id);
      },
      (charIndex) => {
        if (id !== runId.current) return;
        spokenOffset.current = from + charIndex;
        setLiveSnippet(text.slice(spokenOffset.current, spokenOffset.current + 40) + "…");
      }
    );
  };

  // Start the current chunk from the top whenever it changes or is replayed.
  useEffect(() => {
    if (useAudioQueueStore.getState().isPlaying) speakCurrent();
    return () => {
      runId.current++;
      clearGap();
      stopSpeech();
      phase.current = "idle";
    };
  }, [playToken]);

  // Speech rate can't change mid-utterance, so continue from the current word at the new rate.
  useEffect(() => {
    if (spokenRate.current === null || spokenRate.current === rate) return;
    if (phase.current === "speaking") {
      speakCurrent(spokenOffset.current);
    } else if (phase.current === "paused") {
      // Drop the paused utterance; resuming re-speaks from the same word at the new rate.
      runId.current++;
      stopSpeech();
      spokenRate.current = rate;
    }
    // Between chunks the next one simply starts at the new rate.
  }, [rate]);

  useEffect(() => {
    if (isPlaying) {
      if (phase.current === "paused") {
        if (window.speechSynthesis?.speaking) {
          resumeSpeech();
          phase.current = "speaking";
        } else {
          speakCurrent(spokenOffset.current);
        }
      } else if (phase.current === "gap-paused") {
        phase.current = "idle";
        useAudioQueueStore.getState().advance();
      } else if (phase.current === "idle") {
        speakCurrent();
      }
    } else if (phase.current === "speaking") {
      pauseSpeech();
      phase.current = "paused";
    } else if (phase.current === "gap") {
      clearGap();
      phase.current = "gap-paused";
    }
  }, [isPlaying]);
}
