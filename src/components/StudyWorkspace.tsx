import { useState, useRef } from "react";
import { useSessionStore } from "../stores/useSessionStore";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { useLibraryStore } from "../stores/useLibraryStore";
import { parseDocument, extractConcepts, compileScript } from "../services/api";
import type { StudyStyle } from "../data/mockData";

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

type Props = {
  onSaved?: () => void;
};

export default function StudyWorkspace({ onSaved }: Props) {
  const {
    activeDeckId,
    setActiveDeckId,
    fileName,
    fileMeta,
    docTitle,
    concepts,
    style,
    setStyle,
    transcript,
    pauseSec,
    voiceRate,
    setFile,
    clearFile,
    setDocTitle,
    setConcepts,
    updateConcept,
    removeConcept,
    addConcept,
    setTranscript,
    setVoiceRate,
  } = useSessionStore();
  const setQueue = useAudioQueueStore((s) => s.setQueue);
  const setHudOpen = useAudioQueueStore((s) => s.setHudOpen);
  const setQueuePause = useAudioQueueStore((s) => s.setPause);
  const setQueueRate = useAudioQueueStore((s) => s.setRate);
  const saveDeck = useLibraryStore((s) => s.saveDeck);

  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    setCurrentFile(f);
    setParsing(true);
    setStatusMessage("Uploading and extracting text via Docling…");

    try {
      const parseRes = await parseDocument(f);
      const meta = `${(f.size / 1024 / 1024).toFixed(1)} MB • ${parseRes.page_count} Pages`;
      setFile(f.name, meta);
      const derivedTitle = f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      if (!docTitle || docTitle.includes("Neurobiology")) setDocTitle(derivedTitle);

      setStatusMessage("Extracting key study concepts…");
      const conceptRes = await extractConcepts(parseRes.document_id);
      let parsedConcepts = concepts;
      if (conceptRes.concepts && conceptRes.concepts.length > 0) {
        parsedConcepts = conceptRes.concepts.map((c, i) => ({
          id: c.id || `c${i + 1}`,
          term: c.term,
          definition: c.definition,
          reps: 1 as const,
        }));
        setConcepts(parsedConcepts);
      }

      setStatusMessage("Formatting Primer audio track…");
      const initialChunks = parsedConcepts.map((c, i) => ({
        id: `ch-${i}`,
        conceptId: c.id,
        title: c.term,
        text: `Concept: ${c.term}. ${c.definition}`,
        reps: c.reps,
      }));
      const initialEstSec = parsedConcepts.length * 18;
      const initialTranscript = initialChunks.map((c) => c.text).join("\n\n[pause 2.5s]\n\n");

      const savedDraft = await saveDeck({
        filename: f.name,
        deckTitle: derivedTitle,
        pauseSec: 2.5,
        voiceRate,
        estimatedSec: initialEstSec,
        transcript: initialTranscript,
        chunks: initialChunks,
        concepts: parsedConcepts,
      });

      if (savedDraft?.id) {
        setActiveDeckId(savedDraft.id);
      }
      setTranscript(initialTranscript);
      setStatusMessage(null);
    } catch (err: any) {
      console.error("Backend parsing or extraction failed:", err);
      setStatusMessage(`Extraction failed: ${err.message || "Unknown error"}. Please try again.`);
    } finally {
      setParsing(false);
    }
  };

  const generateScriptPreview = async () => {
    if (concepts.length === 0) return;
    setGeneratingPreview(true);
    try {
      const res = await compileScript({
        deckTitle: docTitle || "Untitled Deck",
        concepts: concepts.map((c) => ({
          id: c.id,
          term: c.term,
          definition: c.definition,
          reps: c.reps,
        })),
        pauseSec,
        voiceRate,
      });
      setTranscript(res.transcript);
    } catch (err: any) {
      console.warn("Script generation failed:", err.message);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const startSession = async () => {
    setCompiling(true);
    try {
      const res = await compileScript({
        deckTitle: docTitle || "Untitled Deck",
        concepts: concepts.map((c) => ({
          id: c.id,
          term: c.term,
          definition: c.definition,
          reps: c.reps,
        })),
        pauseSec,
        voiceRate,
        transcriptOverride: transcript && transcript.trim() !== "" ? transcript : undefined,
      });

      setTranscript(res.transcript);
      setQueuePause(res.pauseSec);
      setQueueRate(voiceRate);
      setQueue(res.chunks);
      useAudioQueueStore.getState().setPlaying(true);
      setHudOpen(true);

      saveDeck(
        {
          filename: fileName ?? "Untitled.pdf",
          deckTitle: docTitle || "Untitled Deck",
          pauseSec: res.pauseSec,
          voiceRate,
          estimatedSec: res.estimatedSec,
          transcript: res.transcript,
          chunks: res.chunks,
          concepts,
        },
        activeDeckId
      )
        .then((saved) => {
          if (saved?.id && !activeDeckId) setActiveDeckId(saved.id);
        })
        .catch((e) => console.warn("Failed to background sync compiled deck:", e));
    } catch (err: any) {
      console.warn("Backend compilation failed, using local queue:", err.message);
      const fallbackChunks = concepts.map((c, i) => ({
        id: `live-${i}`,
        conceptId: c.id,
        title: c.term,
        text: `Concept: ${c.term}. ${c.definition}`,
        reps: c.reps,
      }));
      setQueuePause(pauseSec);
      setQueueRate(voiceRate);
      setQueue(fallbackChunks);
      useAudioQueueStore.getState().setPlaying(true);
      setHudOpen(true);
    } finally {
      setCompiling(false);
    }
  };

  const saveToLibrary = async () => {
    setSaving(true);
    const chunks = concepts.map((c, i) => ({
      id: `ch-${i}`,
      conceptId: c.id,
      title: c.term,
      text: `Concept: ${c.term}. ${c.definition}`,
      reps: c.reps,
    }));

    const saved = await saveDeck(
      {
        filename: fileName ?? "Untitled.pdf",
        deckTitle: docTitle || "Untitled Deck",
        pauseSec,
        voiceRate,
        estimatedSec: estSec,
        transcript,
        chunks,
        concepts,
      },
      activeDeckId
    );
    if (saved?.id) {
      setActiveDeckId(saved.id);
    }
    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onSaved?.();
    }, 800);
  };

  const estSec = concepts.length * 20 + concepts.reduce((a, c) => a + (c.reps - 1) * 8, 0);
  const estLabel = `${Math.floor(estSec / 60)}m ${Math.round(estSec % 60)}s`;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 py-7 flex flex-col gap-7">
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
              handleFiles(e.dataTransfer.files);
            }}
            className={`rounded-lg p-8 border-2 border-dashed flex flex-col items-center text-center transition-colors ${
              dragOver
                ? "border-[#C2410C] dark:border-[#f97316] bg-[#FFF7ED] dark:bg-[#1a1715]"
                : "border-[#E5DDD2] dark:border-[#352e29] bg-[#FFFBF6]/60 dark:bg-[#1a1714]/80 hover:border-[#E5DDD2] dark:hover:border-[#352e29]"
            }`}
          >
            {parsing ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <span className="w-10 h-10 border-3 border-[#C2410C] border-t-transparent rounded-full animate-spin" />
                <div className="font-serif text-[#1C1513] dark:text-[#f3ece7] text-base font-medium">
                  {statusMessage || "Processing your document…"}
                </div>
                <div className="font-mono text-xs text-[#706159] dark:text-[#a78b7d]">
                  Extracting text and identifying key study topics via Docling & LLM
                </div>
              </div>
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.txt,.md"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
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
                  onClick={() => {
                    if (currentFile) {
                      const dt = new DataTransfer();
                      dt.items.add(currentFile);
                      handleFiles(dt.files);
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  disabled={parsing}
                  className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] dark:text-[#e0c0b1] flex items-center gap-1.5 hover:bg-[#F7F3EE] dark:hover:bg-[#25201d] transition disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm text-[#C2410C]">refresh</span>
                  Scan again
                </button>
                <button
                  onClick={() => {
                    clearFile();
                    setCurrentFile(null);
                  }}
                  className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
                >
                  Remove file
                </button>
              </div>
            </div>
            <div className="pt-3 border-t border-[#E5DDD2]/60 dark:border-[#2d2723] flex items-center gap-2">
              {parsing ? (
                <>
                  <span className="w-3 h-3 border-2 border-[#C2410C] border-t-transparent rounded-full animate-spin" />
                  <span className="font-mono text-[11px] text-[#C2410C] dark:text-[#f97316] font-semibold">
                    {statusMessage || "Reading your file…"}
                  </span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[#C2410C] text-base">
                    check_circle
                  </span>
                  <span className="font-mono text-[11px] font-semibold dark:text-[#e0c0b1]">
                    Found {concepts.length} key topics
                  </span>
                  <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d]">
                    · Formatted for screen-free auditory learning
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-col gap-1 pt-2">
              <label className="font-mono text-xs font-medium text-[#2B211E] dark:text-[#e0c0b1]">
                Audio title
              </label>
              <input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Give your audio a title"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141211] border border-[#E5DDD2] dark:border-[#352e29] text-sm focus:outline-none focus:ring-2 focus:ring-[#C2410C]/20 focus:border-[#C2410C] dark:focus:border-[#f97316] dark:text-[#e9e1dd] placeholder:text-[#9C8C84]"
              />
            </div>
          </div>
        )}
      </section>

      {/* Prominent extraction loading banner */}
      {parsing && (
        <div className="w-full bg-[#FFF7ED] dark:bg-[#1f1a17] border-2 border-[#EA580C] dark:border-[#f97316] rounded-xl p-6 sm:p-8 flex flex-col items-center text-center shadow-md animate-in fade-in duration-300">
          <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#2b221d] border border-[#EA580C]/30 text-[#C2410C] dark:text-[#f97316] grid place-items-center mb-4 shadow-sm">
            <span className="w-7 h-7 border-3 border-[#C2410C] dark:border-[#f97316] border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="font-serif italic text-xl sm:text-2xl text-[#1C1513] dark:text-[#f3ece7] font-semibold mb-2">
            {statusMessage || "Analyzing your document…"}
          </h3>
          <p className="font-mono text-xs sm:text-sm text-[#706159] dark:text-[#a78b7d] max-w-md leading-relaxed">
            Please wait while Docling extracts layout and structure, then our AI reads the content to
            curate your key study concepts.
          </p>
        </div>
      )}

      {fileName && !parsing && concepts.length > 0 && (
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
                      title="Remove"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* 3. Audio Narration Studio */}
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

            {/* Audio Preview */}
            <div className="flex flex-col gap-2.5 bg-[#F7F3EE]/70 dark:bg-[#1b1816] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#2d2723]">
              <div className="flex items-center justify-between font-mono text-[11px] font-semibold dark:text-[#e0c0b1]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-[#C2410C]">
                    record_voice_over
                  </span>
                  <span>Primer audio script preview</span>
                  <span className="text-[#706159] dark:text-[#a78b7d] font-normal">
                    — natural audiobook flow with breath pauses
                  </span>
                </div>
                <button
                  onClick={generateScriptPreview}
                  disabled={generatingPreview || concepts.length === 0}
                  className="px-2.5 py-1 rounded bg-white dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] hover:bg-[#FFECE7] dark:hover:bg-[#25201d] text-[#C2410C] dark:text-[#f97316] text-[11px] font-mono flex items-center gap-1.5 transition disabled:opacity-50"
                  title="Generate spoken Primer analogies"
                >
                  {generatingPreview ? (
                    <>
                      <span className="w-3 h-3 border-2 border-[#C2410C] border-t-transparent rounded-full animate-spin" />
                      <span>Generating…</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                      <span>Generate analogies</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative">
                {generatingPreview ? (
                  <div className="w-full h-28 bg-white dark:bg-[#141211] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#352e29] flex flex-col justify-center gap-2.5 animate-pulse">
                    <div className="h-3.5 bg-stone-200 dark:bg-[#28221e] rounded-md w-3/4" />
                    <div className="h-3.5 bg-stone-200 dark:bg-[#28221e] rounded-md w-11/12" />
                    <div className="h-3.5 bg-stone-200 dark:bg-[#28221e] rounded-md w-1/2" />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-ping" />
                      <span className="font-mono text-[10px] text-[#C2410C] dark:text-[#f97316]">
                        AI is creating intuitive analogies for your audio script…
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={4}
                      placeholder="Your Primer audio script will appear here."
                      className="no-orange-focus w-full bg-white dark:bg-[#141211] p-3.5 rounded font-mono text-[12px] border border-[#E5DDD2] dark:border-[#352e29] leading-relaxed focus:outline-none focus:!border-[#E5DDD2] dark:focus:!border-[#352e29] focus:ring-0 resize-none dark:text-[#e9e1dd]"
                    />
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
                  </>
                )}
              </div>
            </div>

            {/* Pacing & Total projected duration */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-[#F7F3EE]/70 dark:bg-[#1b1816] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#2d2723]">
              <div className="md:col-span-6 flex flex-col gap-1.5">
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
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    useSessionStore.getState().setPause(v);
                    setQueuePause(v);
                  }}
                  className="w-full accent-[#C2410C] h-2 mt-1"
                />
              </div>
              <div className="md:col-span-3 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase">
                  Narration speed
                </span>
                <div className="flex items-center bg-white dark:bg-[#141211] rounded-lg p-0.5 border border-[#E2D8CC] dark:border-[#352e29]">
                  {([0.9, 1, 1.15] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setVoiceRate(r);
                        setQueueRate(r);
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

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-1">
              <button
                onClick={saveToLibrary}
                disabled={saving || savedSuccess}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-lg border font-mono text-xs flex items-center justify-center gap-2 transition disabled:opacity-75 ${
                  savedSuccess
                    ? "bg-gradient-to-r from-[#C2410C] via-[#EA580C] to-[#D97706] text-white border-transparent shadow-md"
                    : "bg-white dark:bg-[#1a1715] border-[#E2D8CC] dark:border-[#352e29] hover:border-[#E2D8CC] dark:hover:border-[#352e29] dark:text-[#e0c0b1]"
                }`}
              >
                {saving ? (
                  <>
                    <span className="w-3 h-3 border-2 border-[#706159] border-t-transparent rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : savedSuccess ? (
                  <>
                    <span className="material-symbols-outlined text-base">check</span>
                    <span>Saved! Going to Library…</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base text-[#706159] dark:text-[#a78b7d]">
                      bookmark_border
                    </span>
                    <span>Save & view in library</span>
                  </>
                )}
              </button>
              <button
                onClick={startSession}
                disabled={compiling}
                className="w-full sm:w-auto px-7 py-2.5 rounded-lg bg-gradient-to-r from-[#C2410C] via-[#EA580C] to-[#D97706] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 maple-glow active:scale-95 disabled:opacity-50"
              >
                {compiling ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Formatting…</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">play_arrow</span>
                    <span>Start listening</span>
                  </>
                )}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
