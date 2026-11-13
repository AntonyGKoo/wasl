"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Mic,
  Plus,
  Square,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  ScanLine,
  FileText,
} from "lucide-react";
import { api, shortDate } from "@/lib/client";
import type { Capabilities, Connection, Profile, SearchHit } from "@/lib/types";
import type { OcrLine } from "@/lib/card-text";
import { Avatar, Button, Modal, Notice } from "./ui";
import { micProblem, speechApi, type Recognizer } from "./voice-memory";
// "Note (2026-11-11): Offered to review our deck" → the words, plus where they came from
function describe(line: string) {
  const note = line.match(/^Note \((\d{4}-\d{2}-\d{2})\): ([\s\S]*)$/);
  if (note)
    return { quote: note[2], from: `Your note · ${shortDate(note[1])}` };
  const field = line.match(
    /^(Name|Role|Company|University|Email|Phone|About|Tags|Albums|Met at|Place|Met on): ([\s\S]*)$/,
  );
  if (!field) return { quote: line, from: "What you saved" };
  const [, label, value] = field;
  if (label === "Met on")
    return { quote: shortDate(value), from: "When you met" };
  const names: Record<string, string> = {
    Tags: "Your tags",
    Albums: "Your albums",
    "Met at": "Where you met",
    About: "Their card",
  };
  return {
    quote: value,
    from: names[label] || `Their card · ${label.toLowerCase()}`,
  };
}
// Example questions come from what this person has saved, so tapping one always finds someone.
const commonest = (values: string[]) => {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
function examplesFor(contacts: Connection[]) {
  const event = commonest(contacts.map((c) => c.event).filter(Boolean));
  const tag = commonest(contacts.flatMap((c) => c.tags));
  const company = contacts.find((c) => c.profile.company)?.profile.company;
  const role = contacts.find((c) => c.profile.title)?.profile.title;
  return [
    event ? `Who did I meet at ${event}?` : "",
    tag ? `People I tagged “${tag}”` : "",
    company
      ? `Someone who works at ${company}`
      : role
        ? `The ${role.toLowerCase()} I met`
        : "",
  ].filter(Boolean);
}
export function RecallView({
  capabilities,
  onOpen,
  contacts,
  onAdd,
  onScan,
  onChanged,
}: {
  capabilities: Capabilities;
  onOpen: (contact: Connection) => void;
  contacts: Connection[];
  onAdd: () => void;
  onScan: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const contactCount = contacts.length;
  const examples = examplesFor(contacts);
  const [adding, setAdding] = useState(false);
  async function addSamples() {
    setAdding(true);
    setError("");
    try {
      await api("sample-people", "POST");
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }
  const [query, setQuery] = useState("");
  // with AI connected, search by meaning is on by default (it can be switched off)
  const [ai, setAi] = useState(capabilities.ai);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [resultMode, setResultMode] = useState("keyword");
  // the answer (people, "no one matched" or a problem) appears under the search box; on a phone that
  // can be below the screen, so each finished search brings it into view
  const answerRef = useRef<HTMLDivElement>(null);
  const [answered, setAnswered] = useState(0);
  useEffect(() => {
    const el = answerRef.current;
    if (!answered || !el) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.55) return;
    const calm = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }, [answered]);
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
  // what the results on screen were a search for
  const [asked, setAsked] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
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
      // The box empties itself, ready for the next search; what was asked shows beside the
      // results. (If the search failed, the words stay so it can be tried again.)
      setAsked(value.trim());
      setQuery("");
      // on a phone, put the keyboard away so the results aren't hidden behind it
      if (window.matchMedia?.("(pointer: coarse)").matches)
        inputRef.current?.blur();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setAnswered((n) => n + 1);
    }
  }
  // nobody saved yet: say so, instead of a search box that can never find anyone
  if (!contactCount)
    return (
      <>
        <section className="page-intro">
          <div>
            <h1>Search</h1>
            <p>
              Find people by what you remember: what they do, where you met, or
              what you talked about.
            </p>
          </div>
        </section>
        <div className="empty-state search-empty">
          <span className="empty-icon">
            <Search size={28} />
          </span>
          <h3>There&rsquo;s no one to search yet.</h3>
          <p>
            Search looks through the people you save: their details, where you
            met and your notes. Save your first person, or add five sample
            people to see how it works.
          </p>
          <div className="row center">
            <Button variant="secondary" onClick={onScan}>
              <ScanLine size={16} /> Scan a card
            </Button>
            <Button onClick={onAdd}>
              <Plus size={16} /> Add someone
            </Button>
          </div>
          <button
            className="text-button"
            onClick={addSamples}
            disabled={adding}
          >
            {adding ? "Adding sample people…" : "Try it with sample people"}
          </button>
          {error ? <Notice error>{error}</Notice> : null}
        </div>
      </>
    );
  return (
    <>
      <section className="page-intro">
        <div>
          <h1>Search</h1>
          <p>
            Describe who you&rsquo;re looking for: what they do, where you met,
            or what you talked about.
          </p>
        </div>
      </section>
      <div className="recall-search-panel">
        <form onSubmit={search}>
          <div className="recall-input">
            <Search size={20} />
            <input
              ref={inputRef}
              aria-label="Search your memory"
              value={query}
              minLength={2}
              maxLength={400}
              required
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                listening
                  ? "Listening… say who you're looking for"
                  : "Describe someone…"
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
              ? "Your question and the saved details that might match are sent to OpenAI, which picks the people who fit."
              : capabilities.ai
                ? "With AI off, Wasl searches your saved details by keyword and sends nothing to an AI provider."
                : "Searches the details, notes and places you saved. Nothing leaves your account."}
          </p>
        </form>
        <div className="suggestions" aria-label="Examples from your network">
          {examples.map((q) => (
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
      <div ref={answerRef} className="recall-answer" aria-live="polite">
        {error ? <Notice error>{error}</Notice> : null}
        {warning ? <Notice>{warning}</Notice> : null}
        {hits !== null ? (
          <section className="recall-results">
            <div className="section-heading">
              <h2>{hits.length ? "Best matches" : "No one matched"}</h2>
              <span className="muted small-copy">
                {resultMode === "ai"
                  ? "Found by Wasl's AI in what you saved"
                  : "From what you saved"}
              </span>
            </div>
            {asked ? (
              <p className="asked">
                <span>
                  You searched for{" "}
                  <q>{asked.length > 80 ? `${asked.slice(0, 80)}…` : asked}</q>
                </span>
                {/* a long description shouldn't have to be typed again to fix one word */}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setQuery(asked);
                    inputRef.current?.focus();
                  }}
                >
                  Edit
                </button>
              </p>
            ) : null}
            {!hits.length ? (
              <div className="empty-state small">
                <Search size={27} />
                <h3>
                  None of your {contactCount} saved{" "}
                  {contactCount === 1 ? "person matches" : "people match"} that.
                </h3>
                <p>
                  Try a name, their role or company, the event, or a word from a
                  note you wrote. Wasl only searches what you have saved.
                </p>
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
                    {hit.evidence.map((text, i) => {
                      const { quote, from } = describe(text);
                      return (
                        <blockquote key={i}>
                          <span>&ldquo;{quote}&rdquo;</span>
                          <small className="evidence-label">{from}</small>
                        </blockquote>
                      );
                    })}
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))
            )}
          </section>
        ) : (
          <p className="recall-explainer">
            <ShieldCheck size={15} /> Wasl only searches what you saved. Nothing
            leaves your account unless AI search is on.
          </p>
        )}
      </div>
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
  // cardText: the words read off the card, when Wasl's rules (not AI) sorted them
  onDraft: (profile: Profile, byAi: boolean, cardText?: string) => void;
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
    onDraft(parseCardText(cardText, lines), false, cardText);
  }
  // Read a card photo on this phone, then sort its words into fields.
  async function readPhoto(photo: File) {
    setBusy(true);
    setError("");
    try {
      const { readCardPhoto } = await import("@/lib/ocr");
      const read = await readCardPhoto(photo, (status, share) =>
        setProgress(`${status} ${Math.round(share * 100)}%`),
      );
      if (read.text.replace(/[^A-Za-z0-9]/g, "").length < 4)
        throw new Error(
          "Couldn't read the card. Try again in good light with the card filling the photo, or paste its text.",
        );
      await draftFrom(read.text, read.lines);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  // A photo was taken or chosen: Wasl starts reading it right away, without another tap.
  function pick(chosen: File | null) {
    if (!chosen || busy) return;
    setFile(chosen);
    void readPhoto(chosen);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (tab === "photo" && !capabilities.ocr) {
      // no cloud OCR configured: the card is read on this phone (again, if the first try failed)
      if (file) void readPhoto(file);
      else setError("Take or choose a photo of the card first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (tab === "photo") {
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
      title={own ? "Fill your profile from your card" : "Scan a card"}
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
                {/* The big box opens the camera on a phone; the link under it opens the
                    photo library. Either way Wasl starts reading as soon as there is a photo. */}
                <label className={`file-drop ${busy ? "busy" : ""}`}>
                  <Upload size={25} />
                  <strong>
                    {busy
                      ? "Reading the card…"
                      : file
                        ? "Take the photo again"
                        : "Take a photo of the card"}
                  </strong>
                  <span>
                    {busy
                      ? "This takes a few seconds"
                      : "Wasl reads it as soon as you take it"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Take a photo of the card"
                    disabled={busy}
                    onChange={(e) => {
                      pick(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className={`text-button file-alt ${busy ? "busy" : ""}`}>
                  Or choose one from your photos
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={busy}
                    onChange={(e) => {
                      pick(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
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
          {tab === "photo" && !capabilities.ocr ? (
            // a photo is read as soon as it is taken; this button is only for a second try
            file ? (
              <Button type="submit" busy={busy}>
                Read it again
              </Button>
            ) : null
          ) : (
            <Button type="submit" busy={busy}>
              {own ? "Review my details" : "Review contact details"}{" "}
              <ArrowRight size={15} />
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
