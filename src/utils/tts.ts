import type { TtsClipStatus, TtsHealth } from "../services/api";

/** Key for "this text in this voice": clips are looked up by it, never by chunk id (ids repeat across decks). */
export const clipKey = (voice: string, text: string) => `${voice}|${text}`;

export const isPendingStatus = (s: TtsClipStatus) => s === "queued" || s === "rendering";

export type PollInput = {
  reachable: boolean;
  health: TtsHealth | null;
  hasPendingClips: boolean;
  /** The narrator was just switched on or installed, so the engine is about to start loading. */
  expectingLoad: boolean;
};

export type PollPlan = { delayMs: number; call: "health" | "status" };

/** What to poll next and how soon, or null when nothing needs watching. First match wins. */
export function pollPlan(p: PollInput): PollPlan | null {
  if (!p.reachable) return { delayMs: 10_000, call: "health" };
  const installState = p.health?.install.state;
  if (installState === "downloading" || installState === "verifying") return { delayMs: 1000, call: "health" };
  if (p.hasPendingClips) return { delayMs: 1000, call: "status" };
  if (p.health?.state === "loading" || p.expectingLoad) return { delayMs: 2000, call: "health" };
  // The backend is still preparing audio this page doesn't track (queued before a reload, say).
  if (p.health?.state === "ready" && p.health.activity.length > 0) return { delayMs: 2000, call: "health" };
  return null;
}

export const pollDelayMs = (p: PollInput): number | null => pollPlan(p)?.delayMs ?? null;

export type NarratorView =
  | "checking"
  | "unreachable"
  | "download"
  | "downloading"
  | "interrupted" // a cancelled or failed download
  | "setting_up"
  | "ready"
  | "broken"; // the engine is degraded or failed

export function narratorView(health: TtsHealth | null, reachable: boolean, expectingLoad = false): NarratorView {
  if (!reachable) return "unreachable";
  if (!health) return "checking";
  const install = health.install.state;
  if (install === "downloading") return "downloading";
  if (install === "verifying") return "setting_up";
  if (install === "cancelled" || install === "failed") return "interrupted";
  if (install === "not_installed") return "download";
  // Installed from here on. Right after an install the engine still reports its old state.
  if (health.state === "loading" || health.state === "not_installed") return "setting_up";
  if (health.state === "degraded" || health.state === "failed") return "broken";
  if (health.state === "disabled" && health.settings.enabled && expectingLoad) return "setting_up";
  return "ready";
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatEta(sec: number): string {
  if (sec < 60) return `about ${Math.max(5, Math.round(sec / 5) * 5)} s left`;
  return `about ${Math.round(sec / 60)} min left`;
}

// Words per second of narration at normal speed (about 150 words a minute).
const WORDS_PER_SEC = 2.5;

/** Seconds of rendering left for everything queued, or null before the first render has been timed. */
export function renderSecondsLeft(h: TtsHealth): number | null {
  if (h.rtf == null) return null;
  return (h.pendingWords / WORDS_PER_SEC) * h.rtf;
}
