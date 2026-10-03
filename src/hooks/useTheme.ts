import { useEffect, useState } from "react";
import { useThemeStore } from "../stores/useThemeStore";

/** Applies the chosen theme (light, dark, or follow the system) to the page. Returns whether it is dark. */
export function useTheme() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const dark = mode === "dark" || (mode === "system" && systemDark);

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

  return { dark, setMode };
}
