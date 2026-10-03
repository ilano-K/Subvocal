import { useEffect, useRef, useState } from "react";
import { ttsAudioUrl } from "../services/api";
import Modal from "./Modal";
import ModelsSettings from "./ModelsSettings";
import { BTN_PRIMARY, BTN_QUIET, Spinner } from "./ui";
import { useThemeStore } from "../stores/useThemeStore";
import type { ThemeMode } from "../stores/useThemeStore";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { useTtsStore } from "../stores/useTtsStore";
import { formatBytes, formatEta, narratorView } from "../utils/tts";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const health = useTtsStore((s) => s.health);
  const reachable = useTtsStore((s) => s.reachable);
  const busy = useTtsStore((s) => s.busy);
  const lastError = useTtsStore((s) => s.lastError);
  const expectingLoad = useTtsStore((s) => s.isExpectingLoad());
  const store = useTtsStore.getState();

  const [tab, setTab] = useState<"general" | "models">("general");
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [alsoDeleteAudio, setAlsoDeleteAudio] = useState(false);
  // True while a preview clip is being prepared. The player for it is separate from the main playback engine.
  const [previewing, setPreviewing] = useState(false);
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const stopWatching = useRef<(() => void) | null>(null);
  useEffect(() => {
    useTtsStore.getState().clearError();
    void useTtsStore.getState().refreshHealth();
    return () => {
      stopWatching.current?.();
      previewAudio.current?.pause();
    };
  }, []);

  const playPreview = (audioId: string) => {
    // A preview must never run over the lesson that's playing.
    useAudioQueueStore.getState().setPlaying(false);
    previewAudio.current?.pause();
    const audio = new Audio(ttsAudioUrl(audioId));
    previewAudio.current = audio;
    void audio.play().catch(() => {});
  };

  // Asks for a sample, then plays it as soon as its clip is ready (it may already be).
  const startPreview = async (voice: string) => {
    setPreviewing(true);
    const audioId = await store.preview(voice);
    if (!audioId) {
      setPreviewing(false);
      return;
    }
    const settle = () => {
      const clip = useTtsStore.getState().clips[audioId];
      if (clip?.status === "ready") playPreview(audioId);
      else if (clip && clip.status !== "failed") return false;
      stopWatching.current = null;
      setPreviewing(false);
      return true;
    };
    if (settle()) return;
    const unsubscribe = useTtsStore.subscribe(() => {
      if (settle()) unsubscribe();
    });
    stopWatching.current = unsubscribe;
  };

  const view = narratorView(health, reachable, expectingLoad);
  const disabled = busy !== null;
  const install = health?.install;
  const settings = health?.settings;

  const renderBody = () => {
    switch (view) {
      case "checking":
        return (
          <p className="flex items-center gap-2 text-sm text-[#6E5F57] dark:text-[#a78b7d]">
            <Spinner /> Checking…
          </p>
        );

      case "unreachable":
        return (
          <div className="space-y-3">
            <p className="text-sm text-[#6E5F57] dark:text-[#a78b7d]">
              Can't reach Subvocal's local service. The system voice still works.
            </p>
            <button className={BTN_QUIET} onClick={() => void store.refreshHealth()}>
              Retry
            </button>
          </div>
        );

      case "download":
        return (
          <div className="space-y-3">
            <p className="text-sm text-[#2B211E] dark:text-[#e0c0b1]">
              <strong>Natural voice</strong>: a much more natural narrator that runs entirely on this computer.
            </p>
            <ul className="text-xs text-[#6E5F57] dark:text-[#a78b7d] space-y-1 list-disc pl-4">
              <li>Download: {formatBytes(install?.downloadBytes ?? 0)}</li>
              <li>Uses about 1.4 GB of memory while it's switched on</li>
              <li>Audio is prepared in the background, about twice as fast as you listen</li>
              <li>The system voice is used until it's ready</li>
            </ul>
            <button className={BTN_PRIMARY} disabled={disabled} onClick={() => void store.install()}>
              {busy === "install" && <Spinner />} Download natural voice
            </button>
          </div>
        );

      case "downloading": {
        const total = install?.totalBytes || install?.downloadBytes || 1;
        const done = install?.doneBytes ?? 0;
        const speed = install?.bytesPerSec ?? 0;
        const eta = speed > 0 ? formatEta((total - done) / speed) : null;
        return (
          <div className="space-y-3">
            <div
              className="h-2 rounded-full bg-[#EDE5DA] dark:bg-[#2d2723] overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round((done / total) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-[#C2410C] dark:bg-[#f97316] transition-all" style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
            </div>
            <p className="font-mono text-[11px] text-[#6E5F57] dark:text-[#a78b7d]">
              {formatBytes(done)} / {formatBytes(total)}
              {speed > 0 && ` · ${(speed / (1024 * 1024)).toFixed(1)} MB/s`}
              {eta && ` · ${eta}`}
            </p>
            <button className={BTN_QUIET} disabled={disabled} onClick={() => void store.cancelInstall()}>
              Cancel
            </button>
          </div>
        );
      }

      case "interrupted": {
        const cancelled = install?.state === "cancelled";
        return (
          <div className="space-y-3">
            <p className="text-sm text-[#6E5F57] dark:text-[#a78b7d]">
              {cancelled
                ? `Download paused at ${formatBytes(install?.doneBytes ?? 0)} / ${formatBytes(install?.totalBytes || install?.downloadBytes || 0)}.`
                : `Download failed: ${install?.error ?? "unknown error"}`}
            </p>
            <button className={BTN_PRIMARY} disabled={disabled} onClick={() => void store.install()}>
              {cancelled ? "Resume download" : "Retry"}
            </button>
          </div>
        );
      }

      case "setting_up":
        return (
          <p className="flex items-center gap-2 text-sm text-[#6E5F57] dark:text-[#a78b7d]">
            <Spinner /> Setting up narrator… (usually 10–30 s)
          </p>
        );

      case "broken":
        return (
          <div className="space-y-3">
            <p className="text-sm text-[#6E5F57] dark:text-[#a78b7d]">
              Natural voice couldn't start{health?.error ? `: ${health.error}` : "."} Using the system voice.
            </p>
            <div className="flex gap-2">
              <button
                className={BTN_QUIET}
                disabled={disabled}
                onClick={async () => {
                  await store.updateSettings({ enabled: false });
                  await useTtsStore.getState().updateSettings({ enabled: true });
                }}
              >
                Retry
              </button>
              <button className={BTN_QUIET} disabled={disabled} onClick={() => setConfirmRemove(true)}>
                Remove
              </button>
            </div>
          </div>
        );

      case "ready":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[#2B211E] dark:text-[#e0c0b1]">Use natural voice</span>
              <button
                role="switch"
                aria-checked={!!settings?.enabled}
                aria-label="Use natural voice"
                disabled={disabled}
                onClick={() => void store.updateSettings({ enabled: !settings?.enabled })}
                className={`relative w-10 h-5 rounded-full transition disabled:opacity-50 ${settings?.enabled ? "bg-[#C2410C] dark:bg-[#f97316]" : "bg-[#D9CFC3] dark:bg-[#3a322d]"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${settings?.enabled ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            {!settings?.enabled && (
              <p className="text-xs text-[#6E5F57] dark:text-[#a78b7d]">Off. New audio uses the system voice.</p>
            )}

            <div className="flex items-center gap-2">
              <select
                aria-label="Voice"
                value={settings?.voice}
                disabled={disabled}
                onChange={(e) => void store.updateSettings({ voice: e.target.value })}
                className="flex-1 h-8 px-2 rounded-md bg-white dark:bg-[#1e1b19] border border-[#E2D8CC] dark:border-[#352e29] text-sm text-[#2B211E] dark:text-[#e0c0b1]"
              >
                {health?.voices.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.name} · {v.grade}
                  </option>
                ))}
              </select>
              <button
                className={BTN_QUIET}
                aria-label="Play a sample of this voice"
                disabled={!settings?.enabled || disabled || previewing}
                onClick={() => settings && void startPreview(settings.voice)}
              >
                {previewing ? <Spinner /> : <span className="material-symbols-outlined text-[16px]">play_arrow</span>}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-[#6E5F57] dark:text-[#a78b7d]">
              <span>Rendered audio: {formatBytes(health?.cacheBytes ?? 0)}</span>
              <button className={BTN_QUIET} disabled={disabled || !health?.cacheBytes} onClick={() => void store.clearCache()}>
                Clear
              </button>
            </div>

            <div className="pt-3 border-t border-[#E6DDD2] dark:border-[#2d2723] flex items-center justify-between gap-3">
              <span className="text-[11px] text-[#6E5F57] dark:text-[#a78b7d]">Natural voice: Kokoro-82M (Apache-2.0)</span>
              <button className={BTN_QUIET} disabled={disabled} onClick={() => setConfirmRemove(true)}>
                Remove natural voice
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <Modal title="Settings" onClose={onClose} size={tab === "models" ? "lg" : "md"}>
      <div role="tablist" className="flex gap-1 p-1 rounded-lg bg-[#F5EFE6] dark:bg-[#100e0c] border border-[#E2D8CC] dark:border-[#2d2723]">
        {(
          [
            { id: "general", label: "General", icon: "tune" },
            { id: "models", label: "AI models", icon: "smart_toy" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md font-mono text-[11px] transition ${
              tab === t.id
                ? "bg-white dark:bg-[#25201C] text-[#C2410C] dark:text-[#f97316] shadow-sm font-semibold"
                : "text-[#6E5F57] dark:text-[#a78b7d] hover:text-[#C2410C]"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "models" ? (
        <ModelsSettings />
      ) : (
        <>
        <section className="space-y-3">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">Appearance</h3>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {(
              [
                { mode: "light", label: "Light", icon: "light_mode" },
                { mode: "dark", label: "Dark", icon: "dark_mode" },
                { mode: "system", label: "System", icon: "contrast" },
              ] as { mode: ThemeMode; label: string; icon: string }[]
            ).map((o) => (
              <button
                key={o.mode}
                role="radio"
                aria-checked={themeMode === o.mode}
                onClick={() => setThemeMode(o.mode)}
                className={`inline-flex items-center justify-center gap-1.5 h-9 rounded-md border font-mono text-[11px] transition ${
                  themeMode === o.mode
                    ? "bg-[#FFECE7] dark:bg-[#341d13] border-[#C2410C]/50 text-[#9B2F00] dark:text-[#ffb690] font-semibold"
                    : "bg-white dark:bg-[#1e1b19] border-[#E2D8CC] dark:border-[#352e29] text-[#6E5F57] dark:text-[#a78b7d] hover:border-[#EA580C]/50"
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">{o.icon}</span>
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#6E5F57] dark:text-[#a78b7d]">Remembered the next time you open Subvocal.</p>
        </section>

        <section className="space-y-3">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">Narrator</h3>
          {renderBody()}
        </section>

        {confirmRemove && (
          <div className="rounded-lg border border-[#E2D8CC] dark:border-[#352e29] p-3 space-y-3">
            <p className="text-sm text-[#2B211E] dark:text-[#e0c0b1]">Remove natural voice?</p>
            <label className="flex items-center gap-2 text-xs text-[#6E5F57] dark:text-[#a78b7d]">
              <input type="checkbox" checked={alsoDeleteAudio} onChange={(e) => setAlsoDeleteAudio(e.target.checked)} />
              Also delete rendered audio ({formatBytes(health?.cacheBytes ?? 0)})
            </label>
            <p className="text-xs text-[#6E5F57] dark:text-[#a78b7d]">Frees {formatBytes(install?.installedBytes ?? 0)}.</p>
            <div className="flex gap-2">
              <button
                className={BTN_PRIMARY}
                disabled={disabled}
                onClick={async () => {
                  await store.uninstall(alsoDeleteAudio);
                  setConfirmRemove(false);
                  setAlsoDeleteAudio(false);
                }}
              >
                Remove
              </button>
              <button className={BTN_QUIET} onClick={() => setConfirmRemove(false)}>
                Keep
              </button>
            </div>
          </div>
        )}

        {lastError && (
          <div className="flex items-start justify-between gap-2 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <span>{lastError}</span>
            <button onClick={() => store.clearError()} aria-label="Dismiss error" className="shrink-0">
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        )}
        </>
      )}
    </Modal>
  );
}
