import { useState, useRef } from "react";
import { useSessionStore } from "../stores/useSessionStore";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { useLibraryStore } from "../stores/useLibraryStore";
import type { StudyMode } from "../data/mockData";

const modeOptions: { id: StudyMode; label: string; sub: string; icon: string }[] = [
  { id: "term-definition", label: "Listen & Learn", sub: "Hear the term, then the meaning", icon: "record_voice_over" },
  { id: "mnemonics", label: "Memory Tricks", sub: "Acronyms & mnemonics", icon: "lightbulb" },
  { id: "active-recall", label: "Quiz Me", sub: "Question → answer", icon: "quiz" },
  { id: "leitner", label: "Spaced Review", sub: "Review over time", icon: "update" },
  { id: "socratic", label: "Ask & Explore", sub: "Guided questions", icon: "forum" },
  { id: "speed-sprint", label: "Quick Review", sub: "Fast-paced recap", icon: "bolt" },
];

export default function StudyWorkspace() {
  const { fileName, fileMeta, docTitle, concepts, mode, transcript, pauseSec, voiceRate, setFile, clearFile, setDocTitle, updateConcept, removeConcept, addConcept, setMode, setTranscript, setPause, setVoiceRate } = useSessionStore();
  const setQueue = useAudioQueueStore((s) => s.setQueue);
  const setHudOpen = useAudioQueueStore((s) => s.setHudOpen);
  const setQueuePause = useAudioQueueStore((s) => s.setPause);
  const setQueueRate = useAudioQueueStore((s) => s.setRate);
  const addToLibrary = useLibraryStore((s) => s.add);

  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    setParsing(true);
    setTimeout(() => {
      const meta = `${(f.size / 1024 / 1024).toFixed(1)} MB • ${(Math.ceil(f.size / 50000) || 8)} Pages`;
      setFile(f.name, meta);
      if (!docTitle || docTitle.includes("Neurobiology")) setDocTitle(f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "));
      setParsing(false);
    }, 900);
  };

  const startSession = () => {
    const chunks = concepts.map((c, i) => ({ id: `live-${i}`, conceptId: c.id, title: c.term, text: `${c.term}. ${c.definition}`, reps: c.reps }));
    setQueue(chunks);
    setQueuePause(pauseSec);
    setQueueRate(voiceRate);
    setHudOpen(true);
  };

  const saveToLibrary = () => {
    const id = `s${Date.now()}`;
    const chunks = concepts.map((c, i) => ({ id: `${id}-ch-${i}`, conceptId: c.id, title: c.term, text: `${c.term}. ${c.definition}`, reps: c.reps }));
    addToLibrary({ id, title: docTitle, fileName: fileName ?? "Untitled.pdf", mode, chunkCount: chunks.length, durationLabel: `${Math.max(4, chunks.length * 0.8).toFixed(0)} min`, lastStudied: "Just now", concepts: [...concepts], chunks });
  };

  // derived est runtime
  const estSec = concepts.length * 22 + concepts.reduce((a, c) => a + (c.reps - 1) * 8, 0) + pauseSec * concepts.length;
  const estLabel = `${Math.floor(estSec / 60)}m ${Math.round(estSec % 60)}s`;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 py-7 flex flex-col gap-7">
      {/* Source Material */}
      <section className="w-full bg-white dark:bg-[#221e1b] rounded-xl p-5 sm:p-6 border border-[#E5DDD2] dark:border-[#2d2723] shadow-sm relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-[#C2410C]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#FFECE7] border border-[#C2410C]/30 grid place-items-center text-[#C2410C]"><span className="material-symbols-outlined text-base">upload_file</span></div>
            <h2 className="font-serif italic text-lg sm:text-xl">1 · Upload your notes</h2>
            {fileName && <span className="font-mono text-[10px] bg-[#C2410C] text-white px-2 py-0.5 rounded font-bold uppercase">{concepts.length} topics found</span>}
          </div>
          {fileName && <span className="hidden sm:inline font-mono text-[11px] text-[#706159]">We'll pull out the key topics for you to review</span>}
        </div>

        {!fileName ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            className={`rounded-lg p-8 border-2 border-dashed flex flex-col items-center text-center transition-colors ${dragOver ? "border-[#C2410C] dark:border-[#f97316] bg-[#FFF7ED] dark:bg-[#1a1715]" : "border-[#E5DDD2] dark:border-[#352e29] bg-[#FFFBF6]/60 dark:bg-[#1a1714]/80 hover:border-[#E5DDD2] dark:hover:border-[#352e29]"}`}
          >
            <div className="w-12 h-12 rounded-xl bg-[#FFF1EC] dark:bg-[#1e1b19] border border-[#E5DDD2] dark:border-[#352e29] grid place-items-center text-[#C2410C] dark:text-[#f97316] mb-3"><span className="material-symbols-outlined text-[26px]">upload_file</span></div>
            <div className="font-serif text-stone-900 dark:text-[#f3ece7] text-base mb-1">Drop your files here</div>
            <div className="font-mono text-xs text-stone-500 dark:text-[#a78b7d] mb-4">PDF, Word, or PowerPoint — or browse your computer</div>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.pptx,.txt,.md" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <button onClick={() => fileInputRef.current?.click()} className="px-4 py-1.5 rounded-lg bg-white dark:bg-[#1a1715] border border-[#E2D8CC] dark:border-[#352e29] text-xs font-semibold shadow-sm hover:bg-stone-50 dark:hover:bg-[#25201d] dark:text-[#e0c0b1] flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-[#C2410C]">add</span>Choose file</button>
            <div className="flex flex-wrap gap-1.5 mt-5 justify-center"><span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#1e1b19] border border-stone-200 dark:border-[#352e29] dark:text-[#e0c0b1]">PDF</span><span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#1e1b19] border border-stone-200 dark:border-[#352e29] dark:text-[#e0c0b1]">DOCX</span><span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 dark:bg-[#1e1b19] border border-stone-200 dark:border-[#352e29] dark:text-[#e0c0b1]">PPTX</span><span className="text-[11px] text-stone-400 dark:text-[#8d7168] ml-1">· Up to 50 MB per file</span></div>
          </div>
        ) : (
          <div className="bg-[#F7F3EE]/60 dark:bg-[#1b1816]/60 rounded-lg p-4 sm:p-5 border border-[#E5DDD2] dark:border-[#2d2723] flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-b from-[#FFECE7] to-white border border-[#C2410C]/30 grid place-items-center text-[#C2410C] shrink-0"><span className="material-symbols-outlined text-2xl">picture_as_pdf</span></div>
                <div>
                  <div className="font-medium text-[#1C1513] text-sm truncate max-w-[280px]">{fileName}</div>
                  <div className="font-mono text-[11px] text-[#706159]">{fileMeta}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setParsing(true)} className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] dark:text-[#e0c0b1] flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-[#C2410C]">refresh</span>Scan again</button>
                <button onClick={clearFile} className="font-mono text-[11px] px-3 py-1.5 rounded bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] text-rose-700 dark:text-rose-300">Remove file</button>
              </div>
            </div>
            <div className="pt-3 border-t border-[#E5DDD2]/60 dark:border-[#2d2723] flex items-center gap-2">
              {parsing ? <><span className="w-3 h-3 border-2 border-[#C2410C] border-t-transparent rounded-full animate-spin" /><span className="font-mono text-[11px] text-[#C2410C] dark:text-[#f97316] font-semibold">Reading your file…</span></> : <><span className="material-symbols-outlined text-[#C2410C] text-base">check_circle</span><span className="font-mono text-[11px] font-semibold dark:text-[#e0c0b1]">Found {concepts.length} key topics</span><span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d]">· Ready to review</span></>}
            </div>
            <div className="flex flex-col gap-1 pt-2">
              <label className="font-mono text-xs font-medium text-[#2B211E] dark:text-[#e0c0b1]">Audio title</label>
              <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Give your audio a title" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141211] border border-[#E5DDD2] dark:border-[#352e29] text-sm focus:outline-none focus:ring-2 focus:ring-[#C2410C]/20 focus:border-[#C2410C] dark:focus:border-[#f97316] dark:text-[#e9e1dd] placeholder:text-[#9C8C84]" />
            </div>
          </div>
        )}
      </section>

      {fileName && (
        <>
          {/* Key Concepts */}
          <section className="w-full bg-white dark:bg-[#221e1b] rounded-xl p-5 sm:p-6 border border-[#E5DDD2] dark:border-[#2d2723] shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E5DDD2] dark:border-[#2d2723] gap-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#FFECE7] border border-[#C2410C]/30 grid place-items-center text-[#C2410C]"><span className="material-symbols-outlined text-base">psychology</span></div>
            <h2 className="font-serif italic text-lg sm:text-xl">2 · What to learn</h2>
            <span className="font-mono text-[10px] bg-[#C2410C] text-white px-2.5 py-0.5 rounded font-bold uppercase">{concepts.length} topics</span>
          </div>
          <div className="flex gap-2">
            <button onClick={addConcept} className="font-mono text-[11px] px-3 py-1.5 rounded-lg bg-white dark:bg-[#1e1b19] hover:bg-[#FFECE7] dark:hover:bg-[#1a1715] text-[#706159] dark:text-[#a78b7d] hover:text-[#7C2D12] dark:hover:text-[#ffb690] border border-[#E2D8CC] dark:border-[#352e29] flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">add</span>Add topic</button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {concepts.map((c, idx) => (
            <article key={c.id} className={`p-3.5 sm:p-4 rounded-lg border flex flex-col md:flex-row md:items-center gap-3.5 ${idx === 0 ? "concept-highlight bg-[#F7F3EE]/70 border-[#C2410C] shadow-sm" : "concept-muted bg-white border-[#E5DDD2] hover:border-[#E5DDD2]"}`}>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`w-6 font-mono text-[11px] text-center py-1 rounded border ${idx === 0 ? "bg-[#FFECE7] dark:bg-[#341d13] text-[#7C2D12] dark:text-[#ffb690] border-[#C2410C] dark:border-[#f97316] font-bold" : "text-[#706159] dark:text-[#a78b7d] border-[#E2D8CC] dark:border-[#352e29] dark:bg-[#141211]"}`}>{String(idx + 1).padStart(2, "0")}</span>
                <span className={`w-1.5 h-10 rounded-full ${idx === 0 ? "bg-gradient-to-b from-[#EA580C] via-[#C2410C] to-[#D97706] shadow-[0_0_6px_rgba(194,65,12,0.4)]" : "bg-stone-200 dark:bg-[#2d2723]"}`} />
              </div>
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                <div className="lg:col-span-4 flex flex-col">
                  <label className={`font-mono text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5 font-medium ${idx === 0 ? "text-[#C2410C] dark:text-[#ffb690]" : "text-[#706159] dark:text-[#a78b7d]"}`}><span className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? "bg-[#C2410C]" : "bg-stone-300 dark:bg-[#352e29]"}`} />Topic</label>
                  <input value={c.term} onChange={(e) => updateConcept(c.id, { term: e.target.value })} className="no-orange-focus font-serif italic text-[15px] bg-white dark:bg-[#141211] px-3 py-1.5 rounded border border-[#E5DDD2] dark:border-[#352e29] focus:!border-[#E5DDD2] dark:focus:!border-[#352e29] focus:ring-0 focus:outline-none w-full font-medium dark:text-[#e9e1dd]" />
                </div>
                <div className="lg:col-span-8 flex flex-col">
                  <label className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase tracking-wider mb-1">Explanation</label>
                  <textarea value={c.definition} onChange={(e) => updateConcept(c.id, { definition: e.target.value })} rows={2} className="no-orange-focus font-sans text-[13px] bg-white dark:bg-[#141211] px-3 py-1.5 rounded border border-[#E5DDD2] dark:border-[#352e29] focus:!border-[#E5DDD2] dark:focus:!border-[#352e29] focus:ring-0 focus:outline-none w-full resize-none leading-relaxed dark:text-[#e9e1dd]" />
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#E5DDD2]/60 dark:border-[#2d2723]">
                <div className="flex flex-col items-center">
                  <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase mb-1">Repeat</span>
                  <div className="flex items-center bg-white dark:bg-[#141211] rounded-md p-0.5 border border-[#E5DDD2] dark:border-[#352e29]">
                    {[1, 2, 3].map((n) => (
                      <button key={n} onClick={() => updateConcept(c.id, { reps: n as 1 | 2 | 3 })} className={`font-mono text-[10px] px-2.5 py-1 rounded ${c.reps === n ? "bg-[#C2410C] text-white font-bold shadow-xs" : "text-[#706159] dark:text-[#a78b7d] hover:text-[#1C1513] dark:hover:text-[#f3ece7]"}`}>{n}x</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => removeConcept(c.id)} className="w-8 h-8 rounded bg-white dark:bg-[#1a1715] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[#8D7168] dark:text-[#8d7168] hover:text-rose-600 border border-[#E5DDD2] dark:border-[#352e29] grid place-items-center" title="Remove"><span className="material-symbols-outlined text-base">delete</span></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Voice & Pacing Studio */}
      <section className="w-full bg-white dark:bg-[#221e1b] rounded-xl p-5 sm:p-6 border border-[#E5DDD2] dark:border-[#2d2723] shadow-sm flex flex-col gap-6">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#E5DDD2] dark:border-[#2d2723]">
          <div className="w-7 h-7 rounded-lg bg-[#FFECE7] border border-[#C2410C]/30 grid place-items-center text-[#C2410C]"><span className="material-symbols-outlined text-base">tune</span></div>
          <h2 className="font-serif italic text-lg sm:text-xl">3 · How you want to learn</h2>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><label className="font-mono text-[10px] uppercase tracking-widest font-semibold text-[#706159]">Study style</label><span className="font-mono text-[10px] text-[#C2410C] bg-[#FFECE7] border border-[#C2410C]/20 px-2 py-0.5 rounded font-medium">{modeOptions.length} styles</span></div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {modeOptions.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)} className={`flex flex-col p-3 rounded-lg text-left border-2 transition-all ${mode === m.id ? "bg-[#F7F3EE]/80 dark:bg-[#1e1b19] border-[#C2410C] dark:border-[#f97316] shadow-sm" : "bg-white dark:bg-[#1e1b19] border-[#E5DDD2] dark:border-[#2d2723] hover:border-[#E5DDD2] dark:hover:border-[#352e29] dark:text-[#e0c0b1]"}`}>
                <div className="flex items-center justify-between mb-1.5"><span className={`material-symbols-outlined text-[18px] ${mode === m.id ? "text-[#C2410C] dark:text-[#f97316]" : "text-[#706159] dark:text-[#a78b7d]"}`}>{m.icon}</span><span className={`w-2 h-2 rounded-full ${mode === m.id ? "bg-[#C2410C] shadow-[0_0_5px_rgba(194,65,12,0.6)]" : "bg-[#E5DDD2] dark:bg-[#352e29]"}`} /></div>
                <span className={`font-serif italic text-[13px] font-semibold leading-tight ${mode === m.id ? "text-[#1C1513] dark:text-[#f3ece7]" : "text-[#1C1513] dark:text-[#e0c0b1]"}`}>{m.label}</span><span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] mt-1">{m.sub}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 p-3 bg-[#F7F3EE]/50 dark:bg-[#1b1816] rounded-lg border border-[#E5DDD2] dark:border-[#2d2723] text-[12px]">
            <span className="font-mono text-[10px] uppercase font-bold text-[#C2410C] bg-[#FFECE7] px-2 py-0.5 rounded border border-[#C2410C]/20 shrink-0">Selected</span>
            <p className="text-[#706159] leading-relaxed"><strong className="text-[#1C1513]">{modeOptions.find((m) => m.id === mode)?.label}:</strong> {mode === "term-definition" ? "You'll hear each idea, then a clear explanation — great for first-time learning." : mode === "mnemonics" ? "Uses shortcuts and memory tricks to help ideas stick." : mode === "active-recall" ? "You'll be asked a question, then hear the answer — perfect for testing yourself." : mode === "leitner" ? "Revisits topics over time so you remember longer." : mode === "socratic" ? "Asks guided questions to help you think deeper." : "A fast recap when you need a quick refresh."}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 bg-[#F7F3EE]/70 dark:bg-[#1b1816] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#2d2723]">
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold dark:text-[#e0c0b1]"><span className="material-symbols-outlined text-base text-[#C2410C]">record_voice_over</span> Audio preview <span className="text-[#706159] dark:text-[#a78b7d] font-normal">— what you'll hear</span></div>
          <div className="relative">
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} className="no-orange-focus w-full bg-white dark:bg-[#141211] p-3.5 rounded font-mono text-[12px] border border-[#E5DDD2] dark:border-[#352e29] leading-relaxed focus:outline-none focus:!border-[#E5DDD2] dark:focus:!border-[#352e29] focus:ring-0 resize-none dark:text-[#e9e1dd]" />
            <div className="absolute bottom-2.5 right-2.5 flex gap-2">
              <button onClick={() => setTranscript(transcript + " [pause 1.5s]")} className="font-mono text-[10px] bg-white dark:bg-[#1e1b19] text-[#706159] dark:text-[#a78b7d] px-2.5 py-1 rounded border border-[#E2D8CC] dark:border-[#352e29] hover:text-[#C2410C] dark:hover:text-[#f3ece7]">+ Add pause</button>
              <button className="font-mono text-[10px] bg-white dark:bg-[#1e1b19] dark:text-[#a78b7d] border border-[#E2D8CC] dark:border-[#352e29] px-2.5 py-1 rounded hover:text-[#1C1513] dark:hover:text-[#f3ece7]">Fix pronunciation</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-[#F7F3EE]/70 dark:bg-[#1b1816] p-4 rounded-lg border border-[#E5DDD2] dark:border-[#2d2723]">
          <div className="md:col-span-6 flex flex-col gap-1.5">
            <div className="flex items-center justify-between"><span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] font-semibold uppercase">Pause between topics</span><span className="font-mono text-[11px] text-[#706159] dark:text-[#e0c0b1] font-bold bg-white dark:bg-[#1e1b19] px-2 py-0.5 rounded border border-[#E2D8CC] dark:border-[#352e29]">{pauseSec} sec</span></div>
            <input type="range" min={1} max={5} step={0.5} value={pauseSec} onChange={(e) => { const v = parseFloat(e.target.value); setPause(v); setQueuePause(v); }} className="w-full accent-[#C2410C] h-2" />
            <div className="flex justify-between font-mono text-[10px] text-[#706159] dark:text-[#a78b7d]"><span>Short</span><span className="text-[#706159] dark:text-[#a78b7d]">Recommended</span><span>Long</span></div>
          </div>
          <div className="md:col-span-3 flex flex-col gap-1.5">
            <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase">Speaking speed</span>
            <div className="flex items-center bg-white dark:bg-[#141211] rounded-lg p-0.5 border border-[#E2D8CC] dark:border-[#352e29]">
              {([0.9, 1, 1.15] as const).map((r) => (
                <button key={r} onClick={() => { setVoiceRate(r); setQueueRate(r); }} className={`flex-1 py-1 font-mono text-[11px] rounded ${voiceRate === r ? "bg-gradient-to-r from-[#C2410C] to-[#EA580C] text-white font-bold shadow" : "text-[#706159] dark:text-[#a78b7d] hover:text-[#C2410C] dark:hover:text-[#f3ece7]"}`}>{r}x</button>
              ))}
            </div>
          </div>
          <div className="md:col-span-3 flex flex-col items-end">
            <span className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] uppercase">Total time</span>
            <div className="flex items-baseline gap-1.5"><span className="font-serif italic text-2xl text-[#C2410C] font-semibold">{estLabel}</span><span className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d]">per listen</span></div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-1">
          <button onClick={saveToLibrary} className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-white dark:bg-[#1a1715] border border-[#E2D8CC] dark:border-[#352e29] hover:border-[#E2D8CC] dark:hover:border-[#352e29] font-mono text-xs flex items-center justify-center gap-2 dark:text-[#e0c0b1]"><span className="material-symbols-outlined text-base text-[#706159] dark:text-[#a78b7d]">bookmark_border</span>Save to library</button>
          <button onClick={startSession} className="w-full sm:w-auto px-7 py-2.5 rounded-lg bg-gradient-to-r from-[#C2410C] via-[#EA580C] to-[#D97706] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 maple-glow active:scale-95"><span className="material-symbols-outlined text-lg">play_arrow</span>Start listening</button>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
