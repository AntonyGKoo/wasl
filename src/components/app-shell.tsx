"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
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
  Search,
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
import { AuthScreen, type StartedFrom } from "./auth-screen";
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
import { onBack, screenOpened } from "@/lib/history";
import { presentationCardToken } from "@/lib/presentation";
type View = "network" | "wallet" | "recall" | "profile" | "settings";
const navigation = [
  { id: "network" as View, label: "Network", icon: LayoutGrid },
  { id: "wallet" as View, label: "Cards", icon: CreditCard },
  { id: "recall" as View, label: "Search", icon: Search },
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
  // the session ended while the app was open
  const [signedOut, setSignedOut] = useState(false);
  // a new profile was just filled from the person's card or LinkedIn link: show it to them
  const [startedFrom, setStartedFrom] = useState<StartedFrom | null>(null);
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
  // quiet: a refresh nobody asked for (coming back to the app) says nothing if it fails
  async function refresh(quiet = false) {
    try {
      const [a, b] = await Promise.all([
        api<{ connections: Connection[] }>("connections"),
        api<{ cards: Card[] }>("cards"),
      ]);
      setContacts(a.connections);
      setCards(b.cards);
    } catch (e) {
      if (!quiet) setError((e as Error).message);
    }
  }
  // someone whose card just arrived: fetch them, since the list on screen may not have them yet
  async function openPerson(id: string) {
    try {
      const { connection } = await api<{ connection: Connection }>(
        `connections/${id}`,
      );
      // going to Network also reloads the list, so the new person is in it behind the dialog
      navigate("network");
      setDetail(connection);
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
    // The phone's Back button moves between the screens you visited instead of leaving Wasl.
    window.history.scrollRestoration = "manual";
    const back = () => {
      const shown = new URLSearchParams(window.location.search).get("view");
      if (shown !== "profile") setStartedFrom(null);
      setView(
        navigation.some((n) => n.id === shown) || shown === "settings"
          ? (shown as View)
          : "network",
      );
    };
    // the session ended while the app was open: back to the sign-in screen, with a reason
    const ended = () => {
      setSignedOut(true);
      setUser(null);
      setContacts([]);
      setCards([]);
      setDetail(null);
      setEditing(undefined);
      setScanning(false);
      setScanningCode(false);
      setDebrief(false);
    };
    const offBack = onBack(back);
    window.addEventListener("wasl-signed-out", ended);
    return () => {
      offBack();
      window.removeEventListener("wasl-signed-out", ended);
    };
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
    // a profile just filled from a card or LinkedIn link opens first, so the person can check it
    if (user && startedFrom) {
      setView("profile");
      screenOpened("/?view=profile");
    }
  }, [user?.id]);
  // Coming back to Wasl (from the camera, another app or a locked phone) shows what changed
  // meanwhile, such as a card someone sent back. At most once every ten seconds.
  useEffect(() => {
    if (!user) return;
    let last = Date.now();
    const back = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 10000) return;
      last = Date.now();
      void refresh(true);
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [user?.id]);
  function navigate(next: View) {
    window.scrollTo(0, 0);
    // opening Network (or tapping it again) looks for new people
    if (next === "network") void refresh(true);
    if (next === view) return;
    if (next !== "profile") setStartedFrom(null);
    setView(next);
    screenOpened(`/?view=${next}`);
  }
  async function logout() {
    try {
      await api("auth/logout", "POST", {});
      setUser(null);
      setContacts([]);
      setCards([]);
      // the next person to sign in starts at their network
      setView("network");
      setStartedFrom(null);
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
        onSignIn={(from) => {
          setSignedOut(false);
          setStartedFrom(from || null);
          void loadSession();
        }}
        capabilities={capabilities}
        returnTo={returnTo}
        presentation={capabilities.presentation}
        signedOut={signedOut}
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
              onScanCard={() => setScanning(true)}
              onOpenPerson={(id) => void openPerson(id)}
            />
          ) : view === "profile" ? (
            <ProfileView
              key={user.id}
              user={user}
              capabilities={capabilities}
              startedFrom={startedFrom}
              onSeeCard={() => navigate("wallet")}
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
          <AiStatus connected={capabilities.ai} />
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

// Whether Wasl's AI really works right now: a key being set doesn't mean the AI account accepts
// it or has credit, so this asks the server to make one tiny real call and says what came back.
function AiStatus({ connected }: { connected: boolean }) {
  const [state, setState] = useState<
    "checking" | "working" | "failing" | "unknown"
  >("checking");
  const [reason, setReason] = useState("");
  const [parts, setParts] = useState<
    { name: string; model: string; ok: boolean; detail: string }[]
  >([]);
  const [address, setAddress] = useState("");
  async function check() {
    setState("checking");
    try {
      const result = await api<{
        state: string;
        reason: string;
        parts?: { name: string; model: string; ok: boolean; detail: string }[];
        address?: string;
      }>("ai-check");
      setParts(result.parts || []);
      setAddress(result.address || "");
      setState(
        result.state === "working"
          ? "working"
          : result.state === "failing"
            ? "failing"
            : "unknown",
      );
      setReason(result.reason);
    } catch (e) {
      setState("unknown");
      setReason((e as Error).message);
    }
  }
  useEffect(() => {
    if (connected) void check();
  }, [connected]);
  const label = !connected
    ? "Not connected"
    : state === "checking"
      ? "Checking…"
      : state === "working"
        ? "Working"
        : state === "failing"
          ? "Not working"
          : "Couldn’t check";
  return (
    <>
      <div className="service-row">
        <span>Wasl&rsquo;s AI (search, card reading, chat summaries)</span>
        <span
          className={`pill ${state === "working" && connected ? "available" : state === "failing" ? "failing" : ""}`}
        >
          {label}
        </span>
      </div>
      {connected &&
      state === "working" &&
      (reason || parts.some((p) => p.ok && p.detail)) ? (
        // working, with something worth knowing: a spare model in use, or no meaning index
        <div className="ai-reason" role="status">
          {parts
            .filter((part) => part.ok && part.detail)
            .map((part) => (
              <p key={part.name}>{part.detail}</p>
            ))}
          {reason ? <p>{reason}</p> : null}
        </div>
      ) : null}
      {connected && (state === "failing" || state === "unknown") ? (
        <div className="ai-reason" role="status">
          {state === "failing" && parts.length ? (
            // which of the two AI services was refused, with the model it asked for
            <ul>
              {parts.map((part) => (
                <li key={part.name}>
                  <strong>
                    {part.name} ({part.model})
                  </strong>
                  : {part.ok ? "working." : part.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>{reason}</p>
          )}
          {address ? (
            <p>
              Wasl is set to reach the AI at <strong>{address}</strong>, not at
              OpenAI itself (OPENAI_BASE_URL).
            </p>
          ) : null}
          <p>
            {state === "failing"
              ? "Until this is fixed, Wasl searches by keyword and reads cards with its built-in rules. "
              : ""}
            <button className="text-button" onClick={() => void check()}>
              Check again
            </button>
          </p>
        </div>
      ) : null}
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
