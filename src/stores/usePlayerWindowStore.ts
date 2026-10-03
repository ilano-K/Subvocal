import { create } from "zustand";

/** Desktop app only: whether the player is shown in its own always-on-top window instead of inside the app. */
export const usePlayerWindowStore = create<{ popped: boolean }>(() => ({ popped: false }));
