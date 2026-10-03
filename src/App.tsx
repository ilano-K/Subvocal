import { useState, useEffect } from "react";
import TopNav from "./components/TopNav";
import StudyWorkspace from "./components/StudyWorkspace";
import MyAudios from "./components/MyAudios";
import FloatingHUD from "./components/FloatingHUD";
import SettingsDialog from "./components/SettingsDialog";
import { useAudioQueueStore } from "./stores/useAudioQueueStore";
import { useSessionStore } from "./stores/useSessionStore";
import { startAutosave } from "./stores/autosave";
import { usePlaybackEngine } from "./hooks/usePlaybackEngine";
import { usePlayerShortcuts } from "./hooks/usePlayerShortcuts";
import { useTtsStatus } from "./hooks/useTtsStatus";
import { useTtsTriggers } from "./hooks/useTtsTriggers";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "./hooks/useTheme";
import { usePlayerWindowStore } from "./stores/usePlayerWindowStore";
import { dockPlayer, isTauri, playerWindowActions, startPlayerHost, startPlayerMirror } from "./services/playerBridge";

export default function App() {
  // The player window (desktop app), and a browser tab opened with ?hud=1, show the player and nothing else.
  const isHudWindow = new URLSearchParams(window.location.search).has("hud");
  return isHudWindow ? <PlayerWindow /> : <MainWindow />;
}

/** The pop-out player: mirrors the main window's player and sends its button presses back. */
function PlayerWindow() {
  useTheme();
  useEffect(() => startPlayerMirror(), []);
  const desktop = isTauri();

  // A frameless, see-through window: only the player card shows.
  useEffect(() => {
    if (!desktop) return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, [desktop]);

  // Drag the window from anywhere that isn't a control. Must start on the mouse press itself.
  const startDrag = (e: React.MouseEvent) => {
    if (!desktop || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, [role='button']")) return;
    void getCurrentWindow().startDragging();
  };

  return (
    <div
      onMouseDown={startDrag}
      className={`min-h-screen flex items-center justify-center p-4 ${desktop ? "bg-transparent" : "bg-[#F3EFEA] dark:bg-[#141211]"}`}
    >
      <FloatingHUD onExpand={playerWindowActions.focusMain} onDock={playerWindowActions.dock} />
    </div>
  );
}

function MainWindow() {
  const [view, setView] = useState<"workspace" | "library">("workspace");
  const hudOpen = useAudioQueueStore((s) => s.hudOpen);
  const hasQueue = useAudioQueueStore((s) => s.queue.length > 0);
  const isPlaying = useAudioQueueStore((s) => s.isPlaying);
  const setHudOpen = useAudioQueueStore((s) => s.setHudOpen);
  const resetSession = useSessionStore((s) => s.resetSession);
  const { dark, setMode: setThemeMode } = useTheme();
  const popped = usePlayerWindowStore((s) => s.popped);
  const [settingsOpen, setSettingsOpen] = useState(false);

  usePlaybackEngine();
  usePlayerShortcuts();
  useTtsStatus();
  useTtsTriggers();
  useEffect(() => startAutosave(), []);

  // Desktop app: lets the pop-out player window mirror this window's player and control it.
  useEffect(() => (isTauri() ? startPlayerHost() : undefined), []);

  // While the player is popped out into its own window it isn't shown here.
  const playerVisible = hudOpen && hasQueue && !popped;

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#141211] acoustic-grid">
      <TopNav
        view={view}
        onChangeView={setView}
        onToggleHud={() => (popped ? void dockPlayer() : setHudOpen(!hudOpen))}
        hudOpen={playerVisible || popped}
        hasQueue={hasQueue}
        isPlaying={isPlaying}
        dark={dark}
        onToggleDark={() => setThemeMode(dark ? "light" : "dark")}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {/* Bottom padding keeps the floating player from covering the page's last actions. */}
      <main className={`pt-11 ${playerVisible ? "pb-44" : ""}`}>
        {view === "workspace" ? (
          <StudyWorkspace onOpenLibrary={() => setView("library")} onOpenSettings={() => setSettingsOpen(true)} />
        ) : (
          <MyAudios
            onEdit={() => setView("workspace")}
            onNew={() => {
              resetSession();
              setView("workspace");
            }}
          />
        )}
      </main>

      {playerVisible && <FloatingHUD canPopOut={isTauri()} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
