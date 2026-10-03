import { create } from "zustand";
import {
  HttpError,
  llmAddProvider,
  llmClearActive,
  llmDeleteProvider,
  llmSetActive,
  llmSettings,
  llmTestProvider,
  llmUpdateProvider,
} from "../services/api";
import type { LlmKind, LlmProvider, LlmSettings, LlmTestResult } from "../services/api";

type ProviderInput = { kind: LlmKind; name?: string; baseUrl?: string; apiKey: string; models: string[] };
type ProviderPatch = { name?: string; baseUrl?: string; apiKey?: string; models?: string[] };

type LlmState = {
  settings: LlmSettings | null;
  loading: boolean;
  /** Last failure from a request, shown in the settings screen. */
  error: string | null;
  /** Result of the last "Test" per provider; "testing" while it runs. */
  tests: Record<string, LlmTestResult | "testing">;

  load: () => Promise<void>;
  /** Each action returns whether it worked (the reason is in `error` when it didn't). */
  addProvider: (input: ProviderInput) => Promise<LlmProvider | null>;
  updateProvider: (id: string, patch: ProviderPatch) => Promise<boolean>;
  removeProvider: (id: string) => Promise<boolean>;
  /** providerId null = go back to the model set on the server. */
  setActive: (providerId: string | null, model?: string) => Promise<boolean>;
  testProvider: (id: string, model?: string) => Promise<void>;
  clearError: () => void;
};

const message = (e: unknown) =>
  e instanceof HttpError && e.status === 0
    ? "Can't reach Subvocal's local service."
    : e instanceof Error
    ? e.message
    : "Something went wrong.";

export const useLlmStore = create<LlmState>((set, get) => {
  /** Runs a request, refreshes the list afterwards, and turns a failure into `error`. */
  const run = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    set({ error: null });
    try {
      const result = await fn();
      await get().load();
      return result;
    } catch (e) {
      set({ error: message(e) });
      return null;
    }
  };

  return {
    settings: null,
    loading: false,
    error: null,
    tests: {},

    load: async () => {
      set({ loading: true });
      try {
        set({ settings: await llmSettings(), loading: false });
      } catch (e) {
        set({ loading: false, error: message(e) });
      }
    },

    addProvider: (input) => run(() => llmAddProvider(input)),
    updateProvider: async (id, patch) => (await run(() => llmUpdateProvider(id, patch))) !== null,
    removeProvider: async (id) => {
      const ok = (await run(() => llmDeleteProvider(id))) !== null || get().error === null;
      set((s) => ({ tests: Object.fromEntries(Object.entries(s.tests).filter(([k]) => k !== id)) }));
      return ok;
    },

    setActive: async (providerId, model) => {
      const result = await run(() => (providerId ? llmSetActive(providerId, model ?? "") : llmClearActive()));
      return result !== null;
    },

    testProvider: async (id, model) => {
      set((s) => ({ tests: { ...s.tests, [id]: "testing" } }));
      try {
        const result = await llmTestProvider(id, model);
        set((s) => ({ tests: { ...s.tests, [id]: result } }));
      } catch (e) {
        set((s) => ({ tests: { ...s.tests, [id]: { ok: false, message: message(e), latencyMs: 0 } } }));
      }
    },

    clearError: () => set({ error: null }),
  };
});
