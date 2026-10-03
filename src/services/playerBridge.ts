import type { Chunk } from "../data/mockData";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { usePlayerWindowStore } from "../stores/usePlayerWindowStore";
import { useTtsStore } from "../stores/useTtsStore";

/**
 * The desktop app can show the player in its own small always-on-top window. The main window keeps
 * playing the audio; the player window mirrors what is playing and sends back button presses. The two
 * windows share one address, so they talk over a BroadcastChannel. In a browser none of this runs.
 */

const CHANNEL = "subvocal-player";

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Snapshot = {
  sourceKey: string | null;
  index: number;
  isPlaying: boolean;
  finished: boolean;
  repeatLeft: number;
  liveSnippet: string;
  waiting: boolean;
  rate: number;
  pauseSec: number;
};

type Command =
  | { name: "toggle" | "next" | "prev" | "replay" | "stop" | "systemVoice" | "dock" | "focusMain" }
  | { name: "setIndex"; index: number }
  | { name: "stepRate"; dir: 1 | -1 };

type Message = { type: "hello" } | { type: "state"; state: Snapshot; queue?: Chunk[] } | { type: "command"; command: Command };

// ---------- Window control (main window) ----------

let hostPublish: ((full?: boolean) => void) | null = null;

async function windowByLabel(label: string) {
  const { Window } = await import("@tauri-apps/api/window");
  return Window.getByLabel(label);
}

/** Moves the player into its own window. */
export async function popOutPlayer(): Promise<void> {
  const hud = await windowByLabel("hud");
  if (!hud) return;
  usePlayerWindowStore.setState({ popped: true });
  hostPublish?.(true); // the window shows the current state the moment it appears
  await hud.show();
}

/** Brings the player back inside the app. */
export async function dockPlayer(): Promise<void> {
  usePlayerWindowStore.setState({ popped: false });
  useAudioQueueStore.getState().setHudOpen(true);
  const hud = await windowByLabel("hud");
  await hud?.hide();
  // The app window may have been closed while the player was popped out: bring it back.
  await focusMainWindow();
}

/** Stops from the player window: if the app window was closed meanwhile, there is nothing left to show, so quit. */
async function leaveAfterStop(): Promise<void> {
  const main = await windowByLabel("main");
  const hud = await windowByLabel("hud");
  usePlayerWindowStore.setState({ popped: false });
  await hud?.hide();
  if (main && !(await main.isVisible())) await main.close();
}

/** Brings the main app window to the front. */
export async function focusMainWindow(): Promise<void> {
  const main = await windowByLabel("main");
  if (!main) return;
  await main.unminimize();
  await main.show();
  await main.setFocus();
}

// ---------- Main window: publishes state, obeys commands ----------

export function startPlayerHost(): () => void {
  const channel = new BroadcastChannel(CHANNEL);
  let lastQueue: Chunk[] | null = null;
  let timer: number | null = null;

  const publish = (full = false) => {
    const q = useAudioQueueStore.getState();
    const state: Snapshot = {
      sourceKey: q.sourceKey,
      index: q.index,
      isPlaying: q.isPlaying,
      finished: q.finished,
      repeatLeft: q.repeatLeft,
      liveSnippet: q.liveSnippet,
      waiting: q.waiting,
      rate: q.rate,
      pauseSec: q.pauseSec,
    };
    // The sections only travel when they change; the rest is small.
    const queue = full || q.queue !== lastQueue ? q.queue : undefined;
    lastQueue = q.queue;
    channel.postMessage({ type: "state", state, queue } satisfies Message);
  };
  hostPublish = publish;

  // Tell the shell when closing the window should hide it to the tray instead of quitting.
  let keepAlive: boolean | null = null;
  const syncKeepAlive = () => {
    const value = useAudioQueueStore.getState().isPlaying || usePlayerWindowStore.getState().popped;
    if (value === keepAlive) return;
    keepAlive = value;
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_keep_alive", { value }));
  };
  const unsubKeepAlive = [useAudioQueueStore.subscribe(syncKeepAlive), usePlayerWindowStore.subscribe(syncKeepAlive)];
  syncKeepAlive();

  // Nothing is sent while the player is inside the app. Updates are grouped so captions don't flood the channel.
  const unsubscribe = useAudioQueueStore.subscribe(() => {
    if (!usePlayerWindowStore.getState().popped || timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      publish();
    }, 80);
  });

  channel.onmessage = (event: MessageEvent<Message>) => {
    const msg = event.data;
    if (msg.type === "hello") {
      publish(true);
      return;
    }
    if (msg.type !== "command") return;
    const q = useAudioQueueStore.getState();
    const c = msg.command;
    switch (c.name) {
      case "toggle":
        q.togglePlay();
        break;
      case "next":
        q.next();
        break;
      case "prev":
        q.prev();
        break;
      case "replay":
        q.replay();
        break;
      case "setIndex":
        q.setIndex(c.index);
        break;
      case "stepRate":
        q.stepRate(c.dir);
        break;
      case "stop":
        q.stop();
        useAudioQueueStore.getState().setHudOpen(false);
        void leaveAfterStop();
        break;
      case "systemVoice":
        useTtsStore.getState().systemVoiceForThisSession();
        break;
      case "dock":
        void dockPlayer();
        break;
      case "focusMain":
        void focusMainWindow();
        break;
    }
  };

  return () => {
    unsubscribe();
    unsubKeepAlive.forEach((u) => u());
    if (timer !== null) window.clearTimeout(timer);
    channel.close();
    hostPublish = null;
  };
}

// ---------- Player window: mirrors the state, sends commands ----------

function sendOnce(command: Command) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ type: "command", command } satisfies Message);
  channel.close();
}

/** Buttons in the player window that act on the app rather than on playback. */
export const playerWindowActions = {
  dock: () => sendOnce({ name: "dock" }),
  focusMain: () => sendOnce({ name: "focusMain" }),
};

export function startPlayerMirror(): () => void {
  const channel = new BroadcastChannel(CHANNEL);
  const send = (command: Command) => channel.postMessage({ type: "command", command } satisfies Message);

  // Here the buttons don't play anything; they ask the main window to.
  useAudioQueueStore.setState({
    togglePlay: () => send({ name: "toggle" }),
    next: () => send({ name: "next" }),
    prev: () => send({ name: "prev" }),
    replay: () => send({ name: "replay" }),
    setIndex: (index: number) => send({ name: "setIndex", index }),
    stepRate: (dir: 1 | -1) => send({ name: "stepRate", dir }),
    stop: () => send({ name: "stop" }),
    setHudOpen: () => {},
  });
  useTtsStore.setState({ systemVoiceForThisSession: () => send({ name: "systemVoice" }) });

  channel.onmessage = (event: MessageEvent<Message>) => {
    const msg = event.data;
    if (msg.type !== "state") return;
    useAudioQueueStore.setState({ ...msg.state, ...(msg.queue ? { queue: msg.queue } : {}) });
  };
  channel.postMessage({ type: "hello" } satisfies Message);

  // The window has no frame; closing it (Alt+F4) just puts the player back in the app.
  let unlistenClose: (() => void) | null = null;
  let stopped = false;
  if (isTauri()) {
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const unlisten = await getCurrentWindow().onCloseRequested((e) => {
        e.preventDefault();
        send({ name: "dock" });
      });
      if (stopped) unlisten();
      else unlistenClose = unlisten;
    });
  }

  return () => {
    stopped = true;
    unlistenClose?.();
    channel.close();
  };
}
