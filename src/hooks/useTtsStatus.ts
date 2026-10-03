import { useEffect } from "react";
import { useTtsStore } from "../stores/useTtsStore";
import { pollPlan } from "../utils/tts";

const planNow = () => {
  const s = useTtsStore.getState();
  return pollPlan({
    reachable: s.reachable,
    health: s.health,
    hasPendingClips: s.pendingIds().length > 0,
    expectingLoad: s.isExpectingLoad(),
  });
};

/**
 * The one polling loop for the narrator. Mount once. A single timeout chain (never an
 * interval, so requests can't overlap) that watches whatever is changing right now:
 * a download, the engine loading, or clips being rendered. It stops when nothing is.
 */
export function useTtsStatus() {
  useEffect(() => {
    let timer: number | null = null;
    let alive = true;
    let tick = 0;

    const schedule = () => {
      if (!alive || timer !== null) return;
      const plan = planNow();
      if (!plan) return;
      timer = window.setTimeout(run, plan.delayMs);
    };

    const run = async () => {
      timer = null;
      const plan = planNow();
      if (!plan) return;
      const store = useTtsStore.getState();
      if (plan.call === "status") {
        tick++;
        await store.pollStatuses();
        // Every third round, also look at health (render speed, what is being prepared, engine state).
        if (tick % 3 === 0) await store.refreshHealth();
      } else {
        await store.refreshHealth();
      }
      schedule();
    };

    void useTtsStore.getState().refreshHealth().then(schedule);
    // Something started changing while the loop was stopped (a clip was queued, a download began).
    const unsubscribe = useTtsStore.subscribe(schedule);

    return () => {
      alive = false;
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}
