import { useState, useEffect } from "react";
import TopNav from "./components/TopNav";
import StudyWorkspace from "./components/StudyWorkspace";
import MyAudios from "./components/MyAudios";
import FloatingHUD from "./components/FloatingHUD";
import { useAudioQueueStore } from "./stores/useAudioQueueStore";

export default function App() {
  const [view, setView] = useState<"workspace" | "library">("workspace");
  const hudOpen = useAudioQueueStore((s) => s.hudOpen);
  const setHudOpen = useAudioQueueStore((s) => s.setHudOpen);
  const [dark, setDark] = useState(false);

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

  // HUD can also be opened standalone via ?hud=1 for Tauri second window simulation
  const isHudWindow = new URLSearchParams(window.location.search).has("hud");

  if (isHudWindow) {
    return (
      <div className="min-h-screen bg-[#F3EFEA] dark:bg-[#141211] flex items-center justify-center p-4">
        <FloatingHUD onExpand={() => window.close()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#141211] acoustic-grid">
      <TopNav view={view} onChangeView={setView} onToggleHud={() => setHudOpen(!hudOpen)} hudOpen={hudOpen} dark={dark} onToggleDark={() => setDark((v) => !v)} />
      <main className="pt-11">
        {view === "workspace" ? <StudyWorkspace /> : <MyAudios onEdit={() => setView("workspace")} />}
      </main>

      {hudOpen && <FloatingHUD onExpand={() => { setHudOpen(false); setView("workspace"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </div>
  );
}
