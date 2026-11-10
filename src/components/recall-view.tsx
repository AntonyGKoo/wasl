"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Mic,
  Square,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  ScanLine,
  FileText,
} from "lucide-react";
import { api } from "@/lib/client";
import type { Capabilities, Connection, Profile, SearchHit } from "@/lib/types";
import type { OcrLine } from "@/lib/card-text";
import { Avatar, Button, Modal, Notice } from "./ui";
import { micProblem, speechApi, type Recognizer } from "./voice-memory";
export function RecallView({
  capabilities,
  onOpen,
  contactCount,
}: {
  capabilities: Capabilities;
  onOpen: (contact: Connection) => void;
  contactCount: number;
}) {
  const [query, setQuery] = useState("");
  // with AI connected, search by meaning is on by default (it can be switched off)
  const [ai, setAi] = useState(capabilities.ai);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [resultMode, setResultMode] = useState("keyword");
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  useEffect(() => {
    setCanSpeak(!!speechApi());
    return () => recognizer.current?.stop();
  }, []);
  // ask by voice: what's said becomes the search, then it runs
  function listen() {
    const Speech = speechApi();
    if (!Speech) return;
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    setError("");
    const rec = new Speech();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let heard = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++)
        text += e.results[i][0].transcript;
      heard = text.trim();
      setQuery(heard);
    };
    rec.onerror = (e) => {
      const problem = micProblem(e.error);
      if (problem) setError(problem.replace("Type a note", "Type your search"));
    };
    rec.onend = () => {
      setListening(false);
      recognizer.current = null;
      if (heard.length >= 2) void search(undefined, heard);
    };
    recognizer.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("The microphone couldn't start. Type your search instead.");
    }
  }
  async function search(e?: FormEvent, value = query) {
    e?.preventDefault();
    if (value.trim().length < 2) return;
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const result = await api<{
        hits: SearchHit[];
        mode: string;
        warning: string;
      }>("search", "POST", { query: value, mode: ai ? "ai" : "keyword" });
      setHits(result.hits);
      setWarning(result.warning);
      setResultMode(result.mode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="page-intro">
        <div>
          <span className="eyebrow">SEARCH BY MEMORY, NOT BY NAME</span>
          <h1>A familiar story. A forgotten name.</h1>
          <p>Find the person through the things you remember.</p>
        </div>
        <span className="pill recall-pill">
          <Sparkles size={13} /> Recall
        </span>
      </section>
      <div className="recall-search-panel">
        <span className="recall-orb">
          <Sparkles size={25} />
        </span>
        <h2>Who are you thinking of?</h2>
        <p>Try a role, an event, a place or a conversation you saved.</p>
        <form onSubmit={search}>
          <div className="recall-input">
            <Search size={20} />
            <input
              aria-label="Search your memory"
              value={query}
              minLength={2}
              maxLength={400}
              required
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                listening
                  ? "Listening… say who you're looking for"
                  : "The software engineer I met at Web Summit…"
              }
            />
            {canSpeak ? (
              <button
                type="button"
                className={`icon-button voice-search ${listening ? "on" : ""}`}
                aria-label={listening ? "Stop listening" : "Ask by voice"}
                aria-pressed={listening}
                onClick={listen}
              >
                {listening ? <Square size={16} /> : <Mic size={18} />}
              </button>
            ) : null}
            <Button
              type="submit"
              busy={busy}
              disabled={query.trim().length < 2}
              aria-label="Find connections"
            >
              <ArrowRight size={19} />
            </Button>
          </div>
          {/* the AI option only appears once an AI key is connected, so nothing looks broken */}
          {capabilities.ai ? (
            <label className="checkbox-label ai-toggle">
              <input
                type="checkbox"
                checked={ai}
                onChange={(e) => setAi(e.target.checked)}
              />
              <span>Use AI to understand my memory</span>
            </label>
          ) : null}
          <p className="search-privacy">
            {ai
              ? "Your query and matching saved details are sent to OpenAI to find supported matches."
              : capabilities.ai
                ? "Keyword mode searches your saved details without sending them to an AI provider."
                : "Searches the details, notes and places you saved. Nothing leaves your account."}
          </p>
        </form>
        <div className="suggestions">
          {[
            "Who did I meet at Web Summit?",
            "Someone who works in cybersecurity",
            "The person who offered to review my CV",
          ].map((q) => (
            <button
              key={q}
              onClick={() => {
                setQuery(q);
                void search(undefined, q);
              }}
            >
              {q}
              <ArrowRight size={12} />
            </button>
          ))}
        </div>
      </div>
      {error ? <Notice error>{error}</Notice> : null}
      {warning ? <Notice>{warning}</Notice> : null}
      {hits !== null ? (
        <section className="recall-results">
          <div className="section-heading">
            <h2>
              {hits.length
                ? "People behind that memory"
                : "No matching saved memories"}
            </h2>
            <span className="muted small-copy">
              {resultMode === "ai"
                ? "AI matches · checked against your saved context"
                : "Matches from your saved details"}
            </span>
          </div>
          {!hits.length ? (
            <div className="empty-state small">
              <Search size={27} />
              {contactCount ? (
                <>
                  <h3>A little more context might help.</h3>
                  <p>
                    Try a word from their role, company, the event, or a note
                    you saved. Wasl only searches what you have saved.
                  </p>
                </>
              ) : (
                <>
                  <h3>You haven&rsquo;t saved anyone yet.</h3>
                  <p>
                    Add or scan a connection and a note about them first, then
                    find them here by what you remember.
                  </p>
                </>
              )}
            </div>
          ) : (
            hits.map((hit) => (
              <button
                className="recall-result"
                key={hit.connection.id}
                onClick={() => onOpen(hit.connection)}
              >
                <Avatar
                  name={hit.connection.profile.name || "Contact"}
                  photo={hit.connection.profile.photo}
                />
                <div>
                  <h3>{hit.connection.profile.name}</h3>
                  <p className="muted">
                    {[
                      hit.connection.profile.title,
                      hit.connection.profile.company,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <blockquote>
                    {hit.evidence.map((text, i) => (
                      <span key={i}>{text}</span>
                    ))}
                  </blockquote>
                  <span className="evidence-label">
                    <ShieldCheck size={12} /> From your saved context
                  </span>
                </div>
                <ArrowRight size={18} />
              </button>
            ))
          )}
        </section>
      ) : (
        <div className="recall-explainer">
          <ShieldCheck size={18} />
          <p>
            Your network stays yours. Results come from your own saved contacts
            and memories. Wasl does not search or scrape LinkedIn.
          </p>
        </div>
      )}
    </>
  );
}
export function ScanModal({
  capabilities,
  onClose,
  onDraft,
  own = false,
}: {
  capabilities: Capabilities;
  onClose: () => void;
  onDraft: (profile: Profile, byAi: boolean) => void;
  // scanning your own card to fill your profile
  own?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"photo" | "text">("photo");
  const [progress, setProgress] = useState("");
  // Card text from the phone or a paste: AI fills the fields when connected; the rules here
  // (which also know how big each line was printed) are the fallback.
  async function draftFrom(cardText: string, lines?: OcrLine[]) {
    const { parseCardText } = await import("@/lib/card-text");
    if (capabilities.ai) {
      setProgress("Wasl's AI is reading the details…");
      try {
        const result = await api<{ profile: Profile; mode: string }>(
          "scan-text",
          "POST",
          { text: cardText.slice(0, 16000) },
        );
        if (result.mode === "ai") return onDraft(result.profile, true);
      } catch {
        // fall back to the rules below
      }
    }
    onDraft(parseCardText(cardText, lines), false);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (tab === "photo" && !capabilities.ocr) {
        // no cloud OCR configured: read the card on this phone instead
        if (!file) throw new Error("Take or choose a photo of the card first.");
        const { readCardPhoto } = await import("@/lib/ocr");
        const read = await readCardPhoto(file, (status, share) =>
          setProgress(`${status} ${Math.round(share * 100)}%`),
        );
        if (read.text.replace(/[^A-Za-z0-9]/g, "").length < 4)
          throw new Error(
            "Couldn't read the card. Try again in good light with the card filling the photo, or paste its text.",
          );
        await draftFrom(read.text, read.lines);
      } else if (tab === "photo") {
        if (!file) throw new Error("Choose a card image first.");
        const form = new FormData();
        form.set("image", file);
        form.set("consent", String(consent));
        const result = await api<{
          profile: Profile;
          text: string;
          mode: string;
        }>("scan", "POST", form);
        onDraft(result.profile, result.mode === "ocr-ai");
      } else {
        await draftFrom(text);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <Modal
      title={own ? "Fill your profile from your card" : "Capture a connection"}
      description={
        own
          ? "Take a photo of your business card. You check every detail before saving."
          : "Review every detail before adding it to your network."
      }
      onClose={onClose}
    >
      <div className="auth-tabs">
        <button
          className={tab === "photo" ? "active" : ""}
          onClick={() => setTab("photo")}
        >
          <ScanLine size={14} /> Scan a photo
        </button>
        <button
          className={tab === "text" ? "active" : ""}
          onClick={() => setTab("text")}
        >
          <FileText size={14} /> Paste text
        </button>
      </div>
      <form onSubmit={submit}>
        {tab === "photo" ? (
          <>
            {capabilities.ocr ? (
              <>
                <label className="file-drop">
                  <Upload size={25} />
                  <strong>
                    {file ? file.name : "Choose a photo of the card"}
                  </strong>
                  <span>PNG or JPEG · up to 5 MB</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    required
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I can share this image with Google Cloud Vision
                    {capabilities.ai
                      ? " and its extracted text with OpenAI"
                      : ""}{" "}
                    to extract the contact details.
                  </span>
                </label>
                <p className="muted small-copy">
                  The image is processed in memory and is not stored by Wasl.
                </p>
              </>
            ) : (
              <>
                <label className="file-drop">
                  <Upload size={25} />
                  <strong>
                    {file ? file.name : "Take a photo of the card"}
                  </strong>
                  <span>Or choose one from your photos</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required
                  />
                </label>
                <p className="muted small-copy">
                  {progress ||
                    (capabilities.ai
                      ? "Wasl reads the card on this phone, so the photo never leaves it. Wasl's AI then sorts the words into fields, and you check every detail before saving."
                      : "Wasl reads the card on this phone. The photo never leaves it, and you check every detail before saving.")}
                </p>
              </>
            )}
          </>
        ) : (
          <div>
            <label htmlFor="card-text">
              Text from a business card, badge or profile
            </label>
            <textarea
              id="card-text"
              aria-describedby="card-text-help"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={16000}
              required
              placeholder={"Sara Smith\nsara@example.com\n+974 5555 1234"}
              rows={7}
            />
            <small id="card-text-help" className="muted">
              {capabilities.ai
                ? "Wasl's AI sorts the text into fields. You can fix and add details on the next screen."
                : "This option runs locally. You can add missing details on the next screen."}
            </small>
          </div>
        )}
        {error ? <Notice error>{error}</Notice> : null}
        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {own ? "Review my details" : "Review contact details"}{" "}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
