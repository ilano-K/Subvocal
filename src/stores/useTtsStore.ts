import { create } from "zustand";
import {
  HttpError,
  ttsCancelInstall,
  ttsClearCache,
  ttsCoverage,
  ttsHealth,
  ttsInstall,
  ttsPrepare,
  ttsPreview,
  ttsPrioritize,
  ttsStatus,
  ttsUninstall,
  ttsUpdateSettings,
} from "../services/api";
import type { TtsClip, TtsClipStatus, TtsHealth, TtsSettings } from "../services/api";
import type { Chunk } from "../data/mockData";
import { cleanSpokenText } from "../utils/speech";
import { queueKey } from "../utils/script";
import { clipKey, isPendingStatus } from "../utils/tts";
import { useAudioQueueStore } from "./useAudioQueueStore";
import { useLibraryStore } from "./useLibraryStore";
import { useSessionStore } from "./useSessionStore";

export type ClipState = {
  audioId: string;
  status: TtsClipStatus;
  durationSec: number | null;
  error: string | null;
};

type DeckRef = { deckKey: string; deckTitle: string };

type Busy = null | "install" | "cancel" | "uninstall" | "settings" | "clear";

type TtsState = {
  /** Last successful GET /tts/health. The server is the source of truth for install, on/off and voice. */
  health: TtsHealth | null;
  /** False after a network error, true after any success. */
  reachable: boolean;
  clips: Record<string, ClipState>; // by audioId
  /** Rendered sections per saved deck (by deck id), for decks that aren't open in the player. */
  coverage: Record<string, { ready: number; total: number }>;
  audioIdByKey: Record<string, string>; // clipKey(voice, chunk.text) -> audioId
  /** Queue sourceKey for which the user picked "Use system voice for this session". */
  systemOverrideKey: string | null;
  /** Until when the engine is expected to start loading (just switched on, or just installed). */
  expectLoadUntil: number;
  lastError: string | null;
  busy: Busy;

  refreshHealth: () => Promise<void>;
  install: () => Promise<void>;
  cancelInstall: () => Promise<void>;
  uninstall: (clearAudio: boolean) => Promise<void>;
  clearCache: () => Promise<void>;
  updateSettings: (patch: Partial<TtsSettings>) => Promise<void>;
  preview: (voice: string) => Promise<string | null>;
  prepare: (chunks: Chunk[], startIndex: number, deck?: DeckRef) => Promise<void>;
  prepareCurrent: (opts?: { sessionFirstOnly?: boolean }) => void;
  prioritizeWindow: (chunks: Chunk[], index: number) => void;
  refreshCoverage: (decks: { id: string; texts: string[] }[]) => Promise<void>;
  pollStatuses: () => Promise<void>;
  applyStatuses: (clips: TtsClip[]) => void;
  forgetClips: () => void;
  clipFor: (chunk: Chunk) => ClipState | undefined;
  pendingIds: () => string[];
  isExpectingLoad: () => boolean;
  narratorActive: () => boolean;
  naturalFor: (sourceKey: string | null) => boolean;
  systemVoiceForThisSession: () => void;
  clearError: () => void;
};

const EXPECT_LOAD_MS = 45_000;
const MAX_CLIPS = 500;
const SESSION_FIRST_CHUNKS = 3; // a deck that is only opened renders just its start

const toClipState = (c: TtsClip): ClipState => ({
  audioId: c.audioId,
  status: c.status,
  durationSec: c.durationSec ?? null,
  error: c.error ?? null,
});

/** The deck a list of chunks belongs to: the player's deck when it is the queue, otherwise the open deck. */
function deckOf(chunks: Chunk[]): DeckRef {
  const q = useAudioQueueStore.getState();
  if (chunks === q.queue && q.sourceKey) {
    const deckKey = q.sourceKey.split(":")[0];
    const open = useSessionStore.getState();
    const title =
      useLibraryStore.getState().sessions.find((d) => d.id === deckKey)?.title ??
      (open.activeDeckId === deckKey ? open.docTitle.trim() : "");
    return { deckKey, deckTitle: title || "Your audio" };
  }
  const open = useSessionStore.getState();
  return { deckKey: open.activeDeckId ?? "draft", deckTitle: open.docTitle.trim() || "Untitled audio" };
}

// Debounce for prepareCurrent: script written + play started collapse into one round.
let prepareTimer: number | null = null;
let pendingFirstOnly: boolean | null = null;
// An identical prepare within two seconds is skipped.
let lastPrepare = { sig: "", at: 0 };
// Re-preparing after a backend restart happens at most once every five seconds.
let lastReprepare = 0;

function textHash(chunks: Chunk[]): string {
  let h = 5381;
  for (const c of chunks) {
    const s = `${c.text}\u0000`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export const useTtsStore = create<TtsState>((set, get) => {
  /** A network failure marks the backend unreachable; anything else is a normal API error. */
  const noteFailure = (e: unknown): string => {
    if (e instanceof HttpError && e.status === 0) set({ reachable: false });
    return e instanceof Error ? e.message : "Something went wrong.";
  };

  /** Runs a Settings action with `busy` set and an error box on failure, then refreshes health. */
  const mutate = async (busy: Exclude<Busy, null>, fn: () => Promise<void>) => {
    set({ busy, lastError: null });
    try {
      await fn();
    } catch (e) {
      const message = noteFailure(e);
      if (e instanceof HttpError && e.status === 0) {
        set({ lastError: "Can't reach Subvocal's local service." });
      } else {
        set({ lastError: message });
      }
    }
    await get().refreshHealth();
    set({ busy: null });
  };

  return {
    health: null,
    reachable: true,
    clips: {},
    coverage: {},
    audioIdByKey: {},
    systemOverrideKey: null,
    expectLoadUntil: 0,
    lastError: null,
    busy: null,

    refreshHealth: async () => {
      const wasActive = get().narratorActive();
      const wasReachable = get().reachable;
      const prevInstall = get().health?.install.state;
      try {
        const health = await ttsHealth();
        const justInstalled =
          (prevInstall === "downloading" || prevInstall === "verifying") && health.install.state === "installed";
        set({
          health,
          reachable: true,
          expectLoadUntil: justInstalled ? Date.now() + EXPECT_LOAD_MS : get().expectLoadUntil,
        });
        const active = get().narratorActive();
        if ((!wasActive && active) || !wasReachable) get().prepareCurrent();
        if (!active && health.install.state !== "installed" && Object.keys(get().clips).length) get().forgetClips();
      } catch (e) {
        noteFailure(e);
      }
    },

    install: () =>
      mutate("install", async () => {
        try {
          await ttsInstall();
        } catch (e) {
          // 409: a download is already running, which is what was asked for.
          if (e instanceof HttpError && e.status === 409) return;
          if (e instanceof HttpError && e.status === 507) {
            throw new Error(`Not enough free disk space. ${e.message}`);
          }
          throw e;
        }
      }),

    cancelInstall: () => mutate("cancel", () => ttsCancelInstall()),

    uninstall: (clearAudio) =>
      mutate("uninstall", async () => {
        try {
          await ttsUninstall(clearAudio);
        } catch (e) {
          if (e instanceof HttpError && e.status === 409) {
            throw new Error("Cancel the download before removing the narrator.");
          }
          throw e;
        }
        if (clearAudio) get().forgetClips();
      }),

    clearCache: () =>
      mutate("clear", async () => {
        await ttsClearCache();
        get().forgetClips();
        get().prepareCurrent();
      }),

    updateSettings: (patch) =>
      mutate("settings", async () => {
        const before = get().health?.settings;
        try {
          await ttsUpdateSettings(patch);
        } catch (e) {
          if (e instanceof HttpError && e.status === 400) throw new Error("That voice isn't available.");
          throw e;
        }
        if (patch.enabled === true && !before?.enabled) set({ expectLoadUntil: Date.now() + EXPECT_LOAD_MS });
        if (patch.voice && patch.voice !== before?.voice) {
          // refreshHealth (run by mutate) sees the new voice; prepare after it.
          setTimeout(() => get().prepareCurrent(), 0);
        }
      }),

    preview: async (voice) => {
      set({ lastError: null });
      try {
        const clip = await ttsPreview(voice);
        set((s) => ({ clips: { ...s.clips, [clip.audioId]: toClipState(clip) } }));
        return clip.audioId;
      } catch (e) {
        const message = noteFailure(e);
        if (e instanceof HttpError && (e.status === 503 || e.status === 400)) {
          get().refreshHealth();
          set({ lastError: e.status === 503 ? "The natural voice isn't ready yet." : "That voice isn't available." });
        } else {
          set({ lastError: message });
        }
        return null;
      }
    },

    prepare: async (chunks, startIndex, deck) => {
      const s = get();
      if (!s.health || !s.narratorActive()) return;
      const voice = s.health.settings.voice;

      // Chunks with nothing to say are skipped, so the start index moves with them.
      const kept = chunks.filter((c) => cleanSpokenText(c.text).length > 0);
      if (!kept.length) return;
      const start = chunks.slice(0, startIndex).filter((c) => cleanSpokenText(c.text).length > 0).length;

      const sig = `${voice}|${start}|${kept.length}|${textHash(kept)}`;
      if (sig === lastPrepare.sig && Date.now() - lastPrepare.at < 2000) return;
      lastPrepare = { sig, at: Date.now() };

      try {
        const result = await ttsPrepare(
          kept.map((c) => ({ id: c.id, text: c.text, title: c.title })),
          start,
          voice,
          deck ?? deckOf(chunks)
        );
        set((cur) => {
          const clips = { ...cur.clips };
          const audioIdByKey = { ...cur.audioIdByKey };
          result.forEach((clip, i) => {
            const chunk = kept[i];
            if (!chunk) return;
            audioIdByKey[clipKey(voice, chunk.text)] = clip.audioId;
            clips[clip.audioId] = toClipState(clip);
          });
          return { clips, audioIdByKey };
        });
        // Keep memory bounded: drop clips nothing on screen refers to.
        if (Object.keys(get().clips).length > MAX_CLIPS) {
          const inUse = new Set<string>();
          const q = useAudioQueueStore.getState().queue;
          const sc = useSessionStore.getState().chunks;
          for (const c of [...q, ...sc]) {
            const id = get().audioIdByKey[clipKey(voice, c.text)];
            if (id) inUse.add(id);
          }
          set((cur) => ({
            clips: Object.fromEntries(Object.entries(cur.clips).filter(([id]) => inUse.has(id))),
            audioIdByKey: Object.fromEntries(Object.entries(cur.audioIdByKey).filter(([, id]) => inUse.has(id))),
          }));
        }
      } catch (e) {
        lastPrepare = { sig: "", at: 0 };
        noteFailure(e);
        // 503: the engine changed under us. 400: the voice list is stale. Either way, look again.
        if (e instanceof HttpError && (e.status === 503 || e.status === 400)) get().refreshHealth();
      }
    },

    prepareCurrent: (opts) => {
      pendingFirstOnly = pendingFirstOnly === null ? !!opts?.sessionFirstOnly : pendingFirstOnly && !!opts?.sessionFirstOnly;
      if (prepareTimer !== null) window.clearTimeout(prepareTimer);
      prepareTimer = window.setTimeout(async () => {
        prepareTimer = null;
        const firstOnly = pendingFirstOnly === true;
        pendingFirstOnly = null;

        const session = useSessionStore.getState();
        const q = useAudioQueueStore.getState();
        // The open deck, when it isn't what the player already holds.
        if (session.chunks.length && queueKey(session.activeDeckId, session.chunks) !== q.sourceKey) {
          await get().prepare(firstOnly ? session.chunks.slice(0, SESSION_FIRST_CHUNKS) : session.chunks, 0);
        }
        // The playing queue goes last, so it always wins the render order.
        if (q.queue.length) {
          await get().prepare(q.queue, q.index);
          get().prioritizeWindow(q.queue, q.index);
        }
      }, 300);
    },

    prioritizeWindow: (chunks, index) => {
      const s = get();
      if (!s.health || !s.narratorActive()) return;
      const voice = s.health.settings.voice;
      const window3 = chunks.slice(index, index + 3);
      const ids = window3.map((c) => s.audioIdByKey[clipKey(voice, c.text)]);
      // The current chunk isn't known to the backend yet: prepare it (it becomes the start).
      if (!ids[0]) {
        void s.prepare(chunks, index);
        return;
      }
      const waiting = ids.filter((id): id is string => !!id && s.clips[id]?.status !== "ready");
      if (!waiting.length) return;
      ttsPrioritize(waiting).catch(noteFailure);
    },

    refreshCoverage: async (decks) => {
      if (!decks.length || !get().narratorActive()) return;
      try {
        const rows = await ttsCoverage(decks);
        set((s) => ({
          coverage: { ...s.coverage, ...Object.fromEntries(rows.map((r) => [r.id, { ready: r.ready, total: r.total }])) },
        }));
      } catch (e) {
        noteFailure(e);
      }
    },

    pollStatuses: async () => {
      const ids = get().pendingIds();
      if (!ids.length) return;
      try {
        get().applyStatuses(await ttsStatus(ids));
        set({ reachable: true });
      } catch (e) {
        noteFailure(e);
      }
    },

    applyStatuses: (list) => {
      let lostSome = false;
      set((s) => {
        const clips = { ...s.clips };
        for (const c of list) {
          // After a backend restart the queue is empty: the clip must be asked for again.
          if (c.status === "failed" && c.error === "unknown audio id") {
            delete clips[c.audioId];
            lostSome = true;
          } else {
            clips[c.audioId] = toClipState(c);
          }
        }
        return { clips };
      });
      if (lostSome && Date.now() - lastReprepare > 5000) {
        lastReprepare = Date.now();
        lastPrepare = { sig: "", at: 0 };
        get().prepareCurrent();
      }
    },

    forgetClips: () => {
      lastPrepare = { sig: "", at: 0 };
      set({ clips: {}, audioIdByKey: {} });
    },

    clipFor: (chunk) => {
      const s = get();
      const voice = s.health?.settings.voice;
      if (!voice) return undefined;
      const id = s.audioIdByKey[clipKey(voice, chunk.text)];
      return id ? s.clips[id] : undefined;
    },

    pendingIds: () =>
      Object.values(get().clips)
        .filter((c) => isPendingStatus(c.status))
        .map((c) => c.audioId),

    isExpectingLoad: () => {
      const s = get();
      const state = s.health?.state;
      return Date.now() < s.expectLoadUntil && state !== "ready" && state !== "failed" && state !== "degraded";
    },

    narratorActive: () => {
      const { reachable, health } = get();
      return (
        reachable &&
        !!health &&
        health.install.state === "installed" &&
        health.settings.enabled &&
        (health.state === "ready" || health.state === "loading")
      );
    },

    naturalFor: (sourceKey) => {
      const s = get();
      return s.narratorActive() && (s.systemOverrideKey === null || s.systemOverrideKey !== sourceKey);
    },

    systemVoiceForThisSession: () => set({ systemOverrideKey: useAudioQueueStore.getState().sourceKey }),

    clearError: () => set({ lastError: null }),
  };
});
