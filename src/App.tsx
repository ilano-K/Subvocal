import { useState, useEffect } from "react";
import TopNav from "./components/TopNav";
import StudyWorkspace from "./components/StudyWorkspace";
import MyAudios from "./components/MyAudios";
import FloatingHUD from "./components/FloatingHUD";
import { useAudioQueueStore } from "./stores/useAudioQueueStore";
import { useSessionStore } from "./stores/useSessionStore";
import { startAutosave } from "./stores/autosave";
import { usePlaybackEngine } from "./hooks/usePlaybackEngine";
import { usePlayerShortcuts } from "./hooks/usePlayerShortcuts";

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
  const [dark, setDark] = useState(false);

  usePlaybackEngine();
  usePlayerShortcuts();
  useEffect(() => startAutosave(), []);

  useEffect(() => {
    const saved = localStorage.getItem("subvocal-dark");
    // Default to light — only go dark if the user explicitly saved dark.
    // (Previously we respected prefers-color-scheme, which made light mode look dark on dark OS)
    const init = saved === "1";
    setDark(init);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("subvocal-dark", dark ? "1" : "0");
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
        onToggleDark={() => setDark((v) => !v)}
      />
      {/* Bottom padding keeps the floating player from covering the page's last actions. */}
      <main className={`pt-11 ${playerVisible ? "pb-44" : ""}`}>
        {view === "workspace" ? (
          <StudyWorkspace onOpenLibrary={() => setView("library")} />
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
    </div>
  );
}
