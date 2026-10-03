import type { Stage, StageState } from "../utils/stages";

const ICON: Record<StageState, string> = {
  done: "check_circle",
  partial: "timelapse",
  saving: "progress_activity",
  device: "cloud_off",
  none: "radio_button_unchecked",
  system: "volume_up",
};

const TONE: Record<StageState, string> = {
  done: "text-emerald-700 dark:text-emerald-400",
  partial: "text-[#C2410C] dark:text-[#f97316]",
  saving: "text-[#C2410C] dark:text-[#f97316]",
  device: "text-amber-800 dark:text-amber-300",
  none: "text-[#8D7168] dark:text-[#6f5f55]",
  system: "text-[#706159] dark:text-[#a78b7d]",
};

/** The three saves, in order: topics (extraction), script, audio. */
export default function SaveStages({ topics, script, audio }: { topics: Stage; script: Stage; audio: Stage }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]" aria-label="Save progress">
      {[topics, script, audio].map((st) => (
        <li key={st.label} title={st.hint} className={`flex items-center gap-1 ${TONE[st.state]}`}>
          <span className={`material-symbols-outlined text-[14px] ${st.state === "saving" ? "animate-spin" : ""}`}>
            {ICON[st.state]}
          </span>
          {st.label}
        </li>
      ))}
    </ul>
  );
}
