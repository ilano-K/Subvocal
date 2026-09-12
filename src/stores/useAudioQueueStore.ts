import { create } from "zustand";
import type { Chunk } from "../data/mockData";

type QueueState = {
  queue: Chunk[];
  index: number;
  isPlaying: boolean;
  repeatLeft: number;
  rate: number;
  pauseSec: number;
  hudOpen: boolean;
  setQueue: (chunks: Chunk[], startAt?: number) => void;
  setIndex: (i: number) => void;
  togglePlay: () => void;
  setPlaying: (v: boolean) => void;
  next: () => void;
  prev: () => void;
  repeat: () => void;
  setRate: (r: number) => void;
  setPause: (s: number) => void;
  setHudOpen: (v: boolean) => void;
};

export const useAudioQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  index: 0,
  isPlaying: false,
  repeatLeft: 1,
  rate: 1,
  pauseSec: 3.5,
  hudOpen: false,
  setQueue: (queue, startAt = 0) =>
    set({
      queue,
      index: Math.min(startAt, Math.max(0, queue.length - 1)),
      isPlaying: queue.length > 0,
      repeatLeft: queue[startAt]?.reps ?? 1,
    }),
  setIndex: (index) => {
    const q = get().queue;
    const safe = Math.max(0, Math.min(index, q.length - 1));
    set({ index: safe, repeatLeft: q[safe]?.reps ?? 1 });
  },
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  next: () =>
    set((s) => {
      if (s.repeatLeft > 1) return { repeatLeft: s.repeatLeft - 1 };
      const ni = Math.min(s.index + 1, s.queue.length - 1);
      return { index: ni, repeatLeft: s.queue[ni]?.reps ?? 1 };
    }),
  prev: () =>
    set((s) => {
      const pi = Math.max(s.index - 1, 0);
      return { index: pi, repeatLeft: s.queue[pi]?.reps ?? 1 };
    }),
  repeat: () =>
    set((s) => {
      const cur = s.queue[s.index];
      return { repeatLeft: cur?.reps ?? 1 };
    }),
  setRate: (rate) => set({ rate }),
  setPause: (pauseSec) => set({ pauseSec }),
  setHudOpen: (hudOpen) => set({ hudOpen }),
}));
