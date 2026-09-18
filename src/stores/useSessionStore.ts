import { create } from "zustand";
import type { Concept, StudyStyle } from "../data/mockData";

type SessionState = {
  activeDeckId: string | number | null;
  fileName: string | null;
  fileMeta: string | null;
  docTitle: string;
  concepts: Concept[];
  style: StudyStyle;
  transcript: string;
  pauseSec: number;
  voiceRate: 0.9 | 1 | 1.15;
  setActiveDeckId: (id: string | number | null) => void;
  setFile: (name: string, meta: string) => void;
  clearFile: () => void;
  setDocTitle: (t: string) => void;
  setConcepts: (c: Concept[]) => void;
  setStyle: (s: StudyStyle) => void;
  updateConcept: (id: string, patch: Partial<Concept>) => void;
  removeConcept: (id: string) => void;
  addConcept: () => void;
  setTranscript: (t: string) => void;
  setPause: (v: number) => void;
  setVoiceRate: (v: 0.9 | 1 | 1.15) => void;
  loadFromSession: (s: { id?: string | number; title: string; fileName: string; style?: StudyStyle; concepts: Concept[]; chunks: { text: string }[] }) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  activeDeckId: null,
  fileName: null,
  fileMeta: null,
  docTitle: "",
  concepts: [],
  style: "primer",
  transcript: "",
  pauseSec: 2.5,
  voiceRate: 1,
  setActiveDeckId: (activeDeckId) => set({ activeDeckId }),
  setFile: (fileName, fileMeta) => set({ fileName, fileMeta }),
  clearFile: () => set({ activeDeckId: null, fileName: null, fileMeta: null, concepts: [], transcript: "" }),
  setDocTitle: (docTitle) => set({ docTitle }),
  setConcepts: (concepts) => set({ concepts }),
  setStyle: (style) => set({ style }),
  updateConcept: (id, patch) => set((s) => ({ concepts: s.concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  removeConcept: (id) => set((s) => ({ concepts: s.concepts.filter((c) => c.id !== id) })),
  addConcept: () => set((s) => ({ concepts: [...s.concepts, { id: `c${Date.now()}`, term: "New Concept", definition: "Add definition here.", reps: 1 as const }] })),
  setTranscript: (transcript) => set({ transcript }),
  setPause: (pauseSec) => set({ pauseSec }),
  setVoiceRate: (voiceRate) => set({ voiceRate }),
  loadFromSession: (sess) =>
    set({
      activeDeckId: sess.id ?? null,
      docTitle: sess.title,
      fileName: sess.fileName,
      fileMeta: sess.fileName.endsWith(".pdf") ? "Slides · Parsed" : "Doc · Parsed",
      style: sess.style || "primer",
      concepts: sess.concepts,
      transcript: sess.chunks.map((c) => c.text).join(" [pause 2.5s] "),
    }),
}));
