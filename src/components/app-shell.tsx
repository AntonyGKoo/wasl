"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  Check,
  UserPlus,
  KeyRound,
  LocateFixed,
  QrCode,
  ScanLine,
  Trash2,
  X,
  CreditCard,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { api, autoLocation, locatePlace } from "@/lib/client";
import type {
  Capabilities,
  Card,
  Connection,
  Profile,
  User,
} from "@/lib/types";
import { AuthScreen } from "./auth-screen";
import { InstallApp } from "./install-app";
import { Avatar, Brand, Button, Notice } from "./ui";
import {
  ConnectionDetail,
  ConnectionForm,
  NetworkView,
  tonightsPeople,
} from "./network-view";
import { ProfileView, WalletView, profileStrength } from "./wallet-view";
import { RecallView, ScanModal } from "./recall-view";
import { QrScanner } from "./qr-scanner";
import { TonightsPeople, type Choice } from "./tonight";
import { ThemeSetting, ThemeToggle } from "./theme";
import { presentationCardToken } from "@/lib/presentation";
type View = "network" | "wallet" | "recall" | "profile" | "settings";
const navigation = [
  { id: "network" as View, label: "Network", icon: LayoutGrid },
  { id: "wallet" as View, label: "Cards", icon: CreditCard },
  { id: "recall" as View, label: "Search", icon: Sparkles },
  { id: "profile" as View, label: "Profile", icon: UserRound },
];
export function WaslApp() {
  const [user, setUser] = useState<User | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>({
    ai: false,
    ocr: false,
    database: "local",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("network");
  const [contacts, setContacts] = useState<Connection[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [detail, setDetail] = useState<Connection | null>(null);
  const [editing, setEditing] = useState<Connection | null | undefined>();
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<Profile | undefined>();
  const [draftByAi, setDraftByAi] = useState<boolean | undefined>();
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const [scanningCode, setScanningCode] = useState(false);
  // Tonight's people: open, where it was, and whether to come back to it after a memory
  const [debrief, setDebrief] = useState(false);
  const [debriefAt, setDebriefAt] = useState(0);
  const [debriefChoices, setDebriefChoices] = useState<Record<string, Choice>>(
    {},
  );
  const [backToDebrief, setBackToDebrief] = useState(false);
  // a person to open once the network has loaded (from a swap or a link)
  const [openId, setOpenId] = useState<string | null>(null);
  async function loadSession() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ user: User | null; capabilities: Capabilities }>(
        "session",
      );
      setUser(data.user);
      setCapabilities(data.capabilities);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function refresh() {
    try {
      const [a, b] = await Promise.all([
        api<{ connections: Connection[] }>("connections"),
        api<{ cards: Card[] }>("cards"),
      ]);
      setContacts(a.connections);
      setCards(b.cards);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("returnTo");
    if (target && /^\/c\/[A-Za-z0-9_-]{43}$/.test(target)) setReturnTo(target);
    const selected = params.get("view");
    if (navigation.some((n) => n.id === selected) || selected === "settings")
      setView(selected as View);
    const contact = params.get("contact");
    if (contact && /^[0-9a-f-]{36}$/i.test(contact)) setOpenId(contact);
    void loadSession();
  }, []);
  useEffect(() => {
    if (!openId || !contacts.length) return;
    const found = contacts.find((c) => c.id === openId);
    setOpenId(null);
    window.history.replaceState({}, "", `/?view=${view}`);
    if (found) {
      setView("network");
      setDetail(found);
    }
  }, [openId, contacts]);
  useEffect(() => {
    // after signing in, start at the top of the app rather than where the sign-up form was
    window.scrollTo(0, 0);
    if (user) void refresh();
  }, [user?.id]);
  function navigate(next: View) {
    setView(next);
    window.history.replaceState({}, "", `/?view=${next}`);
  }
  async function logout() {
    try {
      await api("auth/logout", "POST", {});
      setUser(null);
      setContacts([]);
      setCards([]);
      // the next person to sign in starts at their network
      setView("network");
      setDetail(null);
      window.history.replaceState({}, "", "/");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="loading">
        <LoaderCircle size={25} className="spin" />
        <span>Opening your network…</span>
      </div>
    );
  if (!user && error)
    return (
      <div className="startup-error">
        <Brand />
        <Notice error>{error}</Notice>
        <Button onClick={loadSession}>Try again</Button>
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        onSignIn={() => void loadSession()}
        returnTo={returnTo}
        presentation={capabilities.presentation}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" aria-label="Wasl home">
          <Brand />
        </a>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "network" ? (
                <span className="nav-count">{contacts.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`settings-nav ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings size={17} /> Settings
          </button>
          <div className="account-strip">
            <button
              onClick={() => navigate("profile")}
              className="account-button"
            >
              <Avatar
                name={user.name}
                photo={user.profile.photo || undefined}
              />
              <span>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
            </button>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <strong>
              {navigation.find((n) => n.id === view)?.label || "Settings"}
            </strong>
          </div>
          <div className="row">
            {capabilities.presentation ? (
              <a
                className="text-button presentation-card-link"
                href={`/c/${presentationCardToken}`}
              >
                Open Mariam's card
              </a>
            ) : null}
            <ThemeToggle />
            <button
              className="icon-button"
              onClick={() => navigate("profile")}
              aria-label="Open profile"
            >
              <Avatar
                name={user.name}
                photo={user.profile.photo || undefined}
              />
            </button>
          </div>
        </header>
        <main className="workspace-content">
          {/* the install prompt lives on the home screen only, not on every page */}
          {view === "network" ? <InstallApp banner /> : null}
          {error ? (
            <Notice error>
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </Notice>
          ) : null}
          {view === "network" ? (
            <GettingStarted
              user={user}
              cards={cards}
              contacts={contacts}
              onProfile={() => navigate("profile")}
              onCards={() => navigate("wallet")}
              onMeet={() => setScanningCode(true)}
            />
          ) : null}
          {view === "network" ? (
            <NetworkView
              contacts={contacts}
              onOpen={setDetail}
              onAdd={() => {
                setDraft(undefined);
                setDraftByAi(undefined);
                setEditing(null);
              }}
              onScan={() => setScanning(true)}
              onScanCode={() => setScanningCode(true)}
              onRecall={() => navigate("recall")}
              onDebrief={() => {
                setDebriefAt(0);
                setDebriefChoices({});
                setDebrief(true);
              }}
              onChanged={refresh}
            />
          ) : view === "wallet" ? (
            <WalletView
              cards={cards}
              user={user}
              onChanged={refresh}
              onProfile={() => navigate("profile")}
              onScanCode={() => setScanningCode(true)}
            />
          ) : view === "profile" ? (
            <ProfileView
              key={user.id}
              user={user}
              capabilities={capabilities}
              onSaved={(u) => {
                setUser(u);
                void refresh();
              }}
            />
          ) : view === "recall" ? (
            <RecallView
              capabilities={capabilities}
              onOpen={setDetail}
              contacts={contacts}
              onAdd={() => {
                setDraft(undefined);
                setDraftByAi(undefined);
                setEditing(null);
              }}
              onScan={() => setScanning(true)}
              onChanged={refresh}
            />
          ) : (
            <SettingsView
              user={user}
              capabilities={capabilities}
              onLogout={logout}
            />
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((n) => (
          <button
            key={n.id}
            className={view === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <button
          onClick={() => navigate("settings")}
          className={view === "settings" ? "active" : ""}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>
      {detail ? (
        <ConnectionDetail
          key={detail.id}
          initial={detail}
          onClose={() => {
            setDetail(null);
            if (backToDebrief) {
              setBackToDebrief(false);
              setDebrief(true);
            }
          }}
          onChanged={refresh}
          onEdit={(contact) => {
            setDetail(null);
            setDraft(undefined);
            setEditing(contact);
          }}
        />
      ) : null}
      {editing !== undefined ? (
        <ConnectionForm
          contact={editing || undefined}
          draft={draft}
          draftByAi={draftByAi}
          knownTags={[...new Set(contacts.flatMap((c) => c.tags))]}
          onClose={() => setEditing(undefined)}
          onSaved={(contact) => {
            setEditing(undefined);
            setDraft(undefined);
            void refresh();
            setDetail(contact);
          }}
        />
      ) : null}
      {scanningCode ? (
        <QrScanner
          onClose={() => setScanningCode(false)}
          onContact={(profile) => {
            setScanningCode(false);
            setDraft(profile);
            setDraftByAi(false);
            setEditing(null);
          }}
        />
      ) : null}
      {debrief ? (
        <TonightsPeople
          {...tonightsPeople(contacts)}
          start={debriefAt}
          decided={debriefChoices}
          onProgress={(at, choices) => {
            setDebriefAt(at);
            setDebriefChoices(choices);
          }}
          onClose={() => setDebrief(false)}
          onChanged={refresh}
          onOpen={(contact) => {
            setDebrief(false);
            setBackToDebrief(true);
            setDetail(contact);
          }}
        />
      ) : null}
      {scanning ? (
        <ScanModal
          capabilities={capabilities}
          onClose={() => setScanning(false)}
          onDraft={(profile, byAi) => {
            setScanning(false);
            setDraft(profile);
            setDraftByAi(byAi);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
function SettingsView({
  user,
  capabilities,
  onLogout,
}: {
  user: User;
  capabilities: Capabilities;
  onLogout: () => void;
}) {
  return (
    <>
      <section className="page-intro">
        <div>
          <h1>Settings</h1>
        </div>
      </section>
      <div className="settings-sections">
        <section>
          <h3>Your account</h3>
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
          <div className="row">
            <Button variant="secondary" onClick={onLogout}>
              <LogOut size={15} /> Sign out
            </Button>
          </div>
          <PasswordChange />
        </section>
        <section>
          <h3>Appearance</h3>
          <p>Wasl is dark unless you pick Light, or let it match your phone.</p>
          <ThemeSetting />
        </section>
        <section>
          <h3>Recording and location</h3>
          <div className="service-row">
            <span>Ask both people before recording</span>
            <span className="pill available">Always on</span>
          </div>
          <div className="service-row">
            <span>Audio is never kept, only the key points</span>
            <span className="pill available">Always on</span>
          </div>
          <LocationSetting />
        </section>
        <section>
          <h3>Wasl on your phone</h3>
          <InstallApp />
        </section>
        <section>
          <h3>Your data</h3>
          <p>
            Download everything as one file: profile, cards, people and notes.
          </p>
          <a className="button secondary" href="/api/export">
            <ArrowDownToLine size={16} /> Export my network
          </a>
        </section>
        <section>
          <h3>AI and scanning</h3>
          <div className="service-row">
            <span>AI search by memory</span>
            <span className={`pill ${capabilities.ai ? "available" : ""}`}>
              {capabilities.ai ? "Connected" : "Not connected"}
            </span>
          </div>
          <div className="service-row">
            <span>Business-card photo scanning</span>
            <span className="pill available">
              {capabilities.ocr ? "Connected" : "On your phone"}
            </span>
          </div>
        </section>
        <section>
          <h3>Privacy</h3>
          <p>
            Only you see your notes. A card shows only the details you switch
            on. Turning off a link stops new people opening it; copies people
            already saved stay with them.
          </p>
        </section>
        <DeleteAccount onDeleted={onLogout} />
      </div>
    </>
  );
}

function GettingStarted({
  user,
  cards,
  contacts,
  onProfile,
  onCards,
  onMeet,
}: {
  user: User;
  cards: Card[];
  contacts: Connection[];
  onProfile: () => void;
  onCards: () => void;
  onMeet: () => void;
}) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem("wasl.started") === "done");
    } catch {
      setHidden(false);
    }
  }, []);
  const steps = [
    {
      done: profileStrength(user.profile).done >= 3,
      title: "Fill your profile from your business card",
      action: onProfile,
      icon: ScanLine,
    },
    {
      done: cards.some((c) => c.token),
      title: "Share your card: they scan your code",
      action: onCards,
      icon: QrCode,
    },
    {
      // sample people don't count: this step is about a real meeting
      done: contacts.some((c) => c.origin !== "sample"),
      title: "Save someone you met: scan their code or card",
      action: onMeet,
      icon: UserPlus,
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (hidden || !left) return null;
  return (
    <section className="getting-started" aria-label="Getting started">
      <div className="getting-started-head">
        <strong>Get started</strong>
        <span className="getting-started-count">
          {steps.length - left} of {steps.length} done
        </span>
        <span className="getting-started-bar" aria-hidden="true">
          {steps.map((s) => (
            <i key={s.title} className={s.done ? "on" : ""} />
          ))}
        </span>
        <button
          className="icon-button"
          aria-label="Hide getting started"
          onClick={() => {
            try {
              window.localStorage.setItem("wasl.started", "done");
            } catch {}
            setHidden(true);
          }}
        >
          <X size={15} />
        </button>
      </div>
      {/* only what's left: finished steps show in the count and the bar */}
      <ol>
        {steps
          .filter((s) => !s.done)
          .map((s) => (
            <li key={s.title}>
              <button onClick={s.action}>
                <span className="step-icon">
                  <s.icon size={15} />
                </span>
                {s.title}
              </button>
            </li>
          ))}
      </ol>
    </section>
  );
}
function PasswordChange() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("account/password", "POST", { current, next });
      setMessage("Password changed. Other devices are signed out.");
      setCurrent("");
      setNext("");
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <KeyRound size={15} /> Change password
        </Button>
        {message ? <Notice>{message}</Notice> : null}
      </>
    );
  return (
    <form onSubmit={submit} className="settings-form">
      <label>
        <span>Current password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          required
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label>
        <span>New password · at least 10 characters</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          value={next}
          required
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      {error ? <Notice error>{error}</Notice> : null}
      <div className="form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          Change password
        </Button>
      </div>
    </form>
  );
}
function LocationSetting() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setOn(autoLocation.get()), []);
  async function toggle() {
    setMessage("");
    if (on) {
      autoLocation.set(false);
      setOn(false);
      return;
    }
    // turning it on asks the phone for permission once, and shows where you are
    setBusy(true);
    try {
      const place = await locatePlace();
      autoLocation.set(true);
      setOn(true);
      setMessage(`Location on. Right now you're at ${place}.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="service-row">
        <span>
          Fill in the place from my location when I save someone
          <small className="muted">
            {" "}
            · saved with the person, never shared
          </small>
        </span>
        <button
          className={`switch ${on ? "on" : ""}`}
          role="switch"
          aria-checked={on}
          aria-label="Fill in the place from my location"
          disabled={busy}
          onClick={() => void toggle()}
        >
          <span />
        </button>
      </div>
      {message ? (
        <p className="muted small-copy">
          <LocateFixed size={13} /> {message}
        </p>
      ) : null}
    </>
  );
}
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("account", "DELETE", { password });
      onDeleted();
      window.location.assign("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="danger-section">
      <h3>Delete my account</h3>
      <p>Removes your profile, cards, links, people and notes for good.</p>
      {open ? (
        <form onSubmit={submit} className="settings-form">
          <label>
            <span>Type your password to confirm</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <Notice error>{error}</Notice> : null}
          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Keep my account
            </Button>
            <Button type="submit" variant="danger" busy={busy}>
              Delete everything
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <Trash2 size={15} /> Delete my account
        </Button>
      )}
    </section>
  );
}
