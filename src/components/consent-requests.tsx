"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import type { ConsentState } from "@/lib/types";
import { Button, Notice } from "./ui";

type Incoming = { id: string; asker_name: string; state: ConsentState };

// The other side of "Record the chat": someone you swapped cards with asks whether they may
// take notes of your chat, and the answer is yours, on your phone. While a recording you said
// yes to is going, a bar says so and has a Stop button.
//
// Wasl looks for questions every few seconds while it is open and being used, and right away
// when you come back to it.
export function ConsentRequests() {
  const [requests, setRequests] = useState<Incoming[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let used = Date.now();
    let gone = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      // nobody has touched Wasl for a while: stop asking until they do
      if (Date.now() - used > 20 * 60 * 1000) return;
      try {
        const data = await api<{ requests: Incoming[] }>("consents");
        if (!gone) setRequests(data.requests);
      } catch {}
    };
    const touched = () => {
      const idle = Date.now() - used > 20 * 60 * 1000;
      used = Date.now();
      if (idle) void check();
    };
    const back = () => {
      if (document.visibilityState !== "visible") return;
      used = Date.now();
      void check();
    };
    void check();
    const every = setInterval(check, 4000);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pointerdown", touched, true);
    window.addEventListener("keydown", touched, true);
    return () => {
      gone = true;
      clearInterval(every);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pointerdown", touched, true);
      window.removeEventListener("keydown", touched, true);
    };
  }, []);
  const asked = requests.find((r) => r.state === "asked");
  const live = requests.find((r) => r.state === "allowed");
  // a question takes the focus, so it can be answered from the keyboard or a screen reader
  useEffect(() => {
    if (!asked) return;
    panel.current?.focus();
    // While the question shows, it has the keyboard: Escape doesn't close a page open behind
    // it (only Allow or Don't allow answers), and Tab moves between its two buttons.
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(
        panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ||
          [],
      );
      if (!items.length) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? at <= 0
          ? items.length - 1
          : at - 1
        : at === -1 || at === items.length - 1
          ? 0
          : at + 1;
      items[next].focus();
    };
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
  }, [asked?.id]);
  async function answer(id: string, reply: "allow" | "decline" | "end") {
    setBusy(id + reply);
    setError("");
    try {
      const { consent } = await api<{ consent: { state: ConsentState } }>(
        `consents/${id}`,
        "POST",
        { answer: reply },
      );
      setRequests((all) =>
        all
          .map((r) => (r.id === id ? { ...r, state: consent.state } : r))
          .filter((r) => r.state === "asked" || r.state === "allowed"),
      );
    } catch (e) {
      setError((e as Error).message);
      // the question may have timed out or been taken back meanwhile
      setRequests((all) => all.filter((r) => r.id !== id));
    } finally {
      setBusy("");
    }
  }
  const first = (r: Incoming) => r.asker_name.split(" ")[0] || "Someone";
  return (
    <>
      {asked ? (
        <div className="consent-backdrop">
          <div
            ref={panel}
            className="consent-ask"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="consent-title"
            tabIndex={-1}
          >
            <span className="consent-icon" aria-hidden="true">
              <Mic size={20} />
            </span>
            <h2 id="consent-title">Can {first(asked)} record your chat?</h2>
            <p>
              {asked.asker_name} wants Wasl to take notes of your chat, on{" "}
              {first(asked)}&rsquo;s phone.
            </p>
            <ul>
              <li>
                Wasl writes down what&rsquo;s said and keeps only the key
                points, for {first(asked)} only.
              </li>
              <li>No audio is kept.</li>
              <li>You can stop it from your phone at any time.</li>
            </ul>
            {error ? <Notice error>{error}</Notice> : null}
            <div className="consent-actions">
              <Button
                variant="secondary"
                busy={busy === asked.id + "decline"}
                onClick={() => void answer(asked.id, "decline")}
              >
                Don&rsquo;t allow
              </Button>
              <Button
                busy={busy === asked.id + "allow"}
                onClick={() => void answer(asked.id, "allow")}
              >
                <ShieldCheck size={16} /> Allow
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {live && !asked ? (
        <div className="consent-live" role="status">
          <span className="rec-dot" aria-hidden="true" />
          <span>{first(live)} can take notes of your chat</span>
          <Button
            variant="secondary"
            busy={busy === live.id + "end"}
            onClick={() => void answer(live.id, "end")}
          >
            Stop
          </Button>
        </div>
      ) : null}
    </>
  );
}
