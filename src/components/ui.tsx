export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md bg-[#C2410C] dark:bg-[#f97316] dark:text-[#161311] text-white font-mono text-[11px] font-semibold uppercase tracking-wider shadow-sm hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_QUIET =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md bg-white dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] text-[#2B211E] dark:text-[#e0c0b1] font-mono text-[11px] font-semibold uppercase tracking-wider hover:border-[#EA580C]/50 transition disabled:opacity-50 disabled:cursor-not-allowed";
export const INPUT =
  "w-full h-8 px-2.5 rounded-md bg-white dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] text-sm text-[#2B211E] dark:text-[#e0c0b1] placeholder:text-[#a89a90] dark:placeholder:text-[#6f5f55] focus:outline-none focus:border-[#EA580C]/60";

export function Spinner() {
  return <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>;
}
