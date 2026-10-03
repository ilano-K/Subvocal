import { useEffect, useState } from "react";
import type { LlmKind, LlmProvider } from "../services/api";
import { useLlmStore } from "../stores/useLlmStore";
import { BTN_PRIMARY, BTN_QUIET, INPUT, Spinner } from "./ui";

const KINDS: { kind: LlmKind; label: string; icon: string; baseUrl: string; hint: string; models: string[] }[] = [
  { kind: "openai", label: "OpenAI", icon: "auto_awesome", baseUrl: "https://api.openai.com/v1", hint: "sk-…", models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"] },
  {
    kind: "gemini",
    label: "Google Gemini",
    icon: "diamond",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    hint: "AIza…",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
  { kind: "anthropic", label: "Anthropic", icon: "psychology", baseUrl: "https://api.anthropic.com/v1", hint: "sk-ant-…", models: ["claude-sonnet-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"] },
  { kind: "custom", label: "Custom (OpenAI-compatible)", icon: "dns", baseUrl: "", hint: "API key", models: [] },
];

const kindInfo = (kind: LlmKind) => KINDS.find((k) => k.kind === kind)!;

/** Add or edit a provider. When editing, a blank API key keeps the saved one. */
function ProviderForm({ provider, onDone }: { provider?: LlmProvider; onDone: () => void }) {
  const add = useLlmStore((s) => s.addProvider);
  const update = useLlmStore((s) => s.updateProvider);
  const [kind, setKind] = useState<LlmKind>(provider?.kind ?? "openai");
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? kindInfo("openai").baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(provider?.models ?? []);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const info = kindInfo(kind);

  const pickKind = (k: LlmKind) => {
    setKind(k);
    setBaseUrl(kindInfo(k).baseUrl);
    setModels([]);
  };

  const addModel = (value = draft) => {
    const m = value.trim();
    if (m && !models.includes(m)) setModels([...models, m]);
    setDraft("");
  };

  const save = async () => {
    const pending = draft.trim();
    const all = pending && !models.includes(pending) ? [...models, pending] : models;
    if (!provider && !apiKey.trim()) return setProblem("Paste an API key.");
    if (kind === "custom" && !baseUrl.trim()) return setProblem("A custom endpoint needs a base URL.");
    if (all.length === 0) return setProblem("Add at least one model name.");
    setProblem(null);
    setSaving(true);
    // Only a custom endpoint has a URL to choose; the other providers use their built-in one.
    const url = kind === "custom" ? baseUrl : undefined;
    const ok = provider
      ? await update(provider.id, { name, baseUrl: url, apiKey, models: all })
      : (await add({ kind, name, baseUrl: url, apiKey, models: all })) !== null;
    setSaving(false);
    if (ok) onDone();
    else setProblem(useLlmStore.getState().error ?? "Couldn't save.");
  };

  return (
    <div className="rounded-lg border border-[#E2D8CC] dark:border-[#352e29] p-4 space-y-3 bg-white/50 dark:bg-[#1b1816]">
      {!provider && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Provider type">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => pickKind(k.kind)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border font-mono text-[11px] transition ${
                kind === k.kind
                  ? "bg-[#FFECE7] dark:bg-[#341d13] border-[#C2410C]/50 text-[#9B2F00] dark:text-[#ffb690]"
                  : "bg-white dark:bg-[#1e1b19] border-[#E2D8CC] dark:border-[#352e29] text-[#6E5F57] dark:text-[#a78b7d]"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">{k.icon}</span>
              {k.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1 block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">Name</span>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={info.label} />
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">
            API key {provider && <span className="normal-case tracking-normal">(leave blank to keep the saved one)</span>}
          </span>
          <input
            className={INPUT}
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider?.hasKey ? `•••• ${provider.keyHint}` : info.hint}
          />
        </label>
      </div>

      {kind === "custom" && (
        <label className="space-y-1 block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">
            Base URL
          </span>
          <input
            className={INPUT}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-server.example.com/v1"
          />
        </label>
      )}

      <div className="space-y-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">Models</span>
        <div className="flex gap-2">
          <input
            className={INPUT}
            list={`models-${kind}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addModel();
              }
            }}
            placeholder="Type a model name and press Enter"
          />
          <datalist id={`models-${kind}`}>
            {info.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button className={BTN_QUIET} type="button" onClick={() => addModel()}>
            Add
          </button>
        </div>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-[#F7F3EE] dark:bg-[#25201d] border border-[#E2D8CC] dark:border-[#352e29] font-mono text-[11px] text-[#2B211E] dark:text-[#e0c0b1]">
                {m}
                <button onClick={() => setModels(models.filter((x) => x !== m))} aria-label={`Remove ${m}`} className="w-4 h-4 grid place-items-center rounded-full hover:bg-black/10">
                  <span className="material-symbols-outlined text-[12px]">close</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {problem && <p className="text-xs text-rose-700 dark:text-rose-300">{problem}</p>}
      <div className="flex gap-2">
        <button className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>
          {saving && <Spinner />} {provider ? "Save changes" : "Add provider"}
        </button>
        <button className={BTN_QUIET} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProviderCard({ provider }: { provider: LlmProvider }) {
  const remove = useLlmStore((s) => s.removeProvider);
  const test = useLlmStore((s) => s.testProvider);
  const result = useLlmStore((s) => s.tests[provider.id]);
  const active = useLlmStore((s) => s.settings?.active);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const info = kindInfo(provider.kind);

  if (editing) return <ProviderForm provider={provider} onDone={() => setEditing(false)} />;

  return (
    <div className="rounded-lg border border-[#E2D8CC] dark:border-[#352e29] p-4 space-y-2.5 bg-white/50 dark:bg-[#1b1816]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#C2410C] dark:text-[#f97316]">{info.icon}</span>
            <span className="font-serif text-base text-[#1C1513] dark:text-[#f3ece7] truncate">{provider.name}</span>
            {active?.providerId === provider.id && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/40">
                in use · {active.model}
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-[#706159] dark:text-[#a78b7d] truncate mt-0.5">
            {provider.kind === "custom" && `${provider.baseUrl} · `}
            {provider.hasKey ? `key •••• ${provider.keyHint}` : "no key"}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button className={BTN_QUIET} disabled={result === "testing" || provider.models.length === 0} onClick={() => void test(provider.id)}>
            {result === "testing" ? <Spinner /> : <span className="material-symbols-outlined text-[15px]">network_check</span>} Test
          </button>
          <button className={BTN_QUIET} onClick={() => setEditing(true)} aria-label={`Edit ${provider.name}`}>
            <span className="material-symbols-outlined text-[15px]">edit</span>
          </button>
          <button className={BTN_QUIET} onClick={() => setConfirming(true)} aria-label={`Delete ${provider.name}`}>
            <span className="material-symbols-outlined text-[15px]">delete</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {provider.models.length === 0 ? (
          <span className="text-xs text-[#706159] dark:text-[#a78b7d]">No models yet. Edit this provider to add one.</span>
        ) : (
          provider.models.map((m) => (
            <span key={m} className="inline-flex items-center h-6 px-2 rounded-full bg-[#F7F3EE] dark:bg-[#25201d] border border-[#E2D8CC] dark:border-[#352e29] font-mono text-[11px] text-[#2B211E] dark:text-[#e0c0b1]">
              {m}
            </span>
          ))
        )}
      </div>

      {result && result !== "testing" && (
        <p className={`text-xs flex items-start gap-1.5 ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-300"}`}>
          <span className="material-symbols-outlined text-[14px]">{result.ok ? "check_circle" : "error"}</span>
          {result.message}
        </p>
      )}

      {confirming && (
        <div className="flex items-center gap-2 text-xs text-[#2B211E] dark:text-[#e0c0b1]">
          Delete {provider.name} and its saved key?
          <button className={BTN_PRIMARY} onClick={() => void remove(provider.id)}>
            Delete
          </button>
          <button className={BTN_QUIET} onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      )}
    </div>
  );
}

export default function ModelsSettings() {
  const settings = useLlmStore((s) => s.settings);
  const loading = useLlmStore((s) => s.loading);
  const error = useLlmStore((s) => s.error);
  const setActive = useLlmStore((s) => s.setActive);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    useLlmStore.getState().clearError();
    void useLlmStore.getState().load();
  }, []);

  if (!settings) {
    return (
      <p className="flex items-center gap-2 text-sm text-[#6E5F57] dark:text-[#a78b7d]">
        {loading ? (
          <>
            <Spinner /> Loading…
          </>
        ) : (
          error ?? "Couldn't load your AI providers."
        )}
      </p>
    );
  }

  const choices = settings.providers.flatMap((p) => p.models.map((m) => ({ value: `${p.id}::${m}`, label: `${p.name} · ${m}` })));
  const current = settings.active ? `${settings.active.providerId}::${settings.active.model}` : "";

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">Model in use</h3>
        <select
          aria-label="Model in use"
          value={current}
          onChange={(e) => {
            const [providerId, ...rest] = e.target.value.split("::");
            void (e.target.value ? setActive(providerId, rest.join("::")) : setActive(null));
          }}
          className={INPUT}
        >
          <option value="">
            Default (server setting){settings.defaultModel ? ` · ${settings.defaultModel}` : " · not configured"}
          </option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-[#6E5F57] dark:text-[#a78b7d]">
          Used to find the topics in your files and to write your audio scripts.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#6E5F57] dark:text-[#a78b7d]">Providers</h3>
          {!adding && (
            <button className={BTN_PRIMARY} onClick={() => setAdding(true)}>
              <span className="material-symbols-outlined text-[15px]">add</span> Add provider
            </button>
          )}
        </div>
        {adding && <ProviderForm onDone={() => setAdding(false)} />}
        {settings.providers.length === 0 && !adding && (
          <p className="text-sm text-[#6E5F57] dark:text-[#a78b7d]">
            No providers yet. Add OpenAI, Google Gemini, Anthropic, or any OpenAI-compatible endpoint with your own API key.
          </p>
        )}
        {settings.providers.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
        <p className="text-[11px] text-[#6E5F57] dark:text-[#a78b7d]">
          Keys are saved on this computer by Subvocal's local service and are only sent to the provider you add them for.
        </p>
      </section>

      {error && (
        <div className="rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
