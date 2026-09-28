import { create } from "zustand";
import type { Chunk, Concept, Session, StudyStyle } from "../data/mockData";
import { transcriptDiffersFromChunks } from "../utils/script";
import { nearestSpeed } from "../utils/speech";

export type SaveStatus = "idle" | "saving" | "saved" | "offline";

type SessionContent = {
  // Identifies this editing session so autosave can tell decks apart before the first save returns an id.
  sessionKey: string;
  activeDeckId: string | null;
  fileName: string | null;
  fileMeta: string | null;
  documentId: string | null;
  documentEpitome: string | null;
  docTitle: string;
  concepts: Concept[];
  style: StudyStyle;
  // Spoken script shown in the editor, and the playable chunks compiled from it.
  transcript: string;
  chunks: Chunk[];
  estimatedSec: number | null;
  // Transcript was hand-edited since `chunks` were compiled.
  transcriptDirty: boolean;
  // Topics changed since the script was written.
  scriptStale: boolean;
  pauseSec: number;
  voiceRate: number;
};

type SessionState = SessionContent & {
  // Bumped by every change that should be persisted; drives autosave.
  contentRev: number;
  saveStatus: SaveStatus;
  resetSession: () => void;
  loadDeck: (deck: Session) => void;
  setDocument: (doc: {
    fileName: string;
    fileMeta: string;
    documentId: string;
    documentEpitome: string | null;
    concepts: Concept[];
    docTitle?: string;
  }) => void;
  setActiveDeckId: (id: string | null) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setDocTitle: (t: string) => void;
  setStyle: (s: StudyStyle) => void;
  updateConcept: (id: string, patch: Partial<Concept>) => void;
  removeConcept: (id: string) => void;
  addConcept: () => void;
  setTranscript: (t: string) => void;
  setScript: (script: { transcript: string; chunks: Chunk[]; estimatedSec: number | null }) => void;
  setPause: (v: number) => void;
  setVoiceRate: (v: number) => void;
};

const newSessionKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyContent = (): SessionContent => ({
  sessionKey: newSessionKey(),
  activeDeckId: null,
  fileName: null,
  fileMeta: null,
  documentId: null,
  documentEpitome: null,
  docTitle: "",
  concepts: [],
  style: "primer",
  transcript: "",
  chunks: [],
  estimatedSec: null,
  transcriptDirty: false,
  scriptStale: false,
  pauseSec: 2.5,
  voiceRate: 1,
});

export const useSessionStore = create<SessionState>((set) => {
  // Applies a content change and schedules it for autosave.
  const edit = (fn: (s: SessionState) => Partial<SessionState>) =>
    set((s) => ({ ...fn(s), contentRev: s.contentRev + 1 }));

  return {
    ...emptyContent(),
    contentRev: 0,
    saveStatus: "idle",

    resetSession: () => set({ ...emptyContent(), saveStatus: "idle" }),
    loadDeck: (deck) => {
      const transcript = deck.transcript || deck.chunks.map((c) => c.text).join("\n\n[pause 2.5s]\n\n");
      set({
        ...emptyContent(),
        activeDeckId: deck.id,
        fileName: deck.fileName,
        fileMeta: deck.isLocal ? "Saved on this device" : "Saved in your library",
        docTitle: deck.title,
        concepts: deck.concepts,
        style: deck.style || "primer",
        transcript,
        chunks: deck.chunks,
        estimatedSec: deck.chunks.length ? deck.estimatedSec : null,
        transcriptDirty: deck.chunks.length > 0 && transcriptDiffersFromChunks(transcript, deck.chunks),
        pauseSec: deck.pauseSec,
        voiceRate: nearestSpeed(deck.voiceRate),
        saveStatus: deck.isLocal ? "offline" : "saved",
      });
    },
    setDocument: ({ docTitle, ...doc }) =>
      edit((s) => ({
        ...doc,
        docTitle: docTitle ?? s.docTitle,
        transcript: "",
        chunks: [],
        estimatedSec: null,
        transcriptDirty: false,
        scriptStale: false,
      })),
    setActiveDeckId: (activeDeckId) => set({ activeDeckId }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setDocTitle: (docTitle) => edit(() => ({ docTitle })),
    setStyle: (style) => edit(() => ({ style })),
    updateConcept: (id, patch) =>
      edit((s) => ({
        concepts: s.concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        // Repeat counts don't change what the script says, so they don't make it stale.
        scriptStale: s.scriptStale || (s.chunks.length > 0 && ("term" in patch || "definition" in patch)),
      })),
    removeConcept: (id) =>
      edit((s) => ({ concepts: s.concepts.filter((c) => c.id !== id), scriptStale: s.chunks.length > 0 })),
    addConcept: () =>
      edit((s) => ({
        concepts: [...s.concepts, { id: `c${Date.now()}`, term: "New topic", definition: "Add an explanation here.", reps: 1 as const }],
        scriptStale: s.chunks.length > 0,
      })),
    setTranscript: (transcript) => edit(() => ({ transcript, transcriptDirty: true })),
    setScript: ({ transcript, chunks, estimatedSec }) =>
      edit(() => ({ transcript, chunks, estimatedSec, transcriptDirty: false, scriptStale: false })),
    setPause: (pauseSec) => edit(() => ({ pauseSec })),
    setVoiceRate: (voiceRate) =>
      edit((s) => ({
        voiceRate,
        // The estimate was computed at the previous speed; rescale rather than recompile.
        estimatedSec: s.estimatedSec === null ? null : (s.estimatedSec * s.voiceRate) / voiceRate,
      })),
  };
});
