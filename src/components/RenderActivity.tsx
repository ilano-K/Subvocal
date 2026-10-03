import { useEffect, useRef, useState } from "react";
import { useTtsStore } from "../stores/useTtsStore";
import { formatBytes, formatEta, renderSecondsLeft } from "../utils/tts";

/**
 * Header icon for audio preparation, like a downloads button. Always visible: it pulses and shows a
 * count while the narrator is preparing decks, and its panel says what's going on in every state.
 * Everything comes from the backend (`health.activity`), so it also shows work queued before a reload.
 */
export default function RenderActivity({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const health = useTtsStore((s) => s.health);
  const reachable = useTtsStore((s) => s.reachable);
  const active = useTtsStore((s) => s.narratorActive());
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close the panel on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const decks = active ? health?.activity ?? [] : [];
  const busy = decks.length > 0;
  const now = decks.find((d) => d.currentTitle !== null) ?? decks[0];
  const left = health ? renderSecondsLeft(health) : null;

  const title = busy
    ? `Preparing audio · ${now.deckTitle}${now.currentIndex !== null ? ` · §${now.currentIndex + 1}/${now.total}` : ""}`
    : "Audio preparation";

  // What to say when nothing is being prepared.
  const idleMessage = !reachable
    ? "Can't reach Subvocal's local service."
    : !health
    ? "Checking…"
    : health.install.state !== "installed"
    ? "The natural voice isn't installed, so audio uses the system voice."
    : !health.settings.enabled
    ? "The natural voice is off, so audio uses the system voice."
    : health.state === "loading"
    ? "Starting the narrator…"
    : health.state === "degraded" || health.state === "failed"
    ? "The natural voice couldn't start. Audio uses the system voice."
    : "Nothing is being prepared.";

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={title}
        title={title}
        className={`relative w-7 h-7 grid place-items-center rounded-md border transition ${
          busy
            ? "bg-[#FFF7ED] dark:bg-[#2D211A] border-[#EA580C]/50 dark:border-[#F97316]/50 text-[#C2410C] dark:text-[#f97316]"
            : "bg-white dark:bg-[#1e1b19] border-[#E2D8CC] dark:border-[#352e29] text-[#6E5F57] dark:text-[#a78b7d] hover:text-[#C2410C] dark:hover:text-[#ffb690] hover:border-[#EA580C]/50"
        }`}
      >
        <span className={`material-symbols-outlined text-[16px] ${busy ? "animate-pulse" : ""}`}>graphic_eq</span>
        {busy && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-[#EA580C] text-white font-mono text-[9px] font-bold leading-[14px] text-center">
            {decks.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 rounded-lg bg-[#FBF9F5] dark:bg-[#181513] border border-[#E6DDD2] dark:border-[#2d2723] shadow-xl p-3 space-y-3 z-50">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">
            Natural-voice audio
          </p>

          {busy ? (
            <>
              {decks.map((d) => {
                const ready = Math.max(0, d.total - d.pending);
                return (
                  <div key={d.deckKey} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-sm text-[#1C1513] dark:text-[#f3ece7] truncate">{d.deckTitle}</span>
                      <span className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d] shrink-0">
                        {ready} / {d.total}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#EDE5DA] dark:bg-[#2d2723] overflow-hidden">
                      <div
                        className="h-full bg-[#C2410C] dark:bg-[#f97316] transition-all"
                        style={{ width: `${d.total ? (ready / d.total) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] truncate">
                      {d.currentTitle !== null ? `Now: §${(d.currentIndex ?? 0) + 1} ${d.currentTitle}` : "Waiting its turn"}
                    </p>
                  </div>
                );
              })}
              <p className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d] pt-1 border-t border-[#E6DDD2] dark:border-[#2d2723]">
                {left != null ? formatEta(left) : "Estimating time…"} · you can keep using the app
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[#2B211E] dark:text-[#e0c0b1]">{idleMessage}</p>
              {active && health && (
                <p className="font-mono text-[10px] text-[#706159] dark:text-[#a78b7d]">
                  Rendered audio on this computer: {formatBytes(health.cacheBytes)}
                </p>
              )}
              {!active && health && onOpenSettings && (
                <button
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings();
                  }}
                  className="font-mono text-[10px] underline text-[#C2410C] dark:text-[#ffb690] font-semibold"
                >
                  Open settings
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
