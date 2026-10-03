import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

// Before themes were a setting, only dark mode on/off was remembered under this key.
function legacyMode(): ThemeMode {
  try {
    return localStorage.getItem("subvocal-dark") === "1" ? "dark" : "light";
  } catch {
    return "light";
  }
}

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

/** Light, dark, or follow the system. Remembered across restarts. Defaults to light. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: legacyMode(),
      setMode: (mode) => set({ mode }),
    }),
    { name: "subvocal-theme" }
  )
);
