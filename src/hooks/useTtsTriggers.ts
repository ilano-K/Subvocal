import { useEffect } from "react";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { useSessionStore } from "../stores/useSessionStore";
import { useTtsStore } from "../stores/useTtsStore";

/**
 * Starts rendering at the right moments by watching the stores, so every way of starting
 * playback is covered without touching the components. Mount once.
 */
export function useTtsTriggers() {
  useEffect(() => {
    const tts = () => useTtsStore.getState();

    // A script was written, or a deck was opened.
    let prevSession = useSessionStore.getState();
    const unsubSession = useSessionStore.subscribe((s) => {
      const prev = prevSession;
      prevSession = s;
      if (s.chunks === prev.chunks || !s.chunks.length) return;
      if (s.contentRev !== prev.contentRev) {
        tts().prepareCurrent(); // setScript: the whole script
      } else if (s.activeDeckId !== prev.activeDeckId) {
        tts().prepareCurrent({ sessionFirstOnly: true }); // loadDeck: only the start
      }
    });

    // Something started playing, or the player moved to another chunk.
    let prevQueue = useAudioQueueStore.getState();
    const unsubQueue = useAudioQueueStore.subscribe((q) => {
      const prev = prevQueue;
      prevQueue = q;
      if (q.sourceKey !== prev.sourceKey && q.sourceKey !== null) {
        tts().prepareCurrent();
      } else if (q.index !== prev.index && q.queue.length) {
        tts().prioritizeWindow(q.queue, q.index);
      }
    });

    return () => {
      unsubSession();
      unsubQueue();
    };
  }, []);
}
