import { useState, useRef, useEffect } from "react";
import type { StudyStyle } from "../data/mockData";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (opts: { title: string; style: StudyStyle; fileName: string }) => void;
};

type StyleCard = {
  id: StudyStyle;
  label: string;
  sub: string;
  desc: string;
  icon: string;
  available: boolean;
};

const modalStyles: StyleCard[] = [
  {
    id: "primer",
    label: "Primer Audio",
    sub: "Audiobook with Analogies",
    desc: "Seamless listening with intuitive 'Think of it like this' analogies.",
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
    desc: "Letter-by-letter breakdowns for complex multi-part concepts.",
    icon: "format_list_numbered",
    available: false,
  },
  {
    id: "feynman",
    label: "Feynman Technique",
    sub: "Plain-English Teacher",
    desc: "Jargon-free explanation drills with concise keyword self-checks.",
    icon: "school",
    available: false,
  },
];

export default function NewAudioModal({ open, onClose, onCreate }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("Cellular_Neurobiology_Lecture_05.pdf");
  const [hasFile, setHasFile] = useState(false);
  const [title, setTitle] = useState("Cellular Neurobiology: Synaptic Plasticity & LTP");
  const [style, setStyle] = useState<StudyStyle>("primer");
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
      <div className="absolute inset-0 bg-[#211A17]/25 backdrop-blur-[6px]" onClick={onClose} />
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
              <span className="font-mono text-[11px] tracking-wider uppercase text-[#C2410C] font-semibold">
                New audio
              </span>
            </div>
            <h2 id="new-audio-title" className="font-serif text-2xl text-[#1C1513] tracking-tight">
              Create new audio
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#706159] mt-0.5">
              Turn lecture slides, PDFs, or notes into an audiobook with grounded real-world analogies.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg grid place-items-center text-[#8D7168] hover:text-[#1C1513] dark:hover:text-[#f3ece7] hover:bg-[#F7F3EE] dark:hover:bg-[#1b1816] border border-transparent hover:border-[#E5DDD2] dark:hover:border-[#352e29] transition"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#8D7168] font-semibold">
              1 · Upload your notes
            </span>
            {hasFile && (
              <span className="font-mono text-[10px] bg-[#C2410C] text-white px-2 py-0.5 rounded-full font-bold">
                ✓ uploaded
              </span>
            )}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
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
            className={`rounded-xl p-6 sm:p-8 text-center flex flex-col items-center justify-center border-2 border-dashed transition-colors cursor-pointer ${
              dragOver
                ? "border-[#C2410C] dark:border-[#f97316] bg-[#FFF7ED] dark:bg-[#1a1715]"
                : hasFile
                ? "border-[#C2410C]/40 bg-[#FFECE7]/40 dark:bg-[#341d13]/30 dark:border-[#f97316]/30"
                : "border-[#E5DDD2] dark:border-[#352e29] bg-[#FFFBF6]/60 dark:bg-[#1a1714]/80 hover:border-[#E5DDD2] dark:hover:border-[#352e29] hover:bg-[#FFF7ED]/50 dark:hover:bg-[#1a1715]"
            }`}
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-xl bg-[#FFF1EC] dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] grid place-items-center text-[#C2410C] dark:text-[#f97316] mb-3">
              <span className="material-symbols-outlined text-[26px]">upload_file</span>
            </div>
            <div className="font-serif text-[#1C1513] dark:text-[#f3ece7] text-base">
              Drop your files here
            </div>
            <div className="font-mono text-xs text-[#706159] dark:text-[#a78b7d] mt-1">
              or browse your computer to get started
            </div>
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
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
              className="mt-4 px-4 py-1.5 rounded-lg bg-white dark:bg-[#1a1715] border border-[#E5DDD2] dark:border-[#352e29] dark:text-[#e0c0b1] text-xs font-semibold shadow-sm hover:bg-[#F7F3EE] dark:hover:bg-[#25201d] flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-[#C2410C]">add</span>Browse
              files
            </button>
          </div>

          {hasFile && (
            <div className="flex flex-col gap-4 animate-in fade-in">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-xs font-medium text-[#2B211E] dark:text-[#e0c0b1]">
                  2 · Audio title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Biology: How synapses change"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141211] border border-[#E5DDD2] dark:border-[#352e29] text-sm text-[#1C1513] dark:text-[#e9e1dd] placeholder:text-[#9C8C84] focus:outline-none focus:ring-2 focus:ring-[#C2410C]/15 focus:border-[#C2410C] dark:focus:border-[#f97316]"
                />
              </div>

              {/* Study Style Picker */}
              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs font-medium text-[#2B211E] dark:text-[#e0c0b1]">
                  3 · Select Study Style
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {modalStyles.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (s.available) {
                          setStyle(s.id);
                        }
                      }}
                      className={`text-left p-3 rounded-xl border flex flex-col justify-between transition-all ${
                        s.available
                          ? style === s.id
                            ? "bg-[#FFF7ED] dark:bg-[#2A221C] border-[#EA580C] dark:border-[#F97316] ring-1 ring-[#EA580C]/20 shadow-xs"
                            : "bg-white dark:bg-[#1a1715] border-[#E5DDD2] dark:border-[#352e29] hover:border-[#EA580C]"
                          : "bg-[#F7F3EE]/50 dark:bg-[#141211]/50 border-dashed border-[#E5DDD2] dark:border-[#2d2723] opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`material-symbols-outlined text-[18px] ${s.available ? "text-[#C2410C] dark:text-[#f97316]" : "text-[#8D7168]"}`}>
                          {s.icon}
                        </span>
                        {s.available ? (
                          <span className="font-mono text-[9px] uppercase font-bold bg-[#C2410C] text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        ) : (
                          <span className="font-mono text-[9px] uppercase bg-[#E5DDD2] dark:bg-[#2d2723] text-[#706159] dark:text-[#a78b7d] px-1.5 py-0.5 rounded">
                            Coming Soon
                          </span>
                        )}
                      </div>
                      <div className="font-serif font-semibold text-xs text-[#1C1513] dark:text-[#f3ece7]">
                        {s.label}
                      </div>
                      <p className="text-[10px] text-[#706159] dark:text-[#a78b7d] mt-0.5 leading-snug">
                        {s.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-6 py-4 bg-[#F7F3EE]/50 dark:bg-[#1b1816] border-t border-[#E5DDD2] dark:border-[#2d2723] flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 font-mono text-xs font-medium text-[#706159] dark:text-[#a78b7d] hover:text-[#1C1513] dark:hover:text-[#f3ece7] rounded-lg hover:bg-white dark:hover:bg-[#25201d] border border-transparent hover:border-[#E5DDD2] dark:hover:border-[#352e29] transition"
          >
            Cancel
          </button>
          <button
            onClick={() => hasFile && onCreate({ title: title.trim() || "Untitled audio", style, fileName })}
            disabled={!hasFile}
            className={`px-6 py-2.5 rounded-xl font-mono text-xs font-semibold shadow-md flex items-center gap-2 transition ${
              hasFile
                ? "bg-gradient-to-r from-[#C2410C] to-[#EA580C] hover:from-[#9B2F00] hover:to-[#C2410C] text-white"
                : "bg-stone-200 dark:bg-[#2d2723] text-stone-400 dark:text-[#8d7168] cursor-not-allowed"
            }`}
          >
            Create audiobook <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
