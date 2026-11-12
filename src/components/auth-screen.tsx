"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  MapPin,
  ScanLine,
  Search,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import {
  blankProfile,
  fieldLabels,
  type Capabilities,
  type Profile,
  type ProfileField,
  type User,
} from "@/lib/types";
import { nameFromLink, tidyLink } from "@/lib/links";
import { dialogOpened } from "@/lib/history";
import { Brand, Button, Notice } from "./ui";
import { InstallApp } from "./install-app";
import { ScanModal } from "./recall-view";
import { presentationAccount } from "@/lib/presentation";

// where the first details of a new profile came from
export type StartedFrom = "card" | "linkedin";
// the details shown back to the person before they sign up (name and email sit in the form)
const shownFields: ProfileField[] = [
  "title",
  "company",
  "university",
  "phone",
  "linkedin",
  "instagram",
  "website",
];
const short = (field: ProfileField, value: string) =>
  field === "linkedin" || field === "instagram" || field === "website"
    ? value.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")
    : value;
function LinkedInMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.6h.06c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.38 2.5 4.38 5.75v5.6h-4v-4.96c0-1.18-.02-2.7-1.7-2.7-1.7 0-1.96 1.28-1.96 2.61v5.05H9.5v-11Z" />
    </svg>
  );
}
export function AuthScreen({
  onSignIn,
  capabilities,
  returnTo,
  presentation = false,
  signedOut = false,
}: {
  // "card" or "linkedin" when the new profile was filled from one, so the app can show it
  onSignIn: (from?: StartedFrom) => void;
  capabilities: Capabilities;
  returnTo?: string;
  presentation?: boolean;
  // the session ended while the app was open
  signedOut?: boolean;
}) {
  // Someone arriving to save a card, or signed out mid-way, goes straight to the form.
  // Everyone else starts at the welcome page: scan your card, LinkedIn, email, or sign in.
  const direct = Boolean(returnTo || signedOut);
  const [step, setStep] = useState<"welcome" | "form" | "linkedin">(
    direct ? "form" : "welcome",
  );
  const [mode, setMode] = useState<"register" | "login">(
    signedOut ? "login" : "register",
  );
  // signing up with an email that already has an account: offer to sign in instead
  const [taken, setTaken] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // details read from the person's own card (or their LinkedIn link), saved once they sign up
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<Profile | null>(null);
  const [from, setFrom] = useState<StartedFrom | null>(null);
  const [cardText, setCardText] = useState("");
  const [linkedin, setLinkedin] = useState("");
  function startOver() {
    // what the card or link filled in goes too; what the person typed themselves stays
    if (found?.name && name === found.name) setName("");
    if (found?.email && email === found.email) setEmail("");
    setFound(null);
    setFrom(null);
    setCardText("");
    setError("");
    setTaken(false);
    setStep("welcome");
  }
  const over = useRef(startOver);
  over.current = startOver;
  // the phone's Back button returns to the welcome page (and starts over, like the Back link)
  // instead of leaving Wasl
  const deeper = !direct && step !== "welcome";
  useEffect(() => {
    if (!deeper) return;
    return dialogOpened(() => over.current());
  }, [deeper]);
  function open(next: "register" | "login") {
    setMode(next);
    setError("");
    setTaken(false);
    setStep("form");
  }
  function fromCard(profile: Profile, text: string) {
    setScanning(false);
    const details = { ...blankProfile, ...profile, photo: undefined };
    setFound(details);
    setFrom("card");
    setCardText(text);
    if (details.name) setName(details.name);
    if (details.email) setEmail(details.email);
    open("register");
  }
  function fromLinkedin(e: FormEvent) {
    e.preventDefault();
    const link = tidyLink("linkedin", linkedin);
    let valid = false;
    try {
      const url = new URL(link);
      valid =
        /(^|\.)linkedin\.com$/i.test(url.hostname) &&
        /^\/in\/[^/]+/.test(url.pathname);
    } catch {
      // not a link at all
    }
    if (!valid) {
      setError(
        "That doesn’t look like a LinkedIn profile link. It usually looks like linkedin.com/in/yourname.",
      );
      return;
    }
    const guess = nameFromLink(link);
    setFound({ ...blankProfile, linkedin: link, name: guess });
    setFrom("linkedin");
    setCardText("");
    if (guess && !name) setName(guess);
    open("register");
  }
  async function openPresentation() {
    setBusy(true);
    setError("");
    try {
      await api<{ user: User }>("auth/login", "POST", presentationAccount);
      if (returnTo) window.location.assign(returnTo);
      else onSignIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // After signing up: put what the card (or LinkedIn link) gave onto the new profile.
  // Never stops the sign-up; if it fails the person fills their profile the usual way.
  async function saveFound(details: Profile): Promise<boolean> {
    try {
      let profile = details;
      if (cardText && capabilities.ai) {
        // now that there is an account, Wasl's AI can sort the card's words more carefully
        const better = await Promise.race([
          api<{ profile: Profile; mode: string }>("scan-text", "POST", {
            text: cardText.slice(0, 16000),
          }).catch(() => null),
          new Promise<null>((done) => setTimeout(() => done(null), 7000)),
        ]);
        if (better?.mode === "ai") {
          profile = { ...details };
          for (const [k, v] of Object.entries(better.profile))
            if (typeof v === "string" && v.trim() && k !== "photo")
              (profile as Record<string, string>)[k] = v.trim();
        }
      }
      await api("profile", "PUT", {
        ...blankProfile,
        ...profile,
        name: name.trim() || profile.name,
        email: profile.email || email.trim(),
        photo: "",
      });
      return true;
    } catch {
      return false;
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setTaken(false);
    try {
      await api<{ user: User }>(`auth/${mode}`, "POST", {
        name,
        email,
        password,
      });
      const filled =
        mode === "register" && found && from ? await saveFound(found) : false;
      if (returnTo) window.location.assign(returnTo);
      else onSignIn(filled && from ? from : undefined);
    } catch (e) {
      setError((e as Error).message);
      setTaken(mode === "register" && (e as ApiError).status === 409);
    } finally {
      setBusy(false);
    }
  }
  const details = found
    ? shownFields
        .filter((f) => found[f])
        .map((f) => [fieldLabels[f], short(f, found[f])] as const)
    : [];
  const count = details.length + (found?.name ? 1 : 0) + (found?.email ? 1 : 0);
  const demo = presentation ? (
    <div className="presentation-entry">
      <Button className="full" busy={busy} onClick={openPresentation}>
        Open presentation demo <ArrowRight size={18} />
      </Button>
      <p className="muted small-copy">
        Try the full flow with fictional profiles.
      </p>
    </div>
  ) : null;
  return (
    <div className={`auth-page ${direct ? "focused" : ""} at-${step}`.trim()}>
      <section className="auth-story">
        {/* someone arriving to save a card signs up first; the install tip can wait */}
        {direct ? null : <InstallApp banner />}
        <Brand />
        <div className="auth-story-body">
          <span className="eyebrow">The memory for your network</span>
          {/* the breaks are for laptops; on a phone the line wraps by itself */}
          <h1>
            Every connection <br />
            has a story. <br />
            <em>Keep yours.</em>
          </h1>
          <p>
            Your business cards on your phone. Never forget who you met, or why
            it mattered.
          </p>
          <div className="auth-features">
            <div>
              <Layers size={20} />
              <span>
                <b>Share</b> a digital business card with one scan
              </span>
            </div>
            <div>
              <MapPin size={20} />
              <span>
                <b>Remember</b> where you met and what you talked about
              </span>
            </div>
            <div>
              <Search size={20} />
              <span>
                <b>Find</b> people later by what you remember
              </span>
            </div>
          </div>
        </div>
        <footer>Made for the people you meet along the way.</footer>
      </section>
      <section className="auth-form-panel">
        {step === "welcome" ? (
          <div className="auth-form-wrap welcome">
            <h2>Get started</h2>
            <p className="muted">Start by scanning your own business card.</p>
            <div className="welcome-choices">
              <Button className="full" onClick={() => setScanning(true)}>
                <ScanLine size={18} /> Scan my business card
              </Button>
              <Button
                className="full linkedin"
                onClick={() => {
                  setError("");
                  setStep("linkedin");
                }}
              >
                <LinkedInMark /> Import from LinkedIn
              </Button>
              <button
                type="button"
                className="text-button welcome-email"
                onClick={() => open("register")}
              >
                Sign up with email instead
              </button>
            </div>
            <p className="welcome-signin">
              Already have an account?
              <button
                type="button"
                className="text-button"
                onClick={() => open("login")}
              >
                Sign in
              </button>
            </p>
            {demo}
            <p className="auth-note">
              <Check size={15} /> Your notes are private. You choose what you
              share.
            </p>
            <InstallApp computerOnly />
          </div>
        ) : step === "linkedin" ? (
          <div className="auth-form-wrap">
            <button type="button" className="auth-back" onClick={startOver}>
              <ArrowLeft size={16} /> Back
            </button>
            <h2>Import from LinkedIn</h2>
            <p className="muted">
              Paste the link to your LinkedIn profile. Wasl takes your name from
              it and puts the link on your card.
            </p>
            <form onSubmit={fromLinkedin} className="linkedin-form">
              <label>
                <span>Your LinkedIn link</span>
                <input
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={linkedin}
                  required
                  maxLength={300}
                  placeholder="linkedin.com/in/yourname"
                  onChange={(e) => setLinkedin(e.target.value)}
                />
              </label>
              {error ? <Notice error>{error}</Notice> : null}
              <Button type="submit" className="full">
                Continue <ArrowRight size={18} />
              </Button>
            </form>
            <p className="muted small-copy linkedin-why">
              LinkedIn doesn&rsquo;t let other apps read the rest of a profile,
              so you add your role and where you study or work yourself. It
              takes a minute.
            </p>
          </div>
        ) : (
          <div className="auth-form-wrap">
            {direct ? null : (
              <button type="button" className="auth-back" onClick={startOver}>
                <ArrowLeft size={16} /> Back
              </button>
            )}
            <h2>
              {mode === "register" ? "Create your account" : "Welcome back"}
            </h2>
            <p className="muted">
              {signedOut
                ? "You were signed out. Sign in to carry on where you left off."
                : returnTo
                  ? "Create a free account (or sign in) to save this card."
                  : mode === "register"
                    ? "Free, and it takes a minute."
                    : "Sign in to see your people."}
            </p>
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "register" ? "active" : ""}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Create account
              </button>
              <button
                type="button"
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Sign in
              </button>
            </div>
            {demo}
            {found && from && mode === "register" ? (
              <div className="found-details">
                <strong>
                  {from === "card" ? <ScanLine size={16} /> : <LinkedInMark />}
                  {from === "linkedin"
                    ? "Your LinkedIn link is ready"
                    : count
                      ? `Found ${count} ${count === 1 ? "detail" : "details"} on your card`
                      : "Wasl couldn’t pick out the details on that card"}
                </strong>
                {details.length ? (
                  <ul>
                    {details.map(([label, value]) => (
                      <li key={label}>
                        <span>{label}</span>
                        <b>{value}</b>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="muted small-copy">
                  {from === "card" && !count
                    ? "Sign up, then fill your profile by hand or try the photo again."
                    : "It all goes on your profile once you sign up. You can check and change everything there."}
                </p>
              </div>
            ) : null}
            <form onSubmit={submit}>
              {mode === "register" ? (
                <label>
                  <span>Your name</span>
                  <input
                    autoComplete="name"
                    value={name}
                    required
                    maxLength={100}
                    placeholder="How should we call you?"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              ) : null}
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  value={password}
                  required
                  minLength={10}
                  maxLength={128}
                  placeholder="At least 10 characters"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error ? <Notice error>{error}</Notice> : null}
              {taken ? (
                <Button
                  variant="secondary"
                  className="full"
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setTaken(false);
                  }}
                >
                  Sign in with this email
                </Button>
              ) : null}
              <Button type="submit" busy={busy} className="full">
                {mode === "register" ? "Create your Wasl account" : "Sign in"}
                <ArrowRight size={18} />
              </Button>
            </form>
            {mode === "login" ? (
              <div className="forgot">
                <button
                  type="button"
                  className="text-button"
                  aria-expanded={forgot}
                  onClick={() => setForgot(!forgot)}
                >
                  Forgot your password?
                </button>
                {forgot ? (
                  <p className="muted small-copy">
                    Wasl can&rsquo;t reset a password by email yet. If Wasl is
                    still open on another phone or laptop, set a new password
                    there: Settings, then Change password.
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="auth-note">
              <Check size={15} /> Your notes are private. You choose what you
              share.
            </p>
            <InstallApp computerOnly />
          </div>
        )}
      </section>
      {scanning ? (
        // Nobody is signed in yet, so the card is read on this phone (no AI, no cloud).
        <ScanModal
          own
          capabilities={{ ...capabilities, ai: false, ocr: false }}
          onClose={() => setScanning(false)}
          onDraft={(profile, _byAi, text) => fromCard(profile, text || "")}
        />
      ) : null}
    </div>
  );
}
