import { useEffect } from "react";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";

/** In-app playback keys: Space play/pause, ←/→ previous/next topic, R replay, </> slower/faster. Ignored while typing. */
export function usePlayerShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const q = useAudioQueueStore.getState();
      if (!q.queue.length) return;

      switch (e.key) {
        case " ":
          if (e.repeat) break;
          if (!q.isPlaying) q.setHudOpen(true);
          q.togglePlay();
          break;
        case "ArrowRight":
          q.next();
          break;
        case "ArrowLeft":
          q.prev();
          break;
        case "<":
        case ",":
          q.stepRate(-1);
          break;
        case ">":
        case ".":
          q.stepRate(1);
          break;
        case "r":
        case "R":
          q.setHudOpen(true);
          q.replay();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
