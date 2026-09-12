import { useState, useRef, useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (opts: { title: string; style: string; fileName: string }) => void;
};

export default function NewAudioModal({ open, onClose, onCreate }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("Cellular_Neurobiology_Lecture_05.pdf");
  const [hasFile, setHasFile] = useState(false);
  const [title, setTitle] = useState("Cellular Neurobiology: Synaptic Plasticity & LTP");
  const [style, setStyle] = useState<"listen" | "quiz" | "tricks">("listen");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* scrim + blurred library behind */}
      <div className="absolute inset-0 bg-[#211A17]/25 backdrop-blur-[6px]" onClick={onClose} />
      {/* dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-audio-title"
        className="relative w-full max-w-2xl bg-white dark:bg-[#221e1b] rounded-2xl border border-[#E5DDD2] dark:border-[#2d2723] shadow-[0_24px_64px_rgba(28,21,18,0.12),0_12px_32px_rgba(28,21,18,0.08)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-6 py-5 border-b border-[#F0E8DE] dark:border-[#2d2723] flex items-start justify-between gap-4 shrink-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C2410C]" />
              <span className="font-mono text-[11px] tracking-wider uppercase text-[#C2410C] font-semibold">New audio</span>
            </div>
            <h2 id="new-audio-title" className="font-serif text-2xl text-[#1C1513] tracking-tight">
              Create new audio
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#706159] mt-0.5">
              Turn lecture slides, PDFs, or notes into audio you can listen to while you do other things.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-lg grid place-items-center text-[#8D7168] hover:text-[#1C1513] dark:hover:text-[#f3ece7] hover:bg-[#F7F3EE] dark:hover:bg-[#1b1816] border border-transparent hover:border-[#E5DDD2] dark:hover:border-[#352e29] transition">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* body scroll */}
        <div className="overflow-y-auto p-6 flex flex-col gap-5">
          {/* dropzone — 1 · Upload */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#8D7168] font-semibold">1 · Upload your notes</span>
            {hasFile && <span className="font-mono text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">✓ uploaded</span>}
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) {
                setFileName(f.name);
                setTitle(f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "));
              }
              setHasFile(true);
            }}
            className={`rounded-xl p-6 sm:p-8 text-center flex flex-col items-center justify-center border-2 border-dashed transition-colors cursor-pointer ${dragOver ? "border-[#C2410C] dark:border-[#f97316] bg-[#FFF7ED] dark:bg-[#1a1715]" : hasFile ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800/50" : "border-[#E5DDD2] dark:border-[#352e29] bg-[#FFFBF6]/60 dark:bg-[#1a1714]/80 hover:border-[#E5DDD2] dark:hover:border-[#352e29] hover:bg-[#FFF7ED]/50 dark:hover:bg-[#1a1715]"}`}
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-xl bg-[#FFF1EC] dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] grid place-items-center text-[#C2410C] dark:text-[#f97316] mb-3">
              <span className="material-symbols-outlined text-[26px]">upload_file</span>
            </div>
            <div className="font-serif text-[#1C1513] dark:text-[#f3ece7] text-base">Drop your files here</div>
            <div className="font-mono text-xs text-[#706159] dark:text-[#a78b7d] mt-1">or browse your computer to get started</div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFileName(f.name);
                  setTitle(f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "));
                  setHasFile(true);
                }
              }}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              className="mt-4 px-4 py-1.5 rounded-lg bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] dark:text-[#e0c0b1] text-xs font-semibold shadow-sm hover:bg-[#F7F3EE] dark:hover:bg-[#25201d] flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-[#C2410C]">add</span>Browse files
            </button>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F7F3EE] dark:bg-[#1e1b19] text-[#706159] dark:text-[#e0c0b1] border border-[#E5DDD2] dark:border-[#352e29]">PDF</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F7F3EE] dark:bg-[#1e1b19] text-[#706159] dark:text-[#e0c0b1] border border-[#E5DDD2] dark:border-[#352e29]">DOCX</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F7F3EE] dark:bg-[#1e1b19] text-[#706159] dark:text-[#e0c0b1] border border-[#E5DDD2] dark:border-[#352e29]">PPTX</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F7F3EE] dark:bg-[#1e1b19] text-[#706159] dark:text-[#e0c0b1] border border-[#E5DDD2] dark:border-[#352e29]">TXT</span>
              <span className="text-[11px] text-[#8D7168] dark:text-[#8d7168] ml-1">· Up to 50 MB per file</span>
            </div>
          </div>

          {/* staged file + options — follows same sequence as Create tab: 1) upload → 2) title → 3) style */}
          {hasFile ? (
            <div className="flex flex-col gap-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#8D7168] font-semibold">2 · Your file</span>
                <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Ready to turn into audio
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#F7F3EE]/60 dark:bg-[#1b1816]/60 border border-[#E5DDD2] dark:border-[#2d2723] flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#FFF1EC] dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] text-[#C2410C] dark:text-[#f97316] grid place-items-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-xs text-[#1C1513] dark:text-[#f3ece7] font-semibold truncate max-w-[260px] sm:max-w-[320px]">{fileName}</span>
                      <span className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d]">6.4 MB · 24 slides · PDF</span>
                    </div>
                  </div>
                  <button onClick={() => setHasFile(false)} className="text-[#8D7168] hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-white dark:hover:bg-[#1a1715] border border-transparent hover:border-[#E5DDD2] dark:hover:border-[#352e29] transition" title="Remove file">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-deck-title" className="font-mono text-xs font-medium text-[#2B211E] dark:text-[#e0c0b1]">3 · Audio title</label>
                  <input
                    id="new-deck-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Biology: How synapses change"
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141211] border border-[#E5DDD2] dark:border-[#352e29] text-sm text-[#1C1513] dark:text-[#e9e1dd] placeholder:text-[#9C8C84] focus:outline-none focus:ring-2 focus:ring-[#C2410C]/15 focus:border-[#C2410C] dark:focus:border-[#f97316]"
                  />
                  <span className="font-mono text-[11px] text-[#8D7168] dark:text-[#a78b7d]">You can change this and the topics on the next step.</span>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="font-mono text-xs font-medium text-[#2B211E] dark:text-[#e0c0b1]">4 · How should it teach?</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "listen" as const, label: "Listen & Learn", desc: "Term → meaning", icon: "record_voice_over" },
                      { id: "quiz" as const, label: "Quiz Me", desc: "Question → answer", icon: "quiz" },
                      { id: "tricks" as const, label: "Memory Tricks", desc: "Acronyms & mnemonics", icon: "lightbulb" },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setStyle(o.id)}
                        className={`text-left px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${style === o.id ? "bg-[#C2410C] text-white border-[#C2410C] shadow-md" : "bg-white dark:bg-[#1e1b19] border-[#E5DDD2] dark:border-[#2d2723] hover:border-[#E5DDD2] dark:hover:border-[#352e29] text-[#1C1513] dark:text-[#e0c0b1] hover:bg-[#FFFBF6] dark:hover:bg-[#25201d]"}`}
                      >
                        <span className="flex flex-col">
                          <span className={`font-mono text-xs font-semibold ${style === o.id ? "text-white" : "text-[#1C1513]"}`}>{o.label}</span>
                          <span className={`font-mono text-[11px] ${style === o.id ? "text-white/80" : "text-[#706159]"}`}>{o.desc}</span>
                        </span>
                        <span className={`material-symbols-outlined text-[18px] shrink-0 ${style === o.id ? "text-white" : "text-[#8D7168]"}`}>{style === o.id ? "check_circle" : o.icon}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#FFFBF6]/50 dark:bg-[#1a1715]/50 border border-dashed border-[#E5DDD2] dark:border-[#2d2723] font-mono text-xs text-[#8D7168] dark:text-[#a78b7d]">
              <span className="material-symbols-outlined text-[16px]">info</span> Upload your notes above to set a title and teaching style
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-6 py-4 bg-[#F7F3EE]/50 dark:bg-[#1b1816] border-t border-[#E5DDD2] dark:border-[#2d2723] flex items-center justify-between gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 font-mono text-xs font-medium text-[#706159] dark:text-[#a78b7d] hover:text-[#1C1513] dark:hover:text-[#f3ece7] rounded-lg hover:bg-white dark:hover:bg-[#25201d] border border-transparent hover:border-[#E5DDD2] dark:hover:border-[#352e29] transition">
            Cancel
          </button>
          <button
            onClick={() => hasFile && onCreate({ title: title.trim() || "Untitled audio", style, fileName })}
            disabled={!hasFile}
            className={`px-6 py-2.5 rounded-xl font-mono text-xs font-semibold shadow-md flex items-center gap-2 transition ${hasFile ? "bg-gradient-to-r from-[#C2410C] to-[#EA580C] hover:from-[#9B2F00] hover:to-[#C2410C] text-white" : "bg-stone-200 dark:bg-[#2d2723] text-stone-400 dark:text-[#8d7168] cursor-not-allowed"}`}
            title={hasFile ? "Create audio & open editor" : "Upload your notes first"}
          >
            {hasFile ? "Create audio & open editor" : "Upload notes to continue"} <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
