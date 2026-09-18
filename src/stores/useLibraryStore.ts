import { create } from "zustand";
import type { Session, StudyStyle } from "../data/mockData";
import {
  fetchStudyDecks,
  createStudyDeck,
  updateStudyDeck,
  deleteStudyDeck,
  type StudyDeckRecord,
} from "../services/api";

function formatDurationLabel(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return `${min} min`;
}

function deckRecordToSession(record: StudyDeckRecord): Session {
  return {
    id: String(record.id),
    title: record.deckTitle,
    fileName: record.filename,
    style: (record.style as StudyStyle) || "primer",
    chunks: record.chunks.map((c) => ({
      id: c.id,
      conceptId: c.conceptId,
      title: c.title,
      text: c.text,
      reps: c.reps,
    })),
    concepts: record.concepts.map((c) => ({
      id: c.id,
      term: c.term,
      definition: c.definition,
      reps: (c.reps as 1 | 2 | 3) || 1,
    })),
    durationLabel: formatDurationLabel(record.estimatedSec),
    lastStudied: "Saved",
    chunkCount: record.chunks.length,
  };
}

type LibState = {
  sessions: Session[];
  filter: string;
  sortBy: "recent" | "duration" | "chunks";
  loading: boolean;
  error: string | null;
  setFilter: (v: string) => void;
  setSort: (v: LibState["sortBy"]) => void;
  loadDecks: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  add: (s: Session) => void;
  saveDeck: (
    deckData: {
      filename: string;
      deckTitle: string;
      pauseSec: number;
      voiceRate: number;
      estimatedSec: number;
      transcript: string;
      style?: string;
      chunks: { id: string; conceptId: string; title: string; text: string; reps: number }[];
      concepts: { id: string; term: string; definition: string; reps: number }[];
    },
    existingDeckId?: string | number | null
  ) => Promise<Session>;
  upsert: (s: Session) => void;
};

export const useLibraryStore = create<LibState>((set) => ({
  sessions: [],
  filter: "",
  sortBy: "recent",
  loading: false,
  error: null,
  setFilter: (filter) => set({ filter }),
  setSort: (sortBy) => set({ sortBy }),

  loadDecks: async () => {
    set({ loading: true, error: null });
    try {
      const records = await fetchStudyDecks();
      const backendSessions = records.map(deckRecordToSession);
      set({ sessions: backendSessions, loading: false });
    } catch (err: any) {
      console.warn("Could not load decks from backend:", err.message);
      set({ loading: false });
    }
  },

  remove: async (id: string) => {
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
    const numericId = parseInt(id, 10);
    if (!isNaN(numericId)) {
      try {
        await deleteStudyDeck(numericId);
      } catch (err: any) {
        console.warn("Could not delete deck on backend:", err.message);
      }
    }
  },

  add: (sess) => set((s) => ({ sessions: [sess, ...s.sessions] })),

  saveDeck: async (deckData, existingDeckId) => {
    const numericId = existingDeckId ? parseInt(String(existingDeckId), 10) : NaN;
    try {
      let saved: StudyDeckRecord;
      if (!isNaN(numericId)) {
        saved = await updateStudyDeck(numericId, deckData);
      } else {
        saved = await createStudyDeck(deckData);
      }
      const session = deckRecordToSession(saved);
      set((s) => ({
        sessions: [session, ...s.sessions.filter((x) => x.id !== session.id)],
      }));
      return session;
    } catch (err: any) {
      console.warn("Backend save/update failed, saving to local store:", err.message);
      const localId = existingDeckId ? String(existingDeckId) : `local-${Date.now()}`;
      const localSession: Session = {
        id: localId,
        title: deckData.deckTitle,
        fileName: deckData.filename,
        style: (deckData.style as StudyStyle) || "primer",
        chunks: deckData.chunks,
        concepts: deckData.concepts.map((c) => ({
          ...c,
          reps: (c.reps as 1 | 2 | 3) || 1,
        })),
        durationLabel: formatDurationLabel(deckData.estimatedSec),
        lastStudied: "Just now",
        chunkCount: deckData.chunks.length,
      };
      set((s) => ({
        sessions: [localSession, ...s.sessions.filter((x) => x.id !== localId)],
      }));
      return localSession;
    }
  },

  upsert: (sess) =>
    set((s) => ({
      sessions: [sess, ...s.sessions.filter((x) => x.id !== sess.id)],
    })),
}));
