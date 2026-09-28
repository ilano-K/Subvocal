import { useState, useRef } from "react";
import { useSessionStore, type SaveStatus } from "../stores/useSessionStore";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { parseDocument, extractConcepts, compileScript, flattenModule } from "../services/api";
import type { Chunk, StudyStyle } from "../data/mockData";
import { formatDuration, plainChunks, queueKey, roughEstimateSec } from "../utils/script";
import { NARRATION_SPEEDS } from "../utils/speech";

type StyleCard = {
  id: StudyStyle;
  label: string;
  sub: string;
  desc: string;
  icon: string;
  available: boolean;
};

const studyStyles: StyleCard[] = [
  {
    id: "primer",
    label: "Primer Audio",
    sub: "Passive First Exposure",
    desc: "Seamless audiobook flow with intuitive 'Think of it like this' analogies. Ideal for walking and commuting.",
    icon: "menu_book",
    available: true,
  },
  {
    id: "active-recall",
    label: "Active Recall",
    sub: "Interactive Flashcards",
    desc: "Two-part prompt with silent thinking countdown and benchmark answers.",
    icon: "quiz",
    available: false,
  },
  {
    id: "chunking-breakdown",
    label: "Chunking & Acronyms",
    sub: "Auditory Mental Maps",
    desc: "Breaks down enumerated lists and sub-rules with letter-by-letter phonetic anchoring.",
    icon: "format_list_numbered",
    available: false,
  },
  {
    id: "feynman",
    label: "Feynman Self-Explanation",
    sub: "Plain-English Teacher",
    desc: "Teaches concepts out loud without jargon with 2-3 keyword self-checks.",
    icon: "school",
    available: false,
  },
];

const saveLabels: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "All changes saved",
  offline: "Saved on this device only — server unreachable",
};

const uploadSteps = [
  { label: "Reading your file", hint: "Extracting the text and layout" },
  { label: "Finding the key study topics", hint: "The AI is reading your content — this can take a minute" },
];

function UploadProgress({ fileName, step }: { fileName: string; step: number }) {
  const current = uploadSteps[step];
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-6 gap-4 text-center">
      <span className="w-10 h-10 border-[3px] border-[#EA580C] border-t-transparent rounded-full animate-spin" />
      <div>
        <div className="font-serif text-[#1C1513] dark:text-[#f3ece7] text-base font-medium">{current.label}…</div>
        <div className="font-mono text-xs text-[#706159] dark:text-[#a78b7d] mt-1">{current.hint}</div>
      </div>
      <ol className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 font-mono text-[11px]">
        {uploadSteps.map((s, i) => (
          <li
            key={s.label}
            className={`flex items-center gap-1.5 ${
              i < step
                ? "text-[#706159] dark:text-[#a78b7d]"
                : i === step
                ? "text-[#C2410C] dark:text-[#f97316] font-semibold"
                : "text-[#9C8C84] dark:text-[#6e5e55]"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {i < step ? "check_circle" : i === step ? "radio_button_checked" : "radio_button_unchecked"}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      <div className="font-mono text-[10px] text-[#8D7168] truncate max-w-[320px]">{fileName}</div>
    </div>
  );
}

type WorkspaceError = {
  title: string;
  message: string;
  retry?: () => void;
  // Offer to play the raw topic list when the script can't be written.
  offerPlain?: boolean;
};

// Compiling an edited transcript re-splits it on pause markers; keep titles and repeats when the split lines up.
const carryOver = (prev: Chunk[], next: Chunk[]) =>
  next.length === prev.length ? next.map((c, i) => ({ ...c, title: prev[i].title, reps: prev[i].reps })) : next;

type Props = {
  onOpenLibrary?: () => void;
};

export default function StudyWorkspace({ onOpenLibrary }: Props) {
  const {
    activeDeckId,
    fileName,
    fileMeta,
    docTitle,
    concepts,
    style,
    setStyle,
    transcript,
    chunks,
    estimatedSec,
    transcriptDirty,
    scriptStale,
    pauseSec,
    voiceRate,
    saveStatus,
    resetSession,
    setDocument,
    setDocTitle,
    updateConcept,
    removeConcept,
    addConcept,
    setTranscript,
    setScript,
    setPause,
    setVoiceRate,
  } = useSessionStore();
  const playQueue = useAudioQueueStore((s) => s.play);

  const [dragOver, setDragOver] = useState(false);
  // Index into uploadSteps while a file is being processed.
  const [parseStep, setParseStep] = useState<number | null>(null);
  const parsing = parseStep !== null;
  const [scriptBusy, setScriptBusy] = useState<null | "write" | "start">(null);
  const [error, setError] = useState<WorkspaceError | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The next file picked replaces the open deck's file instead of starting a new deck.
  const replaceOnPick = useRef(false);

  const pickFile = (replace: boolean) => {
    replaceOnPick.current = replace;
    fileInputRef.current?.click();
  };

  const handleFile = async (f: File | undefined, { rescan = false } = {}) => {
    if (!f) return;
    setCurrentFile(f);
    setError(null);
    setParseStep(0);
    try {
      const parseRes = await parseDocument(f);
      setParseStep(1);
      const conceptRes = await extractConcepts(parseRes.document_id);
      const parsed = (conceptRes.modules ?? []).map((m, i) => {
        const { term, definition } = flattenModule(m);
        return { id: m.id || `c${i + 1}`, term, definition, reps: 1 as const };
      });
      if (parsed.length === 0) throw new Error("No study topics were found in this document.");

      // Only a fully processed file touches the session, so a failure leaves the open deck intact.
      if (!rescan) resetSession();
      setDocument({
        fileName: f.name,
        fileMeta: `${(f.size / 1024 / 1024).toFixed(1)} MB • ${parseRes.page_count} pages`,
        documentId: parseRes.document_id,
        documentEpitome: conceptRes.document_epitome || null,
        concepts: parsed,
        docTitle: rescan ? undefined : f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
      });
    } catch (err: any) {
      console.error("Backend parsing or extraction failed:", err);
      setError({
        title: `Couldn't process ${f.name}`,
        message: err.message || "Unknown error",
        retry: () => handleFile(f, { rescan }),
      });
    } finally {
      setParseStep(null);
    }
  };

  const compile = (transcriptOverride?: string) => {
    const s = useSessionStore.getState();
    return compileScript({
      deckTitle: s.docTitle || "Untitled audio",
      concepts: s.concepts.map(({ id, term, definition, reps }) => ({ id, term, definition, reps })),
      pauseSec: s.pauseSec,
      voiceRate: s.voiceRate,
      transcriptOverride,
      documentId: s.documentId ?? undefined,
      documentEpitome: s.documentEpitome ?? undefined,
    });
  };

  const playChunks = (list: Chunk[]) => {
    const s = useSessionStore.getState();
    playQueue(list, { sourceKey: queueKey(s.activeDeckId, list), rate: s.voiceRate, pauseSec: s.pauseSec });
  };

  const writeScript = async () => {
    if (useSessionStore.getState().transcriptDirty && !confirmRegen) {
      setConfirmRegen(true);
      window.setTimeout(() => setConfirmRegen(false), 4000);
      return;
    }
    setConfirmRegen(false);
    setError(null);
    setScriptBusy("write");
    try {
      const res = await compile();
      setScript({ transcript: res.transcript, chunks: res.chunks, estimatedSec: res.estimatedSec });
    } catch (err: any) {
      console.warn("Script generation failed:", err);
      setError({ title: "Couldn't write the audio script", message: err.message || "Unknown error", retry: writeScript });
    } finally {
      setScriptBusy(null);
    }
  };

  const startListening = async () => {
    setError(null);
    const s = useSessionStore.getState();
    if (s.chunks.length > 0 && !s.transcriptDirty) {
      playChunks(s.chunks);
      return;
    }
    setScriptBusy("start");
    try {
      // Hand-edited script: compile exactly what's in the editor. No script yet: have the AI write it.
      const override = s.transcript.trim() ? s.transcript : undefined;
      const res = await compile(override);
      const compiled = override ? carryOver(s.chunks, res.chunks) : res.chunks;
      setScript({ transcript: res.transcript, chunks: compiled, estimatedSec: res.estimatedSec });
      playChunks(compiled);
    } catch (err: any) {
      console.warn("Script compilation failed:", err);
      setError({
        title: "Couldn't prepare the audio",
        message: err.message || "Unknown error",
        retry: startListening,
        offerPlain: true,
      });
    } finally {
      setScriptBusy(null);
    }
  };

  // Settings changes apply live when this deck is what's currently loaded in the player.
  const syncQueue = (patch: { rate?: number; pauseSec?: number }) => {
    const q = useAudioQueueStore.getState();
    if (q.sourceKey !== queueKey(activeDeckId, chunks)) return;
    if (patch.rate !== undefined) q.setRate(patch.rate);
    if (patch.pauseSec !== undefined) q.setPause(patch.pauseSec);
  };

  const hasScript = chunks.length > 0;
  const writingFromScratch = scriptBusy === "write" || (scriptBusy === "start" && !transcript.trim());
  const estLabel =
    hasScript && estimatedSec != null ? formatDuration(estimatedSec) : `≈ ${formatDuration(roughEstimateSec(concepts, voiceRate))}`;
  const scriptState = !hasScript
    ? transcript.trim()
      ? { label: "Edited", tone: "warn" }
      : { label: "Not written yet", tone: "muted" }
    : scriptStale
    ? { label: "Out of date", tone: "warn" }
    : transcriptDirty
    ? { label: "Edited", tone: "warn" }
    : { label: "Ready", tone: "ok" };

  return (
    <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 py-7 flex flex-col gap-7">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx,.txt,.md"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0], { rescan: replaceOnPick.current });
          replaceOnPick.current = false;
          // Allow picking the same file again after a failure.
          e.target.value = "";
        }}
      />

      {/* 1. Source Material */}
      <section className="w-full bg-white dark:bg-[#221e1b] rounded-xl p-5 sm:p-6 border border-[#E5DDD2] dark:border-[#2d2723] shadow-sm relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-[#C2410C]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#FFECE7] border border-[#C2410C]/30 grid place-items-center text-[#C2410C]">
              <span className="material-symbols-outlined text-base">upload_file</span>
            </div>
            <h2 className="font-serif italic text-lg sm:text-xl">1 · Upload your notes</h2>
            {fileName && (
              <span className="font-mono text-[10px] bg-[#C2410C] text-white px-2 py-0.5 rounded font-bold uppercase">
                {concepts.length} topics found
              </span>
            )}
          </div>
          {fileName && (
            <span className="hidden sm:inline font-mono text-[11px] text-[#706159]">
              Passive audio review with grounded real-world analogies
            </span>
          )}
        </div>

        {!fileName ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!parsing) handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`rounded-lg p-8 border-2 border-dashed flex flex-col items-center text-center transition-colors ${
              dragOver
                ? "border-[#C2410C] dark:border-[#f97316] bg-[#FFF7ED] dark:bg-[#1a1715]"
                : "border-[#E5DDD2] dark:border-[#352e29] bg-[#FFFBF6]/60 dark:bg-[#1a1714]/80 hover:border-[#E5DDD2] dark:hover:border-[#352e29]"
            }`}
          >
            {parsing ? (
              <UploadProgress fileName={currentFile?.name ?? ""} step={parseStep} />
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-[#FFF1EC] dark:bg-[#1e1b19] border border-[#E5DDD2] dark:border-[#352e29] grid place-items-center text-[#C2410C] dark:text-[#f97316] mb-3">
                  <span className="material-symbols-outlined text-[26px]">upload_file</span>
                </div>
                <div className="font-serif text-stone-900 dark:text-[#f3ece7] text-base mb-1">
                  Drop your files here
                </div>
                <div className="font-mono text-xs text-stone-500 dark:text-[#a78b7d] mb-4">
                  PDF, Word, or PowerPoint — or browse your computer
                </div>
                <button
                  onClick={() => pickFile(false)}
                  className="px-4 py-1.5 rounded-lg bg-white dark:bg-[#1a1715] border border-[#E2D8CC] dark:border-[#352e29] text-xs font-semibold shadow-sm hover:bg-stone-50 dark:hover:bg-[#25201d] dark:text-[#e0c0b1] flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#C2410C]">add</span>
                  Choose file
                </button>
                <div className="flex flex-wrap gap-1.5 mt-5 justify-center">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#1e1b19] border border-stone-200 dark:border-[#352e29] dark:text-[#e0c0b1]">
                    PDF
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#1e1b19] border border-stone-200 dark:border-[#352e29] dark:text-[#e0c0b1]">
                    DOCX
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#1e1b19] border border-stone-200 dark:border-[#352e29] dark:text-[#e0c0b1]">
                    PPTX
                  </span>
                  <span className="text-[11px] text-stone-400 dark:text-[#8d7168] ml-1">
                    · Up to 50 MB per file
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-[#F7F3EE]/60 dark:bg-[#1b1816]/60 rounded-lg p-4 sm:p-5 border border-[#E5DDD2] dark:border-[#2d2723] flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-b from-[#FFECE7] to-white border border-[#C2410C]/30 grid place-items-center text-[#C2410C] shrink-0">
                  <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                </div>
                <div>
                  <div className="font-medium text-[#1C1513] text-sm truncate max-w-[280px]">
                    {fileName}
                  </div>
                  <div className="font-mono text-[11px] text-[#706159]">{fileMeta}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => (currentFile ? handleFile(currentFile, { rescan: true }) : pickFile(true))}
                  disabled={parsing}
                  title="Extract topics again — replaces the current topics and script"
                  className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] dark:text-[#e0c0b1] flex items-center gap-1.5 hover:bg-[#F7F3EE] dark:hover:bg-[#25201d] transition disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm text-[#C2410C]">refresh</span>
                  {currentFile ? "Re-scan file" : "Replace file"}
                </button>
                <button
                  onClick={() => {
                    resetSession();
                    setCurrentFile(null);
                    setError(null);
                  }}
                  disabled={parsing}
                  title="Close this audio — it stays in your library"
                  className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] dark:text-[#e0c0b1] flex items-center gap-1.5 hover:bg-[#F7F3EE] dark:hover:bg-[#25201d] transition disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm text-[#C2410C]">add</span>
                  Start new
                </button>
              </div>
            </div>
            {parsing ? (
              <div className="pt-3 border-t border-[#E5DDD2]/60 dark:border-[#2d2723]">
                <UploadProgress fileName={currentFile?.name ?? ""} step={parseStep} />
              </div>
            ) : (
            <div className="pt-3 border-t border-[#E5DDD2]/60 dark:border-[#2d2723] flex items-center gap-2">
                <>
                  <span className="material-symbols-outlined text-[#C2410C] text-base">
                    check_circle
                  </span>
                  <span className="font-mono text-[11px] font-semibold dark:text-[#e0c0b1]">
                    {concepts.length} key topics
                  </span>
                  <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d]">
                    · Formatted for screen-free auditory learning
                  </span>
                </>
            </div>
            )}
            <div className="flex flex-col gap-1 pt-2">
              <label htmlFor="audio-title" className="font-mono text-xs font-medium text-[#2B211E] dark:text-[#e0c0b1]">
                Audio title
              </label>
              <input
                id="audio-title"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Give your audio a title"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141211] border border-[#E5DDD2] dark:border-[#352e29] text-sm focus:outline-none focus:ring-2 focus:ring-[#C2410C]/20 focus:border-[#C2410C] dark:focus:border-[#f97316] dark:text-[#e9e1dd] placeholder:text-[#9C8C84]"
              />
            </div>
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="w-full rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <span className="material-symbols-outlined text-rose-600 dark:text-rose-300">error</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-rose-900 dark:text-rose-200">{error.title}</div>
            <div className="font-mono text-[11px] text-rose-800/80 dark:text-rose-300/80 break-words">{error.message}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {error.retry && (
              <button
                onClick={error.retry}
                className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950/50"
              >
                Try again
              </button>
            )}
            {error.offerPlain && (
              <button
                onClick={() => {
                  setError(null);
                  const list = plainChunks(useSessionStore.getState().concepts);
                  playQueue(list, { sourceKey: queueKey(activeDeckId, list), rate: voiceRate, pauseSec });
                }}
                className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] text-[#2B211E] dark:text-[#e0c0b1] hover:bg-[#F7F3EE] dark:hover:bg-[#25201d]"
              >
                Play topics without analogies
              </button>
            )}
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss"
              className="w-7 h-7 grid place-items-center rounded text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {fileName && !parsing && (
        <>
          {/* 2. Key Concepts */}
          <section className="w-full bg-white dark:bg-[#221e1b] rounded-xl p-5 sm:p-6 border border-[#E5DDD2] dark:border-[#2d2723] shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E5DDD2] dark:border-[#2d2723] gap-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#FFECE7] border border-[#C2410C]/30 grid place-items-center text-[#C2410C]">
                  <span className="material-symbols-outlined text-base">psychology</span>
                </div>
                <h2 className="font-serif italic text-lg sm:text-xl">2 · What to learn</h2>
                <span className="font-mono text-[10px] bg-[#C2410C] text-white px-2.5 py-0.5 rounded font-bold uppercase">
                  {concepts.length} topics
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addConcept}
                  className="font-mono text-[11px] px-3 py-1.5 rounded-lg bg-white dark:bg-[#1e1b19] hover:bg-[#FFECE7] dark:hover:bg-[#1a1715] text-[#706159] dark:text-[#a78b7d] hover:text-[#7C2D12] dark:hover:text-[#ffb690] border border-[#E2D8CC] dark:border-[#352e29] flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">add</span>Add topic
                </button>
              </div>
            </div>

            {concepts.length === 0 && (
              <div className="py-8 text-center font-mono text-xs text-[#706159] dark:text-[#a78b7d]">
                No topics left. Add one above, or re-scan the file to extract them again.
              </div>
            )}

            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
              {concepts.map((c, idx) => (
                <article
                  key={c.id}
                  className={`p-3.5 sm:p-4 rounded-lg border flex flex-col md:flex-row md:items-center gap-3.5 ${
                    idx === 0
                      ? "concept-highlight bg-[#F7F3EE]/70 border-[#C2410C] shadow-sm"
                      : "concept-muted bg-white border-[#E5DDD2] hover:border-[#E5DDD2]"
                  }`}
                >
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`w-6 font-mono text-[11px] text-center py-1 rounded border ${
                        idx === 0
                          ? "bg-[#FFECE7] dark:bg-[#341d13] text-[#7C2D12] dark:text-[#ffb690] border-[#C2410C] dark:border-[#f97316] font-bold"
                          : "text-[#706159] dark:text-[#a78b7d] border-[#E2D8CC] dark:border-[#352e29] dark:bg-[#141211]"
                      }`}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`w-1.5 h-10 rounded-full ${
                        idx === 0
                          ? "bg-gradient-to-b from-[#EA580C] via-[#C2410C] to-[#D97706] shadow-[0_0_6px_rgba(194,65,12,0.4)]"
                          : "bg-stone-200 dark:bg-[#2d2723]"
                      }`}
                    />
                  </div>
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                    <div className="lg:col-span-4 flex flex-col">
                      <label
                        className={`font-mono text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5 font-medium ${
                          idx === 0 ? "text-[#C2410C] dark:text-[#ffb690]" : "text-[#706159] dark:text-[#a78b7d]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            idx === 0 ? "bg-[#C2410C]" : "bg-stone-300 dark:bg-[#352e29]"
                          }`}
                        />
                        Topic
                      </label>
                      <input
                        value={c.term}
                        onChange={(e) => updateConcept(c.id, { term: e.target.value })}
                        className="no-orange-focus font-serif italic text-[15px] bg-white dark:bg-[#141211] px-3 py-1.5 rounded border border-[#E5DDD2] dark:border-[#352e29] focus:!border-[#E5DDD2] dark:focus:!border-[#352e29] focus:ring-0 focus:outline-none w-full font-medium dark:text-[#e9e1dd]"
                      />
                    </div>
                    <div className="lg:col-span-8 flex flex-col">
                      <label className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase tracking-wider mb-1">
                        Explanation
                      </label>
                      <textarea
                        value={c.definition}
                        onChange={(e) => updateConcept(c.id, { definition: e.target.value })}
                        rows={2}
                        className="no-orange-focus font-sans text-[13px] bg-white dark:bg-[#141211] px-3 py-1.5 rounded border border-[#E5DDD2] dark:border-[#352e29] focus:!border-[#E5DDD2] dark:focus:!border-[#352e29] focus:ring-0 focus:outline-none w-full resize-none leading-relaxed dark:text-[#e9e1dd]"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#E5DDD2]/60 dark:border-[#2d2723]">
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase mb-1">
                        Repeat
                      </span>
                      <div className="flex items-center bg-white dark:bg-[#141211] rounded-md p-0.5 border border-[#E5DDD2] dark:border-[#352e29]">
                        {[1, 2, 3].map((n) => (
                          <button
                            key={n}
                            onClick={() => updateConcept(c.id, { reps: n as 1 | 2 | 3 })}
                            className={`font-mono text-[10px] px-2.5 py-1 rounded ${
                              c.reps === n
                                ? "bg-[#C2410C] text-white font-bold shadow-xs"
                                : "text-[#706159] dark:text-[#a78b7d] hover:text-[#1C1513] dark:hover:text-[#f3ece7]"
                            }`}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => removeConcept(c.id)}
                      className="w-8 h-8 rounded bg-white dark:bg-[#1a1715] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[#8D7168] dark:text-[#8d7168] hover:text-rose-600 border border-[#E5DDD2] dark:border-[#352e29] grid place-items-center"
                      title="Remove topic"
                      aria-label={`Remove topic ${c.term}`}
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {concepts.length > 0 && (
          /* 3. Audio Narration Studio */
          <section className="w-full bg-white dark:bg-[#221e1b] rounded-xl p-5 sm:p-6 border border-[#E5DDD2] dark:border-[#2d2723] shadow-sm flex flex-col gap-6">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#E5DDD2] dark:border-[#2d2723]">
              <div className="w-7 h-7 rounded-lg bg-[#FFECE7] border border-[#C2410C]/30 grid place-items-center text-[#C2410C]">
                <span className="material-symbols-outlined text-base">tune</span>
              </div>
              <h2 className="font-serif italic text-lg sm:text-xl">3 · Choose Study Style</h2>
            </div>

            {/* Study Style Cards Grid */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#706159] dark:text-[#a78b7d] font-semibold">
                  Available Formats
                </span>
                <span className="font-mono text-[10px] text-[#C2410C] bg-[#FFECE7] px-2 py-0.5 rounded border border-[#C2410C]/20">
                  Primer Mode Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {studyStyles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (s.available) {
                        setStyle(s.id);
                      }
                    }}
                    className={`text-left p-3.5 rounded-xl border flex flex-col justify-between transition-all relative ${
                      s.available
                        ? style === s.id
                          ? "bg-[#FFF7ED] dark:bg-[#2A221C] border-[#EA580C] dark:border-[#F97316] shadow-sm ring-1 ring-[#EA580C]/20"
                          : "bg-white dark:bg-[#1a1715] border-[#E5DDD2] dark:border-[#352e29] hover:border-[#EA580C]"
                        : "bg-[#F7F3EE]/50 dark:bg-[#141211]/50 border-dashed border-[#E5DDD2] dark:border-[#2d2723] opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`material-symbols-outlined text-[20px] ${s.available ? "text-[#C2410C] dark:text-[#f97316]" : "text-[#8D7168]"}`}>
                          {s.icon}
                        </span>
                        {s.available ? (
                          <span className="font-mono text-[9px] uppercase font-bold bg-[#C2410C] text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        ) : (
                          <span className="font-mono text-[9px] uppercase font-medium bg-[#E5DDD2] dark:bg-[#2d2723] text-[#706159] dark:text-[#a78b7d] px-1.5 py-0.5 rounded">
                            Coming Soon
                          </span>
                        )}
                      </div>
                      <div className="font-serif font-semibold text-sm text-[#1C1513] dark:text-[#f3ece7]">
                        {s.label}
                      </div>
                      <div className="font-mono text-[10px] text-[#C2410C] dark:text-[#f97316] mb-1.5">
                        {s.sub}
                      </div>
                      <p className="text-[11px] text-[#706159] dark:text-[#a78b7d] leading-snug">
                        {s.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Script */}
            <div className="flex flex-col gap-2.5 bg-[#F7F3EE]/70 dark:bg-[#1b1816] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#2d2723]">
              <div className="flex items-center justify-between gap-3 font-mono text-[11px] font-semibold dark:text-[#e0c0b1]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="material-symbols-outlined text-base text-[#C2410C]">
                    record_voice_over
                  </span>
                  <span>Primer audio script</span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                      scriptState.tone === "ok"
                        ? "text-[#9B2F00] dark:text-[#ffb690] bg-[#FFECE7] dark:bg-[#341d13] border-[#C2410C]/30"
                        : scriptState.tone === "warn"
                        ? "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-500/40"
                        : "text-[#706159] dark:text-[#a78b7d] bg-white dark:bg-[#141211] border-[#E2D8CC] dark:border-[#352e29]"
                    }`}
                  >
                    {scriptState.label}
                  </span>
                </div>
                <button
                  onClick={writeScript}
                  disabled={scriptBusy !== null}
                  className={`px-2.5 py-1 rounded border text-[11px] font-mono flex items-center gap-1.5 transition disabled:opacity-50 shrink-0 ${
                    confirmRegen
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400 text-amber-900 dark:text-amber-200"
                      : "bg-white dark:bg-[#1e1b19] border-[#E2D8CC] dark:border-[#352e29] hover:bg-[#FFECE7] dark:hover:bg-[#25201d] text-[#C2410C] dark:text-[#f97316]"
                  }`}
                  title="Have the AI write the spoken Primer script with analogies"
                >
                  {scriptBusy === "write" ? (
                    <>
                      <span className="w-3 h-3 border-2 border-[#C2410C] border-t-transparent rounded-full animate-spin" />
                      <span>Writing…</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                      <span>
                        {confirmRegen ? "Replace your edits? Click again" : hasScript || transcript.trim() ? "Regenerate script" : "Write script"}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {scriptStale && hasScript && !writingFromScratch && (
                <div className="flex items-center gap-2 font-mono text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 rounded px-3 py-2">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  You changed topics after this script was written. Regenerate it to include the changes.
                </div>
              )}

              <div className="relative">
                {writingFromScratch ? (
                  <div className="w-full h-28 bg-white dark:bg-[#141211] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#352e29] flex flex-col justify-center gap-2.5 animate-pulse">
                    <div className="h-3.5 bg-stone-200 dark:bg-[#28221e] rounded-md w-3/4" />
                    <div className="h-3.5 bg-stone-200 dark:bg-[#28221e] rounded-md w-11/12" />
                    <div className="h-3.5 bg-stone-200 dark:bg-[#28221e] rounded-md w-1/2" />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-ping" />
                      <span className="font-mono text-[10px] text-[#C2410C] dark:text-[#f97316]">
                        AI is writing your script with intuitive analogies…
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={4}
                      placeholder="No script yet. Click “Write script” to preview it — or just press Start listening and it will be written first."
                      className="no-orange-focus w-full bg-white dark:bg-[#141211] p-3.5 rounded font-mono text-[12px] border border-[#E5DDD2] dark:border-[#352e29] leading-relaxed focus:outline-none focus:!border-[#E5DDD2] dark:focus:!border-[#352e29] focus:ring-0 resize-none dark:text-[#e9e1dd]"
                    />
                    {transcript.trim() && (
                      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowPauseMenu(!showPauseMenu)}
                            className="font-mono text-[10px] bg-white dark:bg-[#1e1b19] text-[#706159] dark:text-[#a78b7d] px-2.5 py-1 rounded border border-[#E2D8CC] dark:border-[#352e29] hover:text-[#C2410C] dark:hover:text-[#f3ece7] flex items-center gap-1 shadow-xs"
                          >
                            <span>+ Insert pause</span>
                            <span className="material-symbols-outlined text-[12px]">expand_more</span>
                          </button>
                          {showPauseMenu && (
                            <div className="absolute bottom-full mb-1 right-0 bg-white dark:bg-[#1b1816] border border-[#E5DDD2] dark:border-[#352e29] rounded-lg shadow-lg p-1.5 flex flex-col gap-1 z-20 w-36">
                              {[
                                { label: "1.5s (Breath)", val: 1.5 },
                                { label: "2.5s (Standard)", val: 2.5 },
                                { label: "3.5s (Reflect)", val: 3.5 },
                              ].map((opt) => (
                                <button
                                  key={opt.label}
                                  type="button"
                                  onClick={() => {
                                    setTranscript(transcript + `\n\n[pause ${opt.val}s]\n\n`);
                                    setShowPauseMenu(false);
                                  }}
                                  className="text-left font-mono text-[10px] px-2 py-1 rounded hover:bg-[#FFECE7] dark:hover:bg-[#25201d] text-[#2B211E] dark:text-[#e0c0b1] hover:text-[#C2410C] dark:hover:text-[#f97316] transition"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Pacing & Total projected duration */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-[#F7F3EE]/70 dark:bg-[#1b1816] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#2d2723]">
              <div className="md:col-span-4 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] font-semibold uppercase">
                  Pause Between Topics
                </span>
                <p className="font-mono text-[11px] text-[#1C1513] dark:text-[#e0c0b1] leading-tight">
                  Smooth breathing silence between concepts. Current: <span className="font-bold text-[#C2410C]">{pauseSec}s</span>
                </p>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={pauseSec}
                  aria-label="Pause between topics"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setPause(v);
                    syncQueue({ pauseSec: v });
                  }}
                  className="w-full accent-[#C2410C] h-2 mt-1"
                />
              </div>
              <div className="md:col-span-5 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase">
                  Narration speed
                </span>
                <div
                  role="radiogroup"
                  aria-label="Narration speed"
                  className="flex items-center bg-white dark:bg-[#141211] rounded-lg p-0.5 border border-[#E2D8CC] dark:border-[#352e29]"
                >
                  {NARRATION_SPEEDS.map((r) => (
                    <button
                      key={r}
                      role="radio"
                      aria-checked={voiceRate === r}
                      onClick={() => {
                        setVoiceRate(r);
                        syncQueue({ rate: r });
                      }}
                      className={`flex-1 py-1 font-mono text-[11px] rounded ${
                        voiceRate === r
                          ? "bg-gradient-to-r from-[#C2410C] to-[#EA580C] text-white font-bold shadow"
                          : "text-[#706159] dark:text-[#a78b7d] hover:text-[#C2410C] dark:hover:text-[#f3ece7]"
                      }`}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-3 flex flex-col items-end">
                <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase">
                  Total study time
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif italic text-2xl text-[#C2410C] font-semibold">
                    {estLabel}
                  </span>
                  <span className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d]">
                    screen-free
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="flex flex-col gap-0.5 font-mono text-[11px] text-[#706159] dark:text-[#a78b7d] self-start sm:self-center">
                {saveLabels[saveStatus] && (
                  <span className={`flex items-center gap-1.5 ${saveStatus === "offline" ? "text-amber-800 dark:text-amber-300" : ""}`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {saveStatus === "saving" ? "sync" : saveStatus === "offline" ? "cloud_off" : "cloud_done"}
                    </span>
                    {saveLabels[saveStatus]}
                  </span>
                )}
                {!hasScript && !scriptBusy && (
                  <span>No script yet — Start listening will write it first, which takes a moment.</span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                {onOpenLibrary && (
                  <button
                    onClick={onOpenLibrary}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-lg border font-mono text-xs flex items-center justify-center gap-2 transition bg-white dark:bg-[#1a1715] border-[#E2D8CC] dark:border-[#352e29] dark:text-[#e0c0b1] hover:bg-[#F7F3EE] dark:hover:bg-[#25201d]"
                  >
                    <span className="material-symbols-outlined text-base text-[#706159] dark:text-[#a78b7d]">
                      library_books
                    </span>
                    <span>Open library</span>
                  </button>
                )}
                <button
                  onClick={startListening}
                  disabled={scriptBusy !== null}
                  className="w-full sm:w-auto px-7 py-2.5 rounded-lg bg-gradient-to-r from-[#C2410C] via-[#EA580C] to-[#D97706] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 maple-glow active:scale-95 disabled:opacity-50"
                >
                  {scriptBusy === "start" ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{writingFromScratch ? "Writing script…" : "Preparing…"}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">play_arrow</span>
                      <span>Start listening</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
          )}
        </>
      )}
    </div>
  );
}
