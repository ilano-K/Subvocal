import { create } from "zustand";
import type { Chunk } from "../data/mockData";
import { NARRATION_SPEEDS, nearestSpeed } from "../utils/speech";

type PlayOpts = { sourceKey: string; rate?: number; pauseSec?: number };

type QueueState = {
  queue: Chunk[];
  // What is loaded (see utils/script queueKey), so callers can resume instead of reloading.
  sourceKey: string | null;
  index: number;
  isPlaying: boolean;
  // Reached the end of the queue; the next play starts again from the first chunk.
  finished: boolean;
  // Passes left for the current chunk, including the one in progress.
  repeatLeft: number;
  // Bumped whenever the current chunk must start speaking again from the top.
  playToken: number;
  liveSnippet: string;
  // The natural voice is still preparing the current chunk, so nothing is audible yet.
  waiting: boolean;
  rate: number;
  pauseSec: number;
  hudOpen: boolean;
  /** Plays `chunks`, resuming in place if the same content is already loaded. */
  play: (chunks: Chunk[], opts: PlayOpts) => void;
  clearQueue: () => void;
  setIndex: (i: number) => void;
  togglePlay: () => void;
  setPlaying: (v: boolean) => void;
  next: () => void;
  prev: () => void;
  replay: () => void;
  /** Automatic progression after a chunk and its pause: repeat, move on, or finish. */
  advance: () => void;
  /** Stop playback and hide the player; the next play restarts the current chunk. */
  stop: () => void;
  setRate: (r: number) => void;
  /** Moves one step up or down the narration speed list. */
  stepRate: (dir: 1 | -1) => void;
  setPause: (s: number) => void;
  setHudOpen: (v: boolean) => void;
  setLiveSnippet: (s: string) => void;
  setWaiting: (v: boolean) => void;
};

const at = (queue: Chunk[], i: number) => {
  const index = Math.max(0, Math.min(i, queue.length - 1));
  return { index, repeatLeft: queue[index]?.reps ?? 1, liveSnippet: "", waiting: false };
};

export const useAudioQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  sourceKey: null,
  index: 0,
  isPlaying: false,
  finished: false,
  repeatLeft: 1,
  playToken: 0,
  liveSnippet: "",
  waiting: false,
  rate: 1,
  pauseSec: 2.5,
  hudOpen: false,

  play: (chunks, { sourceKey, rate, pauseSec }) => {
    if (!chunks.length) return;
    const s = get();
    if (s.sourceKey === sourceKey && s.queue.length) {
      set({ rate: rate ?? s.rate, pauseSec: pauseSec ?? s.pauseSec, hudOpen: true });
      s.setPlaying(true);
      return;
    }
    set({
      queue: chunks,
      sourceKey,
      ...at(chunks, 0),
      rate: rate ?? s.rate,
      pauseSec: pauseSec ?? s.pauseSec,
      isPlaying: true,
      finished: false,
      playToken: s.playToken + 1,
      hudOpen: true,
    });
  },
  clearQueue: () =>
    set((s) => ({ queue: [], sourceKey: null, ...at([], 0), isPlaying: false, finished: false, hudOpen: false, playToken: s.playToken + 1 })),
  setIndex: (i) => set((s) => ({ ...at(s.queue, i), finished: false, playToken: s.playToken + 1 })),
  togglePlay: () => get().setPlaying(!get().isPlaying),
  setPlaying: (v) =>
    set((s) => {
      if (!v) return { isPlaying: false };
      if (!s.queue.length) return {};
      if (s.finished) return { ...at(s.queue, 0), finished: false, isPlaying: true, playToken: s.playToken + 1 };
      return { isPlaying: true };
    }),
  next: () =>
    set((s) =>
      s.index < s.queue.length - 1
        ? { ...at(s.queue, s.index + 1), finished: false, playToken: s.playToken + 1 }
        : { isPlaying: false, finished: true }
    ),
  prev: () => set((s) => ({ ...at(s.queue, s.index - 1), finished: false, playToken: s.playToken + 1 })),
  replay: () => set((s) => ({ isPlaying: true, finished: false, liveSnippet: "", playToken: s.playToken + 1 })),
  advance: () =>
    set((s) => {
      if (s.repeatLeft > 1) return { repeatLeft: s.repeatLeft - 1, liveSnippet: "", playToken: s.playToken + 1 };
      if (s.index < s.queue.length - 1) return { ...at(s.queue, s.index + 1), playToken: s.playToken + 1 };
      return { isPlaying: false, finished: true };
    }),
  stop: () => set((s) => ({ isPlaying: false, hudOpen: false, liveSnippet: "", playToken: s.playToken + 1 })),
  setRate: (rate) => set({ rate }),
  stepRate: (dir) =>
    set((s) => {
      const i = NARRATION_SPEEDS.indexOf(nearestSpeed(s.rate) as (typeof NARRATION_SPEEDS)[number]);
      return { rate: NARRATION_SPEEDS[Math.max(0, Math.min(NARRATION_SPEEDS.length - 1, i + dir))] };
    }),
  setPause: (pauseSec) => set({ pauseSec }),
  setHudOpen: (hudOpen) => set({ hudOpen }),
  setLiveSnippet: (liveSnippet) => set({ liveSnippet }),
  setWaiting: (waiting) => set({ waiting }),
}));
