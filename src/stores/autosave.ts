import { useSessionStore } from "./useSessionStore";
import { useLibraryStore, wasDeleted, type DeckData } from "./useLibraryStore";
import { roughEstimateSec } from "../utils/script";

const DEBOUNCE_MS = 1000;

type Snapshot = { sessionKey: string; deckId: string | null; data: DeckData };

// Latest unsaved content per editing session; captured at edit time so switching decks can't mix them up.
const pending = new Map<string, Snapshot>();
// Deck ids created for sessions whose snapshots were taken before the create returned.
const createdIds = new Map<string, string>();
let timer: number | null = null;
let running: Promise<void> | null = null;

function snapshot(s: ReturnType<typeof useSessionStore.getState>): Snapshot {
  return {
    sessionKey: s.sessionKey,
    deckId: s.activeDeckId,
    data: {
      filename: s.fileName ?? "Untitled",
      deckTitle: s.docTitle.trim() || "Untitled audio",
      pauseSec: s.pauseSec,
      voiceRate: s.voiceRate,
      estimatedSec: s.estimatedSec ?? roughEstimateSec(s.concepts, s.voiceRate),
      transcript: s.transcript,
      style: s.style,
      chunks: s.chunks,
      concepts: s.concepts,
    },
  };
}

async function saveBatch() {
  const batch = [...pending.values()];
  pending.clear();
  for (const snap of batch) {
    const id = snap.deckId ?? createdIds.get(snap.sessionKey) ?? null;
    if (id && wasDeleted(id)) continue;
    const saved = await useLibraryStore.getState().saveDeck(snap.data, id);
    createdIds.set(snap.sessionKey, saved.id);

    const s = useSessionStore.getState();
    if (s.sessionKey !== snap.sessionKey) continue;
    if (s.activeDeckId !== saved.id) s.setActiveDeckId(saved.id);
    if (!pending.has(snap.sessionKey)) s.setSaveStatus(saved.isLocal ? "offline" : "saved");
  }
}

/** Saves all pending edits now. Resolves once everything queued so far is written. */
export async function flushAutosave(): Promise<void> {
  if (timer) window.clearTimeout(timer);
  timer = null;
  while (running) await running;
  if (!pending.size) return;
  running = saveBatch();
  try {
    await running;
  } finally {
    running = null;
  }
  if (pending.size) await flushAutosave();
}

/** Persists the open deck shortly after every content change. Returns an unsubscribe function. */
export function startAutosave(): () => void {
  return useSessionStore.subscribe((s, prev) => {
    if (s.contentRev === prev.contentRev || !s.fileName) return;
    pending.set(s.sessionKey, snapshot(s));
    if (s.saveStatus !== "saving") s.setSaveStatus("saving");
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => void flushAutosave(), DEBOUNCE_MS);
  });
}
