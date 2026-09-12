import { useMemo, useState } from "react";
import { useLibraryStore } from "../stores/useLibraryStore";
import { useSessionStore } from "../stores/useSessionStore";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { modeLabels } from "../data/mockData";
import NewAudioModal from "./NewAudioModal";

type Props = { onEdit: () => void };

export default function MyAudios({ onEdit }: Props) {
  const { sessions, filter, sortBy, setFilter, setSort, remove } = useLibraryStore();
  const loadFromSession = useSessionStore((s) => s.loadFromSession);
  const setQueue = useAudioQueueStore((s) => s.setQueue);
  const setHudOpen = useAudioQueueStore((s) => s.setHudOpen);

  const filtered = useMemo(() => {
    let out = [...sessions];
    if (filter) {
      const q = filter.toLowerCase();
      out = out.filter((s) => s.title.toLowerCase().includes(q) || s.fileName.toLowerCase().includes(q));
    }
    if (sortBy === "duration") out.sort((a, b) => parseInt(b.durationLabel) - parseInt(a.durationLabel));
    else if (sortBy === "chunks") out.sort((a, b) => b.chunkCount - a.chunkCount);
    return out;
  }, [sessions, filter, sortBy]);

  const totalChunks = sessions.reduce((a, s) => a + s.chunkCount, 0);
  const [showNew, setShowNew] = useState(false);
  const setDocTitle = useSessionStore((s) => s.setDocTitle);
  const setFile = useSessionStore((s) => s.setFile);
  const setMode = useSessionStore((s) => s.setMode);

  return (
    <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-8 py-8 space-y-7">
      {/* metrics header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-[#E6DDD2]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-xs tracking-wider uppercase text-[#706159]">
            <span>Your Library</span><span className="text-[#D5C3BC]">/</span><span className="text-[#9B2F00] font-medium flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">headphones</span> Saved audios</span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#1C1513] tracking-tight">My Library</h1>
          <p className="text-sm text-[#706159]">{sessions.length} audio decks ready to listen — study anytime, even in the background</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#C2410C] to-[#EA580C] text-white font-mono text-xs font-semibold shadow-sm hover:shadow-md transition">
            <span className="material-symbols-outlined text-[16px]">add</span> New audio
          </button>
          <div className="flex items-center gap-3 bg-white/90 dark:bg-[#1b1816] backdrop-blur-md px-4 py-2 rounded-full border border-[#E5DDD2] dark:border-[#2d2723] shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Ready to play</span>
            <span className="text-[#E6DDD2] dark:text-[#2d2723]">|</span><span className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d]">{sessions.length} decks <span className="text-[#D5C3BC]">·</span> <strong className="text-[#1C1513] dark:text-[#f3ece7]">{totalChunks} topics</strong></span>
            <span className="text-[#E6DDD2] dark:text-[#2d2723]">|</span><span className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d]"><strong className="text-[#1C1513] dark:text-[#f3ece7]">1h 25m</strong> total</span>
          </div>
        </div>
      </div>

      {/* search + sort */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-[#F5EFE6]/80 dark:bg-[#1b1816]/80 backdrop-blur-md p-2.5 rounded-xl border border-[#E6DDD2] dark:border-[#2d2723]">
          <div className="md:col-span-7 flex items-center bg-white dark:bg-[#141211] px-3 py-2 rounded-lg border border-[#E2D8CC] dark:border-[#352e29] focus-within:border-[#EA580C] dark:focus-within:border-[#f97316] focus-within:ring-2 focus-within:ring-[#EA580C]/15 shadow-xs">
            <span className="material-symbols-outlined text-[#EA580C] text-[18px] mr-2">search</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by title or file name..." className="w-full bg-transparent text-sm text-[#1C1513] dark:text-[#e9e1dd] placeholder:text-[#9C8C84] focus:outline-none border-none p-0" />
            <kbd className="hidden sm:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#F5EFE6] dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] text-[#706159] dark:text-[#a78b7d]">⌘K</kbd>
          </div>
          <div className="md:col-span-5 flex items-center justify-end gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d] uppercase hidden sm:inline">Sort by</span>
              <div className="relative w-full sm:w-48">
                <select value={sortBy} onChange={(e) => setSort(e.target.value as any)} className="w-full appearance-none bg-white dark:bg-[#141211] text-[#2B211E] dark:text-[#e9e1dd] font-mono text-xs py-2 pl-3 pr-8 rounded-lg border border-[#E2D8CC] dark:border-[#352e29] shadow-xs">
                  <option value="recent">Most recent</option>
                  <option value="duration">Longest first</option>
                  <option value="chunks">Most topics</option>
                </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8D7168] pointer-events-none text-base">unfold_more</span>
            </div>
          </div>
        </div>
      </div>

      {/* grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((s, idx) => {
          const isActive = idx === 0;
          return (
            <article key={s.id} className={`group relative flex flex-col justify-between bg-white dark:bg-[#221e1b] rounded-xl border p-5 transition-all ${isActive ? "border-orange-300/80 dark:border-orange-500/40 shadow-[0_2px_12px_rgba(205,178,160,0.18)] hover:shadow-[0_8px_24px_rgba(234,88,12,0.12)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]" : "border-[#E5DDD2] dark:border-[#2d2723] shadow-sm hover:border-orange-200 dark:hover:border-orange-500/20"}`}>
              {isActive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-200 via-[#EA580C] to-orange-200 rounded-t-xl" />}
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] border flex items-center gap-1.5 ${isActive ? "bg-orange-50 dark:bg-[#341d13] text-[#9B2F00] dark:text-[#ffb690] border-orange-200/80 dark:border-orange-500/30" : "bg-[#FAF6F0] dark:bg-[#1a1715] text-[#706159] dark:text-[#a78b7d] border-[#E5DDD2] dark:border-[#352e29]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[#EA580C] animate-pulse" : "bg-[#904D00]"}`} /> {modeLabels[s.mode]}
                  </span>
                  <span className="font-mono text-xs text-[#706159] dark:text-[#a78b7d] flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-[#8D7168]">schedule</span>{s.lastStudied}</span>
                </div>
                <h2 className="font-serif text-xl text-[#1C1513] dark:text-[#f3ece7] group-hover:text-[#9B2F00] dark:group-hover:text-[#ffb690] leading-snug font-medium">{s.title}</h2>
                <div className="flex items-center gap-1.5 mt-2 font-mono text-xs text-[#706159] dark:text-[#a78b7d]"><span className="material-symbols-outlined text-[#8D7168] text-[14px]">description</span><span className="truncate max-w-[210px] text-[#2B211E] dark:text-[#e0c0b1] font-medium">{s.fileName}</span></div>
                <div className="mt-4 pt-3 border-t border-[#F0E8DE] dark:border-[#2d2723]">
                  <div className="flex items-center gap-1.5 font-mono text-xs text-[#706159] dark:text-[#a78b7d]"><span className="material-symbols-outlined text-[14px] text-[#8D7168]">schedule</span><span className="font-semibold text-[#1C1513] dark:text-[#e9e1dd]">{s.durationLabel}</span></div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#F0E8DE] dark:border-[#2d2723] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setQueue(s.chunks);
                      setHudOpen(true);
                    }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-xs font-semibold border transition-all ${isActive ? "bg-gradient-to-r from-[#EA580C] to-[#C2410C] text-white border-transparent shadow-sm" : "bg-[#FAF6F0] dark:bg-[#1a1715] text-[#1C1513] dark:text-[#e0c0b1] border-[#E5DDD2] dark:border-[#352e29] hover:border-orange-300 dark:hover:border-orange-500/30"}`}
                  >
                    <span className="material-symbols-outlined text-[16px] font-bold" style={{ color: isActive ? "white" : "#EA580C" }}>play_arrow</span>{isActive ? "Continue" : "Play"}
                  </button>
                  <button
                    onClick={() => {
                      loadFromSession(s);
                      onEdit();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FAF6F0] dark:bg-[#1a1715] hover:bg-[#F2EAE0] dark:hover:bg-[#25201d] text-[#2B211E] dark:text-[#e0c0b1] font-mono text-xs border border-[#E5DDD2] dark:border-[#352e29] dark:hover:border-orange-500/20"
                  >
                    <span className="material-symbols-outlined text-[15px] text-[#904D00]">edit</span>Edit
                  </button>
                </div>
                <button onClick={() => remove(s.id)} aria-label="Delete deck" className="p-2 rounded-lg text-[#8D7168] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"><span className="material-symbols-outlined text-[18px] block">delete</span></button>
              </div>
            </article>
          );
        })}
        {/* compile card — opens prototype modal */}
        <button onClick={() => setShowNew(true)} className="group relative flex flex-col items-center justify-center min-h-[300px] p-6 rounded-xl border-2 border-dashed border-[#EA580C]/40 dark:border-orange-500/30 hover:border-[#EA580C] dark:hover:border-[#f97316] bg-[#F5EFE6]/60 dark:bg-[#1a1714]/80 hover:bg-orange-50/50 dark:hover:bg-[#241c17] transition-all text-center shadow-xs">
          <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-[#8D7168]/50" />
          <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-[#8D7168]/50" />
          <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-[#8D7168]/50" />
          <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-[#8D7168]/50" />
          <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#1a1715] border border-orange-200 dark:border-orange-500/20 group-hover:border-[#EA580C] dark:group-hover:border-[#f97316] text-[#EA580C] grid place-items-center mb-4 shadow-sm group-hover:scale-105 transition"><span className="material-symbols-outlined text-[28px]">add</span></div>
          <span className="font-serif text-xl text-[#1C1513] dark:text-[#f3ece7] group-hover:text-[#9B2F00] dark:group-hover:text-[#ffb690] font-medium">Create new audio</span>
          <p className="text-xs text-[#706159] dark:text-[#a78b7d] max-w-[240px] mt-2 leading-relaxed">Turn PDFs, slides, or notes into audio you can listen to while you do other things</p>
          <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] text-[#9B2F00] dark:text-[#ffb690] bg-orange-100 dark:bg-[#341d13] border border-orange-300/80 dark:border-orange-500/30 px-3.5 py-1.5 rounded-full uppercase tracking-wider font-semibold">Get started <span className="material-symbols-outlined text-[14px] text-[#EA580C]">arrow_forward</span></span>
        </button>
      </div>

      <div className="mt-2 p-4 bg-white dark:bg-[#221e1b] rounded-xl border border-[#E6DDD2] dark:border-[#2d2723] flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 font-mono text-xs text-[#706159] dark:text-[#a78b7d]"><span className="material-symbols-outlined text-[#EA580C] text-[18px]">hard_drive</span>Storage used: <strong className="text-[#1C1513] dark:text-[#f3ece7]">142.6 MB</strong></div>
        <div className="flex gap-2"><button className="font-mono text-xs px-3 py-1.5 rounded-lg border bg-[#FAF6F0] dark:bg-[#1a1715] border-[#E2D8CC] dark:border-[#352e29] dark:text-[#e0c0b1]">Export all</button><button className="font-mono text-xs px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300">Clear unused audios</button></div>
      </div>

      <NewAudioModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreate={({ title, style, fileName }) => {
          // follow same sequence as Create tab: 1) upload → 2/3) title/style → editor shows gated sections
          setFile(fileName, "6.4 MB · 24 slides · PDF");
          setDocTitle(title);
          const map: Record<string, any> = { listen: "term-definition", quiz: "active-recall", tricks: "mnemonics" };
          setMode(map[style] ?? "term-definition");
          setShowNew(false);
          onEdit();
        }}
      />
    </div>
  );
}
