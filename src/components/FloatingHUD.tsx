import { useEffect, useRef, useState } from "react";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { speakText, stopSpeech, pauseSpeech, resumeSpeech } from "../utils/speech";

export default function FloatingHUD({ onExpand }: { onExpand: () => void }) {
  const { queue, index, isPlaying, setPlaying, next, prev, repeat, rate, setRate, pauseSec } = useAudioQueueStore();
  const cur = queue[index];
  const nextChunk = queue[index + 1];
  const curConcept = cur?.title ?? "--";

  const [liveSnippet, setLiveSnippet] = useState("");
  const activeRunId = useRef(0);
  const pauseTimer = useRef<number | null>(null);

  // Natural continuous audio loop
  useEffect(() => {
    if (!cur || !isPlaying) {
      activeRunId.current++;
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
      stopSpeech();
      return;
    }

    const runId = ++activeRunId.current;
    const isCancelled = () => runId !== activeRunId.current || !useAudioQueueStore.getState().isPlaying;

    setLiveSnippet(cur.text);

    speakText(
      cur.text,
      rate,
      () => {
        if (isCancelled()) return;

        // Clean pause between chunks
        pauseTimer.current = window.setTimeout(() => {
          if (isCancelled()) return;
          const state = useAudioQueueStore.getState();
          if (state.repeatLeft > 1) {
            state.next();
          } else {
            if (state.index < queue.length - 1) {
              state.setIndex(state.index + 1);
            } else {
              setPlaying(false);
            }
          }
        }, Math.max(800, pauseSec * 1000));
      },
      (snippet) => {
        if (!isCancelled()) setLiveSnippet(snippet + "…");
      }
    );

    return () => {
      activeRunId.current++;
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
      stopSpeech();
    };
  }, [index, isPlaying, cur?.id, rate, pauseSec, queue.length]);

  const togglePlay = () => {
    if (isPlaying) {
      pauseSpeech();
      setPlaying(false);
    } else {
      if (window.speechSynthesis.paused) resumeSpeech();
      setPlaying(true);
    }
  };

  if (!queue.length) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(880px,95vw)]">
      <div className="bg-white dark:bg-[#1C1815] rounded-2xl border border-[#EA580C]/30 dark:border-[#483F38] shadow-[0_20px_40px_-10px_rgba(74,40,20,0.15)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] p-[16px] flex flex-col gap-2 ring-1 ring-[#EA580C]/20 dark:ring-[#F97316]/20">
        {/* Top telemetry bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-[#FFF7ED] dark:bg-[#2A221C] border border-[#EA580C]/60 dark:border-[#F97316]/40 flex items-center gap-2 px-2.5 py-1 rounded-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EA580C]" />
              </span>
              <span className="font-mono text-[10px] text-[#C2410C] dark:text-[#FFB690] font-semibold tracking-wider uppercase">
                {index + 1} of {queue.length} · {curConcept}
              </span>
            </div>

            <div className="bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] px-2.5 py-1 rounded-md flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px] text-[#C2410C] dark:text-[#FFB690]">
                menu_book
              </span>
              <span className="font-mono text-[10px] text-[#9B2F00] dark:text-[#D4C3BA] font-medium">
                Audiobook Narration
              </span>
            </div>

            <div className="bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] px-2 py-1 rounded-md hidden lg:flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C2410C] dark:bg-[#f97316] animate-pulse" />
              <span className="font-mono text-[10px] text-[#C2410C] dark:text-[#ffb690] font-semibold">
                Pause: {pauseSec}s
              </span>
            </div>
          </div>

          <button
            onClick={onExpand}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFF7ED] dark:bg-[#26201B] border border-[#FED7AA] dark:border-[#584237] hover:border-[#EA580C] dark:hover:border-[#F97316]/50 text-[#9B2F00] dark:text-[#F5F0EB] font-mono text-[10px]"
          >
            Back to library
            <span className="material-symbols-outlined text-[14px] text-[#EA580C] dark:text-[#FFB690]">
              open_in_full
            </span>
          </button>
        </div>

        {/* Live text */}
        <div className="px-1 my-1">
          <p className="font-serif text-[14px] sm:text-[15px] text-[#1C1513] dark:text-[#F5F0EB] leading-snug truncate">
            <span className="text-[#C2410C] dark:text-[#FFB690] font-mono text-[12px] font-semibold mr-2">
              §{index + 1}
            </span>
            “{liveSnippet || cur?.text || ""}”
          </p>
          {nextChunk && (
            <div className="flex items-center gap-2 text-[11px] text-[#786A64] dark:text-[#A78B7D] mt-1">
              <span className="font-mono text-[9px] uppercase bg-[#FFF7ED] dark:bg-[#2D211A] border border-[#EA580C]/40 dark:border-[#F97316]/40 px-1.5 py-[1px] rounded text-[#9B2F00] dark:text-[#FFB690] font-semibold">
                Up next
              </span>
              <span className="truncate dark:text-[#E0C0B1]">
                {nextChunk.title}
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 pt-2 border-t border-[#FED7AA] dark:border-[#383432]">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={prev}
              className="w-7 h-7 grid place-items-center rounded-md bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] text-[#9B2F00] dark:text-[#E0C0B1] hover:bg-[#FFEDD5] dark:hover:bg-[#2F2721] dark:hover:border-[#F97316]/60"
              title="Previous concept"
            >
              <span className="material-symbols-outlined text-[15px]">skip_previous</span>
            </button>
            <button
              onClick={togglePlay}
              className="w-8 h-8 grid place-items-center rounded-md bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white border border-[#FDBA74] dark:border-[#FFB690]/40 shadow"
            >
              {isPlaying ? (
                <span className="material-symbols-outlined text-[17px]">pause</span>
              ) : (
                <span className="material-symbols-outlined text-[17px]">play_arrow</span>
              )}
            </button>
            <button
              onClick={next}
              className="w-7 h-7 grid place-items-center rounded-md bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] text-[#9B2F00] dark:text-[#E0C0B1] hover:bg-[#FFEDD5] dark:hover:bg-[#2F2721] dark:hover:border-[#F97316]/60"
              title="Next concept"
            >
              <span className="material-symbols-outlined text-[15px]">skip_next</span>
            </button>
            <button
              onClick={repeat}
              className="h-7 px-2 flex items-center gap-1 rounded-md bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] text-[#9B2F00] dark:text-[#E0C0B1] hover:border-[#F97316]/60 font-mono text-[10px]"
              title="Repeat this concept"
            >
              <span className="material-symbols-outlined text-[13px] text-[#EA580C] dark:text-[#FFB690]">
                repeat
              </span>
              {cur?.reps}x
            </button>
            <div className="hidden sm:flex items-center bg-white dark:bg-[#241F1B] rounded-md border border-[#E2D8CC] dark:border-[#483F38] p-0.5 ml-1">
              {[0.9, 1, 1.15].map((r) => (
                <button
                  key={r}
                  onClick={() => setRate(r)}
                  className={`px-2 py-1 font-mono text-[10px] rounded ${
                    rate === r
                      ? "bg-[#C2410C] text-white font-bold"
                      : "text-[#706159] dark:text-[#A78B7D] hover:text-[#C2410C] dark:hover:text-[#FFB690]"
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>

          {/* Segmented chapter bar */}
          <div className="flex-1 flex flex-col gap-1 group">
            <div className="flex items-center gap-[3px] h-6">
              {queue.map((ch, i) => (
                <button
                  key={ch.id}
                  title={ch.title}
                  onClick={() => useAudioQueueStore.getState().setIndex(i)}
                  className={`flex-1 rounded-sm transition-all relative ${
                    i < index
                      ? "bg-[#EA580C] h-2"
                      : i === index
                      ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] h-3 ring-1 ring-[#FDBA74] dark:ring-[#FFB690] shadow"
                      : "bg-[#EFE8DF] dark:bg-[#2A2420] border border-[#FED7AA]/70 dark:border-[#3E342E] h-2 hover:bg-[#FED7AA] dark:hover:bg-[#382F28]"
                  }`}
                >
                  {i === index && <span className="absolute inset-0 bg-white/20 animate-pulse rounded-sm" />}
                </button>
              ))}
            </div>
            <div className="flex justify-between font-mono text-[9px] text-[#8D7168] dark:text-[#A78B7D]">
              <span className="text-[#C2410C] dark:text-[#FFB690] font-semibold">
                Topic {index + 1} of {queue.length}
              </span>
              <span className="tracking-widest uppercase text-[#9B2F00] dark:text-[#D4C3BA] font-semibold">
                CONTINUOUS AUDIOBOOK
              </span>
              <span className="dark:text-[#8D7168]">
                Pause: {pauseSec}s
              </span>
            </div>
          </div>

          <button
            onClick={() => setPlaying(false)}
            className="hidden sm:flex w-7 h-7 items-center justify-center rounded-md bg-white dark:bg-[#241F1B] border border-[#E2D8CC] dark:border-[#483F38] text-[#8D7168] dark:text-[#A78B7D] hover:text-rose-600 dark:hover:text-rose-300 dark:hover:bg-[#2F2721]"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
