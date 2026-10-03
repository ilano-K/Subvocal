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
import { useThemeStore } from "./stores/useThemeStore";

export default function App() {
  // HUD can also be opened standalone via ?hud=1 for Tauri second window simulation
  const isHudWindow = new URLSearchParams(window.location.search).has("hud");

  if (isHudWindow) {
    return (
      <div className="min-h-screen bg-[#F3EFEA] dark:bg-[#141211] flex items-center justify-center p-4">
        <FloatingHUD onExpand={() => window.close()} />
      </div>
    );
  }

  return <MainWindow />;
}

function MainWindow() {
  const [view, setView] = useState<"workspace" | "library">("workspace");
  const hudOpen = useAudioQueueStore((s) => s.hudOpen);
  const hasQueue = useAudioQueueStore((s) => s.queue.length > 0);
  const isPlaying = useAudioQueueStore((s) => s.isPlaying);
  const setHudOpen = useAudioQueueStore((s) => s.setHudOpen);
  const resetSession = useSessionStore((s) => s.resetSession);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const dark = themeMode === "dark" || (themeMode === "system" && systemDark);
  const [settingsOpen, setSettingsOpen] = useState(false);

  usePlaybackEngine();
  usePlayerShortcuts();
  useTtsStatus();
  useTtsTriggers();
  useEffect(() => startAutosave(), []);

  // Follow the operating system while the theme is set to "System".
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const playerVisible = hudOpen && hasQueue;

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#141211] acoustic-grid">
      <TopNav
        view={view}
        onChangeView={setView}
        onToggleHud={() => setHudOpen(!hudOpen)}
        hudOpen={playerVisible}
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

      {playerVisible && <FloatingHUD />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
