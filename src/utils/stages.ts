export type StageState = "done" | "partial" | "saving" | "device" | "none" | "system";
export type Stage = { state: StageState; label: string; hint: string };

/** Where a deck's content is saved: the server, or only this device. */
export function savedState(hasContent: boolean, isLocal: boolean): StageState {
  if (!hasContent) return "none";
  return isLocal ? "device" : "done";
}

/** Narrator progress for a deck: nothing to render with the system voice, else how many sections are rendered. */
export function audioStage(narratorActive: boolean, hasScript: boolean, ready: number, total: number): Stage {
  if (!narratorActive) {
    return { state: "system", label: "System voice", hint: "Plays instantly. Nothing to prepare." };
  }
  if (!hasScript || total === 0) return { state: "none", label: "Audio", hint: "Write the script first." };
  const state: StageState = ready >= total ? "done" : ready > 0 ? "partial" : "none";
  return {
    state,
    label: `Audio ${ready}/${total}`,
    hint:
      state === "done"
        ? "Every section is rendered and saved on this computer."
        : `${ready} of ${total} sections are rendered. The rest are prepared when you listen.`,
  };
}
