"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Mic, ShieldCheck, Square } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Notice } from "./ui";

// The browser's speech-to-text (Safari and Chrome). Speech becomes text on the device side;
// Wasl never records or uploads audio, only the text is sent to make key points.
type SpeechEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
export type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
export const speechApi = () => {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognizer;
    webkitSpeechRecognition?: new () => Recognizer;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};
export const micProblem = (code: string) =>
  code === "not-allowed" || code === "service-not-allowed"
    ? "Microphone access is blocked. Allow it for this site in your phone's settings, or type a note instead."
    : code === "network"
      ? "Speech-to-text needs an internet connection. Type a note instead."
      : code === "audio-capture"
        ? "No microphone was found. Type a note instead."
        : "";

type Phase = "idle" | "consent" | "recording" | "summarizing" | "review";

export function VoiceMemory({
  name,
  onSave,
}: {
  name: string;
  onSave: (body: string) => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [points, setPoints] = useState("");
  const [transcript, setTranscript] = useState("");
  const [byAi, setByAi] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const heard = useRef<string[]>([]);
  const recognizer = useRef<Recognizer | null>(null);
  const stopping = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const first = name.split(" ")[0] || "them";
  useEffect(
    () => () => {
      stopping.current = true;
      recognizer.current?.stop();
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  function start() {
    const Speech = speechApi();
    if (!Speech) {
      setPhase("idle");
      setMessage(
        "This browser can't turn speech into text. Open Wasl in Safari or Chrome, or type a note below.",
      );
      return;
    }
    heard.current = [];
    stopping.current = false;
    setLive("");
    setMessage("");
    setSeconds(0);
    setPhase("recording");
    const began = Date.now();
    timer.current = setInterval(
      () => setSeconds(Math.floor((Date.now() - began) / 1000)),
      500,
    );
    const listen = () => {
      const rec = new Speech();
      rec.lang = navigator.language || "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript.trim();
          if (e.results[i].isFinal) {
            if (text) heard.current.push(text);
          } else interim += " " + text;
        }
        setLive((heard.current.join(" ") + interim).trim());
      };
      rec.onerror = (e) => {
        const problem = micProblem(e.error);
        if (problem) {
          setMessage(problem);
          void stop(true);
        }
      };
      // phones stop listening after a pause; keep going until Stop is tapped
      rec.onend = () => {
        if (!stopping.current) {
          try {
            listen();
          } catch {}
        }
      };
      recognizer.current = rec;
      try {
        rec.start();
      } catch {
        setMessage("The microphone couldn't start. Type a note instead.");
        void stop(true);
      }
    };
    listen();
  }

  async function stop(failed = false) {
    stopping.current = true;
    if (timer.current) clearInterval(timer.current);
    try {
      recognizer.current?.stop();
    } catch {}
    recognizer.current = null;
    if (failed) {
      setPhase("idle");
      return;
    }
    setPhase("summarizing");
    // give the recognizer a moment to hand over the last phrase
    await new Promise((r) => setTimeout(r, 900));
    // speech-to-text gives phrases without full stops: keep one phrase per line so each
    // can become its own key point
    const text = (heard.current.join("\n") || live).trim();
    if (text.split(/\s+/).length < 3) {
      setPhase("idle");
      setMessage(
        "Wasl didn't catch anything. Hold the phone closer and try again, or type a note.",
      );
      return;
    }
    setTranscript(text);
    try {
      const result = await api<{
        points: string[];
        warning: string;
        mode: string;
      }>("summarize", "POST", { transcript: text });
      setPoints(result.points.map((p) => `• ${p}`).join("\n"));
      setByAi(result.mode === "ai");
      setMessage(result.warning);
    } catch (e) {
      setByAi(false);
      setPoints(text);
      setMessage((e as Error).message);
    }
    setPhase("review");
  }

  async function save() {
    setBusy(true);
    try {
      await onSave(points.trim());
      setPhase("idle");
      setPoints("");
      setTranscript("");
      setMessage("Saved as a private note. Only you can see it.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="voice-memory">
      {phase === "idle" ? (
        <>
          <Button
            variant="secondary"
            className="full"
            onClick={() => {
              setMessage("");
              setPhase("consent");
            }}
          >
            <Mic size={16} /> Record the chat
          </Button>
          <p className="muted small-copy">
            Wasl writes down what&rsquo;s said and keeps only the key points. No
            audio is kept.
          </p>
        </>
      ) : null}
      {phase === "consent" ? (
        <div className="voice-panel">
          <strong>
            <ShieldCheck size={16} /> Ask {first} first
          </strong>
          <p>
            &ldquo;Is it okay if I take notes of our chat?&rdquo; Recording
            starts only when you both agree.
          </p>
          <div className="voice-actions">
            <Button variant="secondary" onClick={() => setPhase("idle")}>
              Cancel
            </Button>
            <Button onClick={start}>
              <Check size={16} /> We both agree
            </Button>
          </div>
        </div>
      ) : null}
      {phase === "recording" ? (
        <div className="voice-panel recording">
          <strong>
            <span className="rec-dot" aria-hidden="true" /> Listening · {clock}
          </strong>
          <p className="rec-live" aria-live="polite">
            {live || "Start talking. The words appear here."}
          </p>
          <Button className="full" onClick={() => void stop()}>
            <Square size={14} /> Stop and make key points
          </Button>
        </div>
      ) : null}
      {phase === "summarizing" ? (
        <div className="voice-panel">
          <strong>Picking out what mattered…</strong>
        </div>
      ) : null}
      {phase === "review" ? (
        <div className="voice-panel">
          <label>
            <span>
              {byAi ? "Key points by Wasl's AI" : "Key points"} · check and edit
              before saving
            </span>
            <textarea
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              maxLength={5000}
              rows={5}
            />
          </label>
          <details className="voice-transcript">
            <summary>What Wasl heard</summary>
            <p>{transcript.replace(/\n/g, " ")}</p>
          </details>
          <div className="voice-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setPhase("idle");
                setPoints("");
              }}
            >
              Discard
            </Button>
            <Button busy={busy} disabled={!points.trim()} onClick={save}>
              <Check size={16} /> Save key points
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <Notice>{message}</Notice> : null}
    </div>
  );
}
