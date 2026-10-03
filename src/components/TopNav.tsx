import { useTtsStore } from "../stores/useTtsStore";
import RenderActivity from "./RenderActivity";

type Props = {
  view: "workspace" | "library";
  onChangeView: (v: "workspace" | "library") => void;
  onToggleHud: () => void;
  hudOpen: boolean;
  // Something is loaded in the player (the toggle does nothing otherwise).
  hasQueue: boolean;
  isPlaying: boolean;
  dark: boolean;
  onToggleDark: () => void;
  onOpenSettings: () => void;
};

export default function TopNav({ view, onChangeView, onToggleHud, hudOpen, hasQueue, isPlaying, dark, onToggleDark, onOpenSettings }: Props) {
  const downloading = useTtsStore((s) => s.health?.install.state === "downloading");
  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-[#FBF9F5]/90 dark:bg-[#181513]/90 backdrop-blur-md border-b border-[#E6DDD2] dark:border-[#2d2723] shadow-sm">
      <div className="h-11 w-full px-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#C2410C] flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-white text-[16px]">menu_book</span>
            </div>
            <span className="font-serif italic font-medium text-base tracking-wide text-[#C2410C]">Subvocal</span>
          </div>
        </div>

        <nav className="flex items-center p-1 bg-[#F5EFE6] dark:bg-[#100e0c] rounded-full border border-[#E2D8CC] dark:border-[#2d2723] shadow-inner gap-1">
          <button
            onClick={() => onChangeView("workspace")}
            className={`font-mono text-[11px] tracking-tight px-3.5 py-1 rounded-full transition-all flex items-center gap-1.5 ${view === "workspace" ? "bg-gradient-to-r from-[#C2410C] to-[#EA580C] text-white shadow-md font-medium" : "text-[#6E5F57] hover:text-[#1C1513] dark:hover:text-white hover:bg-white/80 dark:hover:bg-[#25201C]"}`}
          >
            {view === "workspace" && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />} Create
          </button>
          <button
            onClick={() => onChangeView("library")}
            className={`font-mono text-[11px] tracking-tight px-3.5 py-1 rounded-full transition-all ${view === "library" ? "bg-gradient-to-r from-[#C2410C] to-[#EA580C] text-white shadow-md font-medium" : "text-[#6E5F57] hover:text-[#1C1513] dark:hover:text-white hover:bg-white/80 dark:hover:bg-[#25201C]"}`}
          >
            My Library
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <RenderActivity onOpenSettings={onOpenSettings} />
          <button
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
            className="relative w-7 h-7 grid place-items-center rounded-md bg-white dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] text-[#6E5F57] dark:text-[#a78b7d] hover:text-[#C2410C] dark:hover:text-[#ffb690] hover:border-[#EA580C]/50 transition"
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
            {downloading && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#EA580C] animate-pulse" />}
          </button>
          <button
            onClick={onToggleDark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            title={dark ? "Light mode" : "Dark mode"}
            className="w-7 h-7 grid place-items-center rounded-md bg-white dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] text-[#6E5F57] dark:text-[#a78b7d] hover:text-[#C2410C] dark:hover:text-[#ffb690] hover:border-[#EA580C]/50 transition"
          >
            <span className="material-symbols-outlined text-[16px]">{dark ? "light_mode" : "dark_mode"}</span>
          </button>
          <button
            onClick={onToggleHud}
            disabled={!hasQueue}
            aria-pressed={hudOpen}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${hudOpen ? "bg-[#C2410C] dark:bg-[#f97316] dark:text-[#161311] text-white border-[#C2410C] dark:border-[#f97316]" : "bg-white dark:bg-[#1e1b19] border-[#E2D8CC] dark:border-[#352e29] hover:border-[#EA580C]/50 text-[#2B211E] dark:text-[#e0c0b1]"}`}
            title={!hasQueue ? "Nothing to play yet — start listening to an audio first" : hudOpen ? "Hide player" : "Show player"}
          >
            <span className="material-symbols-outlined text-[14px]" style={{ color: hudOpen ? "white" : "#C2410C" }}>graphic_eq</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider">Player</span>
            {isPlaying && <span className={`w-1.5 h-1.5 rounded-full animate-pulse ml-1 ${hudOpen ? "bg-white" : "bg-[#EA580C]"}`} />}
          </button>
        </div>
      </div>
    </header>
  );
}
