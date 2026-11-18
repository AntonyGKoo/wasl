"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  LoaderCircle,
  Mic,
  PenLine,
  ShieldCheck,
  ShieldX,
  Square,
} from "lucide-react";
import { api } from "@/lib/client";
import type { ConsentState } from "@/lib/types";
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

// Whether the other person can be asked: only someone on Wasl can say yes on their own phone.
export type CanAsk = "yes" | "no" | "sample";
type Phase =
  | "idle"
  | "blocked"
  | "asking"
  | "allowed"
  | "recording"
  | "summarizing"
  | "review";

// A yes or no from the other phone, or the request ending, ends the asking. Told to Wasl's
// server without waiting, also when the page is being closed.
function endConsent(id: string) {
  try {
    void fetch(`/api/consents/${id}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "end" }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function VoiceMemory({
  name,
  connectionId,
  canAsk,
  points,
  onPoints,
  savedKey,
  onTypeNote,
}: {
  name: string;
  connectionId: string;
  canAsk: CanAsk;
  // key points waiting to be saved: the page's one Save button saves them
  points: string;
  onPoints: (text: string) => void;
  // changes when the page has saved them
  savedKey: number;
  onTypeNote: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [byAi, setByAi] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const heard = useRef<string[]>([]);
  const recognizer = useRef<Recognizer | null>(null);
  const stopping = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const consent = useRef<string | null>(null);
  const first = name.split(" ")[0] || "them";

  function finishConsent() {
    if (consent.current) endConsent(consent.current);
    consent.current = null;
  }
  // leaving the page, or closing the person, ends any request or recording
  useEffect(() => {
    const leaving = () => finishConsent();
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("pagehide", leaving);
      stopping.current = true;
      recognizer.current?.stop();
      if (timer.current) clearInterval(timer.current);
      finishConsent();
    };
  }, []);
  // the page saved the key points
  useEffect(() => {
    if (savedKey && phase === "review") {
      setPhase("idle");
      setTranscript("");
      setMessage("");
    }
  }, [savedKey]);

  // While asking, and while recording, keep an eye on the other phone's answer: a no, no
  // answer, or Stop tapped on their phone all end it, and nothing is kept.
  useEffect(() => {
    if (!["asking", "allowed", "recording"].includes(phase)) return;
    const id = consent.current;
    if (!id) return;
    let gone = false;
    const check = async () => {
      let state: ConsentState;
      try {
        state = (
          await api<{ consent: { state: ConsentState } }>(`consents/${id}`)
        ).consent.state;
      } catch {
        return; // a missed check is tried again in a moment
      }
      if (gone || consent.current !== id) return;
      if (phase === "asking" && state === "allowed") setPhase("allowed");
      else if (state === "declined") {
        finishConsent();
        setPhase("idle");
        setMessage(`${first} said no, so nothing was recorded.`);
      } else if (state === "expired") {
        finishConsent();
        setPhase("idle");
        setMessage(
          `${first} didn't answer, so nothing was recorded. Ask again once ${first} has Wasl open.`,
        );
      } else if (state === "ended") {
        consent.current = null;
        if (phase === "recording") discard();
        setPhase("idle");
        setMessage(
          phase === "recording"
            ? `${first} stopped the recording on their phone, so nothing was kept.`
            : `${first} took back the yes, so nothing was recorded.`,
        );
      }
    };
    const every = setInterval(check, phase === "recording" ? 3000 : 2000);
    return () => {
      gone = true;
      clearInterval(every);
    };
  }, [phase]);

  async function ask() {
    setMessage("");
    if (canAsk !== "yes") {
      setPhase("blocked");
      return;
    }
    if (!speechApi()) {
      setMessage(
        "This browser can't turn speech into text. Open Wasl in Safari or Chrome, or type a note below.",
      );
      return;
    }
    setBusy(true);
    try {
      const { consent: asked } = await api<{ consent: { id: string } }>(
        `connections/${connectionId}/consent`,
        "POST",
        {},
      );
      consent.current = asked.id;
      setPhase("asking");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    finishConsent();
    setPhase("idle");
  }

  function start() {
    const Speech = speechApi();
    if (!Speech) {
      cancel();
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
  // the other person stopped it: what was heard is thrown away
  function discard() {
    stopping.current = true;
    if (timer.current) clearInterval(timer.current);
    try {
      recognizer.current?.stop();
    } catch {}
    recognizer.current = null;
    heard.current = [];
    setLive("");
  }

  async function stop(failed = false) {
    stopping.current = true;
    if (timer.current) clearInterval(timer.current);
    try {
      recognizer.current?.stop();
    } catch {}
    recognizer.current = null;
    // the yes was for this one recording
    finishConsent();
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
      onPoints(result.points.map((p) => `• ${p}`).join("\n"));
      setByAi(result.mode === "ai");
      setMessage(result.warning);
    } catch (e) {
      setByAi(false);
      onPoints(text);
      setMessage((e as Error).message);
    }
    setPhase("review");
  }

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="voice-memory">
      {phase === "idle" ? (
        <>
          <Button
            variant="secondary"
            className="full"
            busy={busy}
            onClick={() => void ask()}
          >
            <Mic size={16} /> Record the chat
          </Button>
          <p className="muted small-copy">
            {canAsk === "yes"
              ? `Wasl asks ${first} on their phone first. Only the key points are kept, no audio.`
              : canAsk === "sample"
                ? `${first} is a sample person, so there's no one to ask. Recording needs a real person on Wasl.`
                : `Recording works only when ${first} has Wasl and says yes on their own phone.`}
          </p>
        </>
      ) : null}
      {phase === "blocked" ? (
        <div className="voice-panel blocked" role="alert">
          <strong>
            <ShieldX size={16} />
            {canAsk === "sample"
              ? "Sample people can't say yes"
              : `${first} needs Wasl for this`}
          </strong>
          {canAsk === "sample" ? (
            <p>
              {first} is made up, so there&rsquo;s no one to ask and nothing
              will be recorded. To try recording, swap cards with a friend who
              has Wasl, then record from their page.
            </p>
          ) : (
            <p>
              For privacy, Wasl only records a chat when the other person has
              the Wasl app and says yes on their own phone. {first} isn&rsquo;t
              on Wasl, so nothing will be recorded. Type a note instead, or
              invite {first} to Wasl and swap cards.
            </p>
          )}
          <div className="voice-actions">
            <Button variant="secondary" onClick={() => setPhase("idle")}>
              Close
            </Button>
            <Button
              onClick={() => {
                setPhase("idle");
                onTypeNote();
              }}
            >
              <PenLine size={15} /> Type a note
            </Button>
          </div>
        </div>
      ) : null}
      {phase === "asking" ? (
        <div className="voice-panel" aria-live="polite">
          <strong>
            <LoaderCircle size={16} className="spin" /> Asking {first} on their
            phone…
          </strong>
          <p>
            Recording starts only after {first} taps Allow in Wasl. If they
            don&rsquo;t see it, ask them to open Wasl.
          </p>
          <div className="voice-actions">
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {phase === "allowed" ? (
        <div className="voice-panel agreed" aria-live="polite">
          <strong>
            <ShieldCheck size={16} /> {first} said yes
          </strong>
          <p>
            Wasl writes down what&rsquo;s said on this phone and keeps only the
            key points. {first} can stop it on their phone at any time.
          </p>
          <div className="voice-actions">
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            <Button onClick={start}>
              <Mic size={16} /> Start recording
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
              {byAi ? "Key points by Wasl's AI" : "Key points from your chat"}
            </span>
            <textarea
              value={points}
              onChange={(e) => onPoints(e.target.value)}
              maxLength={5000}
              rows={5}
            />
          </label>
          <p className="voice-hint">
            <Check size={14} /> Check them, then tap Save at the bottom.
          </p>
          <details className="voice-transcript">
            <summary>What Wasl heard</summary>
            <p>{transcript.replace(/\n/g, " ")}</p>
          </details>
          <div className="voice-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setPhase("idle");
                onPoints("");
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <Notice>{message}</Notice> : null}
    </div>
  );
}
