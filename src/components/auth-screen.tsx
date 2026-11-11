"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Layers, LockKeyhole, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import type { User } from "@/lib/types";
import { Brand, Button, Notice } from "./ui";
import { InstallApp } from "./install-app";
import { presentationAccount } from "@/lib/presentation";
export function AuthScreen({
  onSignIn,
  returnTo,
  presentation = false,
}: {
  onSignIn: (user: User) => void;
  returnTo?: string;
  presentation?: boolean;
}) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function openPresentation() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(
        "auth/login",
        "POST",
        presentationAccount,
      );
      if (returnTo) window.location.assign(returnTo);
      else onSignIn(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(`auth/${mode}`, "POST", {
        name,
        email,
        password,
      });
      if (returnTo) window.location.assign(returnTo);
      else onSignIn(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <InstallApp banner />
        <Brand />
        <div className="auth-story-body">
          <span className="eyebrow">THE MEMORY FOR YOUR NETWORK</span>
          <h1>
            Every connection
            <br />
            has a story.
            <br />
            <em>Keep yours.</em>
          </h1>
          <p>
            You remember the conversation.
            <br />
            Wasl helps you remember the person.
          </p>
          <div className="auth-features">
            <div>
              <LockKeyhole size={20} />
              <span>Keep the story of every meeting, privately</span>
            </div>
            <div>
              <Sparkles size={20} />
              <span>Find people by what you remember</span>
            </div>
            <div>
              <Layers size={20} />
              <span>Swap cards in one scan</span>
            </div>
          </div>
        </div>
        <footer>Made for the people you meet along the way.</footer>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <h2>
            {mode === "register" ? "Create your account" : "Welcome back"}
          </h2>
          <p className="muted">
            {returnTo
              ? "Sign in or create an account to save this connection."
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
          {presentation ? (
            <div className="presentation-entry">
              <Button className="full" busy={busy} onClick={openPresentation}>
                Open presentation demo <ArrowRight size={18} />
              </Button>
              <p className="muted small-copy">
                Try the full flow with fictional profiles.
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
            <Button type="submit" busy={busy} className="full">
              {mode === "register" ? "Create your Wasl account" : "Sign in"}
              <ArrowRight size={18} />
            </Button>
          </form>
          <p className="auth-note">
            <Check size={15} /> Your notes are private. You choose what you
            share.
          </p>
          <InstallApp computerOnly />
        </div>
      </section>
    </div>
  );
}
