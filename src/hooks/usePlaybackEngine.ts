import { useEffect, useRef } from "react";
import { ttsAudioUrl, ttsTimings } from "../services/api";
import type { TtsWord } from "../services/api";
import { useAudioQueueStore } from "../stores/useAudioQueueStore";
import { useTtsStore } from "../stores/useTtsStore";
import { speakText, stopSpeech, pauseSpeech, resumeSpeech, cleanSpokenText } from "../utils/speech";

type Phase = "idle" | "speaking" | "paused" | "gap" | "gap-paused" | "waiting";

const MAX_TIMINGS = 50;

/**
 * Drives playback from the audio queue store. Mount exactly once.
 * Each chunk is spoken either by the natural voice (a rendered clip in an <audio> element) or by
 * the system voice (speech synthesis), decided when the chunk starts. If the natural voice is
 * still preparing the chunk, the engine waits. Chunk changes and replays arrive as `playToken`
 * bumps. Pausing keeps the position; a new speed applies at once to a clip, and a spoken chunk
 * is re-spoken from the current word.
 */
export function usePlaybackEngine() {
  const playToken = useAudioQueueStore((s) => s.playToken);
  const isPlaying = useAudioQueueStore((s) => s.isPlaying);
  const rate = useAudioQueueStore((s) => s.rate);

  const phase = useRef<Phase>("idle");
  const runId = useRef(0);
  const gapTimer = useRef<number | null>(null);
  // Character offset (in the chunk's cleaned text) of the word being spoken, and the rate it's spoken at.
  const spokenOffset = useRef(0);
  const spokenRate = useRef<number | null>(null);
  // Which voice is producing the current chunk.
  const voice = useRef<"system" | "natural">("system");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipId = useRef<string | null>(null);
  const unsubWait = useRef<(() => void) | null>(null);
  // A clip that fails to play is asked for again once; after that the chunk uses the system voice.
  const retried = useRef(false);
  const timings = useRef(new Map<string, TtsWord[]>());

  const getAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.preservesPitch = true;
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  const clearGap = () => {
    if (gapTimer.current) window.clearTimeout(gapTimer.current);
    gapTimer.current = null;
  };

  /** Silences both voices and clears every callback that could still fire for the old chunk. */
  const stopAll = () => {
    stopSpeech();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
    }
    unsubWait.current?.();
    unsubWait.current = null;
    if (useAudioQueueStore.getState().waiting) useAudioQueueStore.getState().setWaiting(false);
  };

  const startGap = (id: number) => {
    phase.current = "gap";
    const ms = Math.max(800, useAudioQueueStore.getState().pauseSec * 1000);
    gapTimer.current = window.setTimeout(() => {
      gapTimer.current = null;
      if (id !== runId.current) return;
      phase.current = "idle";
      useAudioQueueStore.getState().advance();
    }, ms);
  };

  const speakCurrent = (from = 0) => {
    const { queue, index, rate, setLiveSnippet } = useAudioQueueStore.getState();
    const chunk = queue[index];
    if (!chunk) return;
    const text = cleanSpokenText(chunk.text);
    const id = ++runId.current;
    voice.current = "system";
    phase.current = "speaking";
    spokenOffset.current = from;
    spokenRate.current = rate;
    if (from >= text.length) {
      stopSpeech();
      startGap(id);
      return;
    }
    speakText(
      text.slice(from),
      rate,
      () => {
        if (id === runId.current) startGap(id);
      },
      (charIndex) => {
        if (id !== runId.current) return;
        spokenOffset.current = from + charIndex;
        setLiveSnippet(text.slice(spokenOffset.current, spokenOffset.current + 40) + "…");
      }
    );
  };

  /** Shows the words being spoken, following the clip's own word timings. */
  const followCaptions = (audio: HTMLAudioElement, audioId: string, id: number) => {
    const attach = (words: TtsWord[]) => {
      if (id !== runId.current || !words.length) return;
      let last = -1;
      audio.ontimeupdate = () => {
        if (id !== runId.current) return;
        let i = -1;
        while (i + 1 < words.length && words[i + 1].start <= audio.currentTime) i++;
        if (i < 0 || i === last) return;
        last = i;
        useAudioQueueStore.getState().setLiveSnippet(
          words.slice(i, i + 7).map((w) => w.text).join(" ") + "…"
        );
      };
    };
    const known = timings.current.get(audioId);
    if (known) {
      attach(known);
      return;
    }
    ttsTimings(audioId)
      .then((t) => {
        timings.current.set(audioId, t.words);
        if (timings.current.size > MAX_TIMINGS) timings.current.delete(timings.current.keys().next().value as string);
        attach(t.words);
      })
      .catch(() => {
        // No captions; the player shows the chunk text instead.
      });
  };

  const onPlayRejected = (e: unknown, id: number) => {
    if (id !== runId.current) return;
    const name = (e as { name?: string })?.name;
    if (name === "AbortError") return; // superseded by a newer chunk
    if (name === "NotAllowedError") {
      // The browser wants a fresh click before it will play sound.
      useAudioQueueStore.getState().setPlaying(false);
      phase.current = "paused";
      return;
    }
    onClipError(id);
  };

  const playClip = (audioId: string, autoplay: boolean) => {
    const audio = getAudio();
    const { rate, setLiveSnippet } = useAudioQueueStore.getState();
    const id = ++runId.current;
    voice.current = "natural";
    clipId.current = audioId;
    phase.current = autoplay ? "speaking" : "paused";
    setLiveSnippet("");

    audio.onended = () => {
      if (id === runId.current) startGap(id);
    };
    audio.onerror = () => onClipError(id);
    const url = ttsAudioUrl(audioId);
    if (audio.src !== url) audio.src = url; // a replay of the same clip needs no new download
    // A new src resets playbackRate to the default, so set both.
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    audio.currentTime = 0;
    followCaptions(audio, audioId, id);
    if (autoplay) audio.play().catch((e) => onPlayRejected(e, id));
  };

  /** The clip couldn't be played: ask for it again once, then use the system voice for this chunk. */
  const onClipError = (id: number) => {
    if (id !== runId.current) return;
    const tts = useTtsStore.getState();
    const { queue, index, sourceKey } = useAudioQueueStore.getState();
    stopAll();
    if (!retried.current && clipId.current && tts.naturalFor(sourceKey) && queue[index]) {
      retried.current = true;
      // Treat the clip as not rendered; status polling notices if the file is really gone and prepares it again.
      tts.applyStatuses([{ audioId: clipId.current, status: "queued" }]);
      waitForClip();
    } else {
      speakCurrent();
    }
  };

  /** Nothing is audible until the natural voice has this chunk ready. Leaves as soon as it can. */
  const waitForClip = () => {
    const first = useAudioQueueStore.getState();
    const id = ++runId.current;
    phase.current = "waiting";
    first.setWaiting(true);
    useTtsStore.getState().prioritizeWindow(first.queue, first.index);

    const leave = () => {
      unsubWait.current?.();
      unsubWait.current = null;
      useAudioQueueStore.getState().setWaiting(false);
    };
    const decide = () => {
      if (id !== runId.current) return;
      const q = useAudioQueueStore.getState();
      const chunk = q.queue[q.index];
      if (!chunk) return;
      const tts = useTtsStore.getState();

      // Paused while waiting: don't start talking, the play button will start the chunk.
      const speakNow = () => {
        if (q.isPlaying) speakCurrent();
        else phase.current = "idle";
      };

      if (!tts.naturalFor(q.sourceKey)) {
        leave();
        speakNow(); // the narrator went away, or the user chose the system voice
        return;
      }
      const clip = tts.clipFor(chunk);
      if (clip?.status === "ready") {
        leave();
        playClip(clip.audioId, q.isPlaying); // paused while waiting: load it, wait for play
      } else if (clip?.status === "failed") {
        leave();
        if (!retried.current) {
          retried.current = true;
          void tts.prepare(q.queue, q.index);
          waitForClip();
        } else {
          speakNow();
        }
      }
    };
    unsubWait.current = useTtsStore.subscribe(decide);
    decide();
  };

  /** Starts the current chunk from the top, in whichever voice is right for it. */
  const startCurrent = () => {
    const { queue, index, sourceKey } = useAudioQueueStore.getState();
    const chunk = queue[index];
    if (!chunk) return;
    const tts = useTtsStore.getState();
    if (!tts.naturalFor(sourceKey) || !cleanSpokenText(chunk.text)) {
      speakCurrent();
      return;
    }
    const clip = tts.clipFor(chunk);
    if (clip?.status === "ready") playClip(clip.audioId, true);
    else waitForClip();
  };

  // Start the current chunk from the top whenever it changes or is replayed.
  useEffect(() => {
    retried.current = false;
    if (useAudioQueueStore.getState().isPlaying) startCurrent();
    return () => {
      runId.current++;
      clearGap();
      stopAll();
      phase.current = "idle";
    };
  }, [playToken]);

  // A clip changes speed at once. Speech can't change rate mid-utterance, so continue from the current word.
  useEffect(() => {
    if (voice.current === "natural") {
      const audio = audioRef.current;
      if (audio) {
        audio.defaultPlaybackRate = rate;
        audio.playbackRate = rate;
      }
      return;
    }
    if (spokenRate.current === null || spokenRate.current === rate) return;
    if (phase.current === "speaking") {
      speakCurrent(spokenOffset.current);
    } else if (phase.current === "paused") {
      // Drop the paused utterance; resuming re-speaks from the same word at the new rate.
      runId.current++;
      stopSpeech();
      spokenRate.current = rate;
    }
    // Between chunks the next one simply starts at the new rate.
  }, [rate]);

  useEffect(() => {
    if (isPlaying) {
      if (phase.current === "paused") {
        if (voice.current === "natural") {
          const id = runId.current;
          phase.current = "speaking";
          void audioRef.current?.play().catch((e) => onPlayRejected(e, id));
        } else if (window.speechSynthesis?.speaking) {
          resumeSpeech();
          phase.current = "speaking";
        } else {
          speakCurrent(spokenOffset.current);
        }
      } else if (phase.current === "gap-paused") {
        phase.current = "idle";
        useAudioQueueStore.getState().advance();
      } else if (phase.current === "idle") {
        startCurrent();
      }
      // Waiting needs nothing: the chunk starts when its clip is ready.
    } else if (phase.current === "speaking") {
      if (voice.current === "natural") audioRef.current?.pause();
      else pauseSpeech();
      phase.current = "paused";
    } else if (phase.current === "gap") {
      clearGap();
      phase.current = "gap-paused";
    }
  }, [isPlaying]);

  // Release the audio element's buffers when the app closes.
  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
    []
  );
}
