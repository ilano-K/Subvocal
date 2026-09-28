import type { Chunk, Concept } from "../data/mockData";

const PAUSE_TOKEN_RE = /\[pause(?:\s+[0-9.]*s?)?\]/gi;

function normalizeSpoken(text: string): string {
  return text.replace(PAUSE_TOKEN_RE, " ").replace(/\s+/g, " ").trim();
}

/** True when the transcript no longer says what the compiled chunks say (i.e. it was hand-edited). */
export function transcriptDiffersFromChunks(transcript: string, chunks: Chunk[]): boolean {
  return normalizeSpoken(transcript) !== normalizeSpoken(chunks.map((c) => c.text).join(" "));
}

/**
 * Identifies a playable queue: the deck it belongs to plus a hash of what will be spoken.
 * Two plays of identical content resume instead of restarting; any edit produces a new key.
 */
export function queueKey(deckId: string | null, chunks: Chunk[]): string {
  let h = 5381;
  for (const c of chunks) {
    const s = `${c.text}\u0000${c.reps}\u0001`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${deckId ?? "draft"}:${(h >>> 0).toString(36)}`;
}

/** Topic list read out verbatim, without AI analogies. */
export function plainChunks(concepts: Concept[]): Chunk[] {
  return concepts.map((c, i) => ({
    id: `plain-${i}`,
    conceptId: c.id,
    title: c.term,
    text: `${c.term}. ${c.definition}`,
    reps: c.reps,
  }));
}

/** Rough listening time before a script exists. */
export function roughEstimateSec(concepts: Concept[], rate = 1): number {
  return (concepts.length * 20 + concepts.reduce((a, c) => a + (c.reps - 1) * 8, 0)) / rate;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
