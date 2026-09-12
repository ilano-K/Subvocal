import { create } from "zustand";
import { mockConcepts, mockTranscript, type Concept, type StudyMode } from "../data/mockData";

type SessionState = {
  fileName: string | null;
  fileMeta: string | null;
  docTitle: string;
  concepts: Concept[];
  mode: StudyMode;
  transcript: string;
  pauseSec: number;
  voiceRate: 0.9 | 1 | 1.15;
  setFile: (name: string, meta: string) => void;
  clearFile: () => void;
  setDocTitle: (t: string) => void;
  setConcepts: (c: Concept[]) => void;
  updateConcept: (id: string, patch: Partial<Concept>) => void;
  removeConcept: (id: string) => void;
  addConcept: () => void;
  setMode: (m: StudyMode) => void;
  setTranscript: (t: string) => void;
  setPause: (v: number) => void;
  setVoiceRate: (v: 0.9 | 1 | 1.15) => void;
  loadFromSession: (s: { title: string; fileName: string; concepts: Concept[]; mode: StudyMode; chunks: { text: string }[] }) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  fileName: null,
  fileMeta: null,
  docTitle: "",
  concepts: mockConcepts,
  mode: "term-definition",
  transcript: mockTranscript,
  pauseSec: 3.5,
  voiceRate: 1,
  setFile: (fileName, fileMeta) => set({ fileName, fileMeta }),
  clearFile: () => set({ fileName: null, fileMeta: null }),
  setDocTitle: (docTitle) => set({ docTitle }),
  setConcepts: (concepts) => set({ concepts }),
  updateConcept: (id, patch) => set((s) => ({ concepts: s.concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  removeConcept: (id) => set((s) => ({ concepts: s.concepts.filter((c) => c.id !== id) })),
  addConcept: () => set((s) => ({ concepts: [...s.concepts, { id: `c${Date.now()}`, term: "New Concept", definition: "Add definition here.", reps: 1 as const }] })),
  setMode: (mode) => set({ mode }),
  setTranscript: (transcript) => set({ transcript }),
  setPause: (pauseSec) => set({ pauseSec }),
  setVoiceRate: (voiceRate) => set({ voiceRate }),
  loadFromSession: (sess) =>
    set({
      docTitle: sess.title,
      fileName: sess.fileName,
      fileMeta: sess.fileName.endsWith(".pdf") ? "Slides · Parsed" : "Doc · Parsed",
      concepts: sess.concepts,
      mode: sess.mode,
      transcript: sess.chunks.map((c) => c.text).join(" [pause 2.5s] "),
    }),
}));
