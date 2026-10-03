import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  size?: "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
};

/** Shared dialog frame: backdrop, title bar, close on Escape / backdrop click / ✕, scrollable body. */
export default function Modal({ title, onClose, size = "md", children, footer }: Props) {
  // The parent passes a fresh onClose on every render; the mount-only effect below reads the latest one.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex flex-col rounded-xl bg-[#FBF9F5] dark:bg-[#181513] border border-[#E6DDD2] dark:border-[#2d2723] shadow-2xl ${
          size === "lg" ? "w-[min(900px,95vw)] max-h-[90vh]" : "w-full max-w-md max-h-[90vh]"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="font-serif italic text-lg text-[#C2410C]">{title}</h2>
          <button
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="w-7 h-7 grid place-items-center rounded-md text-[#6E5F57] hover:text-[#C2410C]"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto min-h-0 space-y-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[#E6DDD2] dark:border-[#2d2723] shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
