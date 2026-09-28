import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session, StudyStyle } from "../data/mockData";
import {
  fetchStudyDecks,
  createStudyDeck,
  updateStudyDeck,
  deleteStudyDeck,
  type StudyDeckRecord,
  type StudyDeckCreatePayload,
} from "../services/api";
import { useSessionStore } from "./useSessionStore";
import { useAudioQueueStore } from "./useAudioQueueStore";

export type DeckData = StudyDeckCreatePayload;

const UNDO_WINDOW_MS = 5000;

function formatDurationLabel(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return `${min} min`;
}

function toSession(id: string, d: DeckData, isLocal: boolean): Session {
  return {
    id,
    title: d.deckTitle,
    fileName: d.filename,
    style: (d.style as StudyStyle) || "primer",
    chunks: d.chunks.map((c) => ({ id: c.id, conceptId: c.conceptId ?? "", title: c.title, text: c.text, reps: c.reps })),
    concepts: d.concepts.map((c) => ({ id: c.id, term: c.term, definition: c.definition, reps: (c.reps as 1 | 2 | 3) || 1 })),
    transcript: d.transcript,
    pauseSec: d.pauseSec,
    voiceRate: d.voiceRate,
    estimatedSec: d.estimatedSec,
    durationLabel: formatDurationLabel(d.estimatedSec),
    lastStudied: isLocal ? "Not synced" : "Saved",
    chunkCount: d.chunks.length,
    isLocal: isLocal || undefined,
  };
}

const recordToSession = (r: StudyDeckRecord) => toSession(String(r.id), r, false);

function sessionToDeckData(s: Session): DeckData {
  return {
    filename: s.fileName,
    deckTitle: s.title,
    pauseSec: s.pauseSec,
    voiceRate: s.voiceRate,
    estimatedSec: s.estimatedSec,
    transcript: s.transcript,
    style: s.style,
    chunks: s.chunks,
    concepts: s.concepts,
  };
}

const serverId = (id: string | null | undefined) => (id && /^\d+$/.test(id) ? parseInt(id, 10) : null);

// Decks whose deletion has been committed; autosave must not write them back.
const deletedIds = new Set<string>();
export const wasDeleted = (id: string) => deletedIds.has(id);

let deleteTimer: number | null = null;

type LibState = {
  sessions: Session[];
  filter: string;
  sortBy: "recent" | "duration" | "chunks";
  loading: boolean;
  error: string | null;
  // Deck removed from view but not yet deleted, so it can still be restored.
  pendingDelete: { session: Session; index: number } | null;
  setFilter: (v: string) => void;
  setSort: (v: LibState["sortBy"]) => void;
  loadDecks: () => Promise<void>;
  remove: (id: string) => void;
  undoRemove: () => void;
  /** Saves to the server, falling back to a device-only copy when it's unreachable. */
  saveDeck: (deckData: DeckData, existingDeckId?: string | null) => Promise<Session>;
};

export const useLibraryStore = create<LibState>()(
  persist(
    (set, get) => {
      const commitDelete = async () => {
        if (deleteTimer) window.clearTimeout(deleteTimer);
        deleteTimer = null;
        const pending = get().pendingDelete;
        if (!pending) return;
        const { session } = pending;
        set({ pendingDelete: null });
        deletedIds.add(session.id);

        const editing = useSessionStore.getState();
        if (editing.activeDeckId === session.id) editing.resetSession();
        const queue = useAudioQueueStore.getState();
        if (queue.sourceKey?.startsWith(`${session.id}:`)) queue.clearQueue();

        const numericId = serverId(session.id);
        if (numericId === null) return;
        try {
          await deleteStudyDeck(numericId);
        } catch (err: any) {
          deletedIds.delete(session.id);
          set((s) => ({
            sessions: [session, ...s.sessions],
            error: `Couldn't delete “${session.title}”: ${err.message}`,
          }));
        }
      };

      return {
        sessions: [],
        filter: "",
        sortBy: "recent",
        loading: false,
        error: null,
        pendingDelete: null,
        setFilter: (filter) => set({ filter }),
        setSort: (sortBy) => set({ sortBy }),

        loadDecks: async () => {
          set({ loading: true });
          let records: StudyDeckRecord[];
          try {
            records = await fetchStudyDecks();
          } catch (err: any) {
            set({
              loading: false,
              error: `Couldn't reach the server (${err.message}). Showing decks saved on this device.`,
            });
            return;
          }
          const local = get().sessions.filter((s) => s.isLocal);
          // A device-only copy of a server deck holds newer edits than the server version.
          const hidden = new Set([...local.map((l) => l.id), ...deletedIds]);
          const pendingId = get().pendingDelete?.session.id;
          if (pendingId) hidden.add(pendingId);
          const server = records.map(recordToSession).filter((s) => !hidden.has(s.id));
          set({ sessions: [...local, ...server], loading: false, error: null });

          // Server is reachable again: upload decks that were only saved on this device.
          for (const l of local) {
            try {
              const id = serverId(l.id);
              const data = sessionToDeckData(l);
              const saved = recordToSession(id !== null ? await updateStudyDeck(id, data) : await createStudyDeck(data));
              set((s) => ({ sessions: s.sessions.map((x) => (x.id === l.id ? saved : x)) }));
              const editing = useSessionStore.getState();
              if (editing.activeDeckId === l.id) {
                editing.setActiveDeckId(saved.id);
                editing.setSaveStatus("saved");
              }
            } catch {
              break;
            }
          }
        },

        remove: (id) => {
          void commitDelete();
          const index = get().sessions.findIndex((s) => s.id === id);
          if (index < 0) return;
          const session = get().sessions[index];
          set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id), pendingDelete: { session, index } }));
          deleteTimer = window.setTimeout(() => void commitDelete(), UNDO_WINDOW_MS);
        },

        undoRemove: () => {
          if (deleteTimer) window.clearTimeout(deleteTimer);
          deleteTimer = null;
          const pending = get().pendingDelete;
          if (!pending) return;
          set((s) => {
            const sessions = [...s.sessions];
            sessions.splice(Math.min(pending.index, sessions.length), 0, pending.session);
            return { sessions, pendingDelete: null };
          });
        },

        saveDeck: async (deckData, existingDeckId) => {
          const numericId = serverId(existingDeckId);
          let session: Session;
          try {
            const saved = numericId !== null ? await updateStudyDeck(numericId, deckData) : await createStudyDeck(deckData);
            session = recordToSession(saved);
          } catch (err: any) {
            console.warn("Backend save failed, keeping a device-only copy:", err.message);
            session = toSession(existingDeckId ?? `local-${Date.now()}`, deckData, true);
          }
          // Replaces the previous entry, including a device-only copy that just got its server id.
          set((s) => ({
            sessions: [session, ...s.sessions.filter((x) => x.id !== session.id && x.id !== existingDeckId)],
          }));
          return session;
        },
      };
    },
    {
      name: "subvocal-local-decks",
      // Only device-only decks live in browser storage; everything else comes from the server.
      partialize: (s) => ({ sessions: s.sessions.filter((x) => x.isLocal) }),
    }
  )
);
