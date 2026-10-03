import { useShallow } from "zustand/react/shallow";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { useTtsStore } from "../stores/useTtsStore";
import { NARRATION_SPEEDS } from "../utils/speech";
import { popOutPlayer } from "../services/playerBridge";

type Props = {
  // Player window only: bring the main app window to the front. Also what makes this the window version.
  onExpand?: () => void;
  // Player window only: put the player back inside the app.
  onDock?: () => void;
  // Desktop app only: offer to move the player into its own window.
  canPopOut?: boolean;
};

export default function FloatingHUD({ onExpand, onDock, canPopOut }: Props) {
  const {
    queue,
    index,
    isPlaying,
    finished,
    repeatLeft,
    liveSnippet,
    waiting,
    togglePlay,
    next,
    prev,
    replay,
    setIndex,
    stop,
    setHudOpen,
    rate,
    stepRate,
    pauseSec,
  } = useAudioQueueStore();
  // Per-section render state for the readiness strip; null when the natural voice isn't in use.
  const readiness = useTtsStore(
    useShallow((s) => (s.narratorActive() ? queue.map((c) => s.clipFor(c)?.status ?? "none") : null))
  );
  const cur = queue[index];
  const nextChunk = queue[index + 1];
  const curConcept = cur?.title ?? "--";
  const pass = cur && cur.reps > 1 ? cur.reps - repeatLeft + 1 : null;

  if (!queue.length) return null;

  return (
    <div className={onExpand ? "w-full" : "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(880px,95vw)]"}>
      <div className="bg-white dark:bg-[#1C1815] rounded-2xl border border-[#EA580C]/30 dark:border-[#483F38] shadow-[0_20px_40px_-10px_rgba(74,40,20,0.15)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] p-[16px] flex flex-col gap-2 ring-1 ring-[#EA580C]/20 dark:ring-[#F97316]/20">
        {onExpand && (
          <div title="Drag anywhere on the player to move it" className="-mt-2 flex justify-center cursor-grab active:cursor-grabbing">
            <span className="material-symbols-outlined text-[16px] leading-none text-[#8D7168] dark:text-[#A78B7D] pointer-events-none">drag_handle</span>
          </div>
        )}
        {/* Top telemetry bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="bg-[#FFF7ED] dark:bg-[#2A221C] border border-[#EA580C]/60 dark:border-[#F97316]/40 flex items-center gap-2 px-2.5 py-1 rounded-md min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                {isPlaying && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75" />
                )}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EA580C]" />
              </span>
              <span className="font-mono text-[10px] text-[#C2410C] dark:text-[#FFB690] font-semibold tracking-wider uppercase truncate">
                {index + 1} of {queue.length} · {curConcept}
              </span>
            </div>

            {pass && (
              <div className="bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] px-2 py-1 rounded-md flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px] text-[#C2410C] dark:text-[#FFB690]">repeat</span>
                <span className="font-mono text-[10px] text-[#9B2F00] dark:text-[#D4C3BA] font-medium">
                  Pass {pass} of {cur.reps}
                </span>
              </div>
            )}

            <div className="bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] px-2 py-1 rounded-md hidden lg:flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-[#C2410C] dark:text-[#ffb690] font-semibold">
                Pause: {pauseSec}s
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onExpand ? (
              <>
                <button
                  onClick={onExpand}
                  title="Bring the app window to the front"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFF7ED] dark:bg-[#26201B] border border-[#FED7AA] dark:border-[#584237] hover:border-[#EA580C] dark:hover:border-[#F97316]/50 text-[#9B2F00] dark:text-[#F5F0EB] font-mono text-[10px]"
                >
                  Open app
                  <span className="material-symbols-outlined text-[14px] text-[#EA580C] dark:text-[#FFB690]">
                    open_in_full
                  </span>
                </button>
                {onDock && (
                  <button
                    onClick={onDock}
                    title="Put the player back inside the app"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FFF7ED] dark:bg-[#26201B] border border-[#FED7AA] dark:border-[#584237] hover:border-[#EA580C] dark:hover:border-[#F97316]/50 text-[#9B2F00] dark:text-[#F5F0EB] font-mono text-[10px]"
                  >
                    Dock
                    <span className="material-symbols-outlined text-[14px] text-[#EA580C] dark:text-[#FFB690]">
                      dock_to_bottom
                    </span>
                  </button>
                )}
              </>
            ) : (
              <>
                {canPopOut && (
                  <button
                    onClick={() => void popOutPlayer()}
                    title="Show the player in its own window that stays on top of other apps"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FFF7ED] dark:bg-[#26201B] border border-[#FED7AA] dark:border-[#584237] hover:border-[#EA580C] dark:hover:border-[#F97316]/50 text-[#9B2F00] dark:text-[#F5F0EB] font-mono text-[10px]"
                  >
                    Pop out
                    <span className="material-symbols-outlined text-[14px] text-[#EA580C] dark:text-[#FFB690]">
                      picture_in_picture_alt
                    </span>
                  </button>
                )}
                <button
                  onClick={() => setHudOpen(false)}
                  title="Hide the player — audio keeps playing. Reopen it from Player in the top bar."
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FFF7ED] dark:bg-[#26201B] border border-[#FED7AA] dark:border-[#584237] hover:border-[#EA580C] dark:hover:border-[#F97316]/50 text-[#9B2F00] dark:text-[#F5F0EB] font-mono text-[10px]"
                >
                  Hide
                  <span className="material-symbols-outlined text-[14px] text-[#EA580C] dark:text-[#FFB690]">
                    keyboard_arrow_down
                  </span>
                </button>
              </>
            )}
            <button
              onClick={stop}
              aria-label="Stop and close player"
              title="Stop and close"
              className="w-7 h-7 flex items-center justify-center rounded-md bg-white dark:bg-[#241F1B] border border-[#E2D8CC] dark:border-[#483F38] text-[#8D7168] dark:text-[#A78B7D] hover:text-rose-600 dark:hover:text-rose-300 dark:hover:bg-[#2F2721]"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>

        {/* Live text */}
        <div className="px-1 my-1">
          {finished ? (
            <p className="font-serif text-[14px] sm:text-[15px] text-[#1C1513] dark:text-[#F5F0EB] leading-snug">
              <span className="text-[#C2410C] dark:text-[#FFB690] font-mono text-[12px] font-semibold mr-2">✓</span>
              Finished all {queue.length} topics — press play to listen again from the start.
            </p>
          ) : waiting ? (
            <div className="flex items-center gap-3 min-w-0">
              <p className="font-serif text-[14px] sm:text-[15px] text-[#1C1513] dark:text-[#F5F0EB] leading-snug truncate">
                <span className="text-[#C2410C] dark:text-[#FFB690] font-mono text-[12px] font-semibold mr-2">
                  §{index + 1}
                </span>
                <span className="material-symbols-outlined text-[14px] align-middle animate-spin mr-1">progress_activity</span>
                Preparing this section in the natural voice…
              </p>
              <button
                onClick={() => useTtsStore.getState().systemVoiceForThisSession()}
                className="shrink-0 font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#EA580C]/40 text-[#9B2F00] dark:text-[#FFB690] hover:bg-[#FFF7ED] dark:hover:bg-[#2D211A]"
              >
                Use system voice
              </button>
            </div>
          ) : (
            <p className="font-serif text-[14px] sm:text-[15px] text-[#1C1513] dark:text-[#F5F0EB] leading-snug truncate">
              <span className="text-[#C2410C] dark:text-[#FFB690] font-mono text-[12px] font-semibold mr-2">
                §{index + 1}
              </span>
              “{liveSnippet || cur?.text || ""}”
            </p>
          )}
          {nextChunk && !finished && (
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
              title={onExpand ? "Previous topic" : "Previous topic (←)"}
              aria-label="Previous topic"
            >
              <span className="material-symbols-outlined text-[15px]">skip_previous</span>
            </button>
            <button
              onClick={togglePlay}
              title={(isPlaying ? "Pause" : finished ? "Play again from the start" : "Play") + (onExpand ? "" : " (Space)")}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-8 h-8 grid place-items-center rounded-md bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white border border-[#FDBA74] dark:border-[#FFB690]/40 shadow"
            >
              <span className="material-symbols-outlined text-[17px]">
                {isPlaying ? "pause" : finished ? "replay" : "play_arrow"}
              </span>
            </button>
            <button
              onClick={next}
              className="w-7 h-7 grid place-items-center rounded-md bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] text-[#9B2F00] dark:text-[#E0C0B1] hover:bg-[#FFEDD5] dark:hover:bg-[#2F2721] dark:hover:border-[#F97316]/60"
              title={onExpand ? "Next topic" : "Next topic (→)"}
              aria-label="Next topic"
            >
              <span className="material-symbols-outlined text-[15px]">skip_next</span>
            </button>
            <button
              onClick={replay}
              className="h-7 px-2 flex items-center gap-1 rounded-md bg-[#FFF7ED] dark:bg-[#241F1B] border border-[#FED7AA] dark:border-[#483F38] text-[#9B2F00] dark:text-[#E0C0B1] hover:border-[#F97316]/60 font-mono text-[10px]"
              title="Replay this topic from the start (R)"
            >
              <span className="material-symbols-outlined text-[13px] text-[#EA580C] dark:text-[#FFB690]">
                replay
              </span>
              Replay
            </button>
            <div className="hidden sm:flex items-center bg-white dark:bg-[#241F1B] rounded-md border border-[#E2D8CC] dark:border-[#483F38] p-0.5 ml-1">
              <button
                onClick={() => stepRate(-1)}
                disabled={rate <= NARRATION_SPEEDS[0]}
                aria-label="Slower"
                title="Slower (<)"
                className="w-6 h-6 grid place-items-center rounded text-[#706159] dark:text-[#A78B7D] hover:text-[#C2410C] dark:hover:text-[#FFB690] disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-[14px]">remove</span>
              </button>
              <span aria-live="polite" className="w-11 text-center font-mono text-[10px] font-bold text-[#C2410C] dark:text-[#FFB690]">
                {rate}x
              </span>
              <button
                onClick={() => stepRate(1)}
                disabled={rate >= NARRATION_SPEEDS[NARRATION_SPEEDS.length - 1]}
                aria-label="Faster"
                title="Faster (>)"
                className="w-6 h-6 grid place-items-center rounded text-[#706159] dark:text-[#A78B7D] hover:text-[#C2410C] dark:hover:text-[#FFB690] disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
              </button>
            </div>
          </div>

          {/* Segmented chapter bar */}
          <div className="flex-1 flex flex-col gap-1 group min-w-0">
            <div className="flex items-center gap-[3px] h-6">
              {queue.map((ch, i) => (
                <button
                  key={ch.id}
                  title={ch.title}
                  aria-label={`Jump to topic ${i + 1}: ${ch.title}`}
                  onClick={() => setIndex(i)}
                  className={`flex-1 rounded-sm transition-all relative ${
                    i < index || (finished && i === index)
                      ? "bg-[#EA580C] h-2"
                      : i === index
                      ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] h-3 ring-1 ring-[#FDBA74] dark:ring-[#FFB690] shadow"
                      : "bg-[#EFE8DF] dark:bg-[#2A2420] border border-[#FED7AA]/70 dark:border-[#3E342E] h-2 hover:bg-[#FED7AA] dark:hover:bg-[#382F28]"
                  }`}
                >
                  {i === index && isPlaying && <span className="absolute inset-0 bg-white/20 animate-pulse rounded-sm" />}
                  {readiness && readiness[i] !== "none" && (
                    <span
                      aria-hidden
                      className={`absolute bottom-0 inset-x-0 h-[3px] rounded-b-sm ${
                        readiness[i] === "ready"
                          ? "bg-emerald-500"
                          : readiness[i] === "failed"
                          ? "bg-rose-500"
                          : "bg-amber-400 animate-pulse"
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex justify-between gap-2 font-mono text-[9px] text-[#8D7168] dark:text-[#A78B7D]">
              <span className="text-[#C2410C] dark:text-[#FFB690] font-semibold shrink-0">
                Topic {index + 1} of {queue.length}
              </span>
              {!onExpand && <span className="hidden md:inline truncate">Space play/pause · ← → skip · R replay · &lt; &gt; speed</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
