"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  CreditCard,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/client";
import type {
  Capabilities,
  Card,
  Connection,
  Profile,
  User,
} from "@/lib/types";
import { AuthScreen } from "./auth-screen";
import { Avatar, Brand, Button, Notice } from "./ui";
import { ConnectionDetail, ConnectionForm, NetworkView } from "./network-view";
import { ProfileView, WalletView } from "./wallet-view";
import { RecallView, ScanModal } from "./recall-view";
import { presentationCardToken } from "@/lib/presentation";
type View = "network" | "wallet" | "recall" | "profile" | "settings";
const navigation = [
  { id: "network" as View, label: "Your network", icon: LayoutGrid },
  { id: "wallet" as View, label: "Your cards", icon: CreditCard },
  { id: "recall" as View, label: "Recall", icon: Sparkles },
  { id: "profile" as View, label: "Your profile", icon: UserRound },
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
  const [returnTo, setReturnTo] = useState<string | undefined>();
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
    void loadSession();
  }, []);
  useEffect(() => {
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
        <div className="sidebar-caption">YOUR PERSONAL NETWORK</div>
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
              {n.id === "recall" ? <span className="nav-dot" /> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={17} />
            <p>
              Your connections.
              <br />
              <strong>Your private context.</strong>
            </p>
          </div>
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
              <Avatar name={user.name} />
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
            <span className="topbar-path">Your workspace</span>
            <span className="topbar-divider">/</span>
            <strong>
              {navigation.find((n) => n.id === view)?.label || "Settings"}
            </strong>
          </div>
          <div className="row">
            <span className="workspace-private">
              <ShieldCheck size={13} />{" "}
              {capabilities.presentation
                ? "Demo · fictional data"
                : "Private workspace"}
            </span>
            {capabilities.presentation ? (
              <a
                className="text-button presentation-card-link"
                href={`/c/${presentationCardToken}`}
              >
                Open Mariam's card
              </a>
            ) : null}
            <button
              className="icon-button"
              onClick={() => navigate("profile")}
              aria-label="Open profile"
            >
              <Avatar name={user.name} />
            </button>
          </div>
        </header>
        <main className="workspace-content">
          {error ? (
            <Notice error>
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </Notice>
          ) : null}
          {view === "network" ? (
            <NetworkView
              contacts={contacts}
              onOpen={setDetail}
              onAdd={() => {
                setDraft(undefined);
                setEditing(null);
              }}
              onScan={() => setScanning(true)}
              onRecall={() => navigate("recall")}
            />
          ) : view === "wallet" ? (
            <WalletView
              cards={cards}
              user={user}
              onChanged={refresh}
              onProfile={() => navigate("profile")}
            />
          ) : view === "profile" ? (
            <ProfileView
              key={user.id}
              user={user}
              onSaved={(u) => {
                setUser(u);
                void refresh();
              }}
            />
          ) : view === "recall" ? (
            <RecallView capabilities={capabilities} onOpen={setDetail} />
          ) : (
            <SettingsView
              user={user}
              capabilities={capabilities}
              onLogout={logout}
            />
          )}
          <footer className="workspace-footer">
            <span>More than contacts. A network with memory.</span>
            <span>wasl · وصل</span>
          </footer>
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
            <span>
              {n.id === "network"
                ? "Network"
                : n.id === "wallet"
                  ? "Cards"
                  : n.id === "profile"
                    ? "Profile"
                    : n.label}
            </span>
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
          onClose={() => setDetail(null)}
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
          onClose={() => setEditing(undefined)}
          onSaved={(contact) => {
            setEditing(undefined);
            setDraft(undefined);
            void refresh();
            setDetail(contact);
          }}
        />
      ) : null}
      {scanning ? (
        <ScanModal
          capabilities={capabilities}
          onClose={() => setScanning(false)}
          onDraft={(profile) => {
            setScanning(false);
            setDraft(profile);
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
          <span className="eyebrow">YOUR WORKSPACE, YOUR CHOICE</span>
          <h1>Settings</h1>
          <p>A little clarity about your account and your data.</p>
        </div>
      </section>
      <div className="settings-sections">
        <section>
          <h3>Your account</h3>
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
          <Button variant="secondary" onClick={onLogout}>
            <LogOut size={15} /> Sign out
          </Button>
        </section>
        <section>
          <h3>Your data belongs to you.</h3>
          <p>
            Download your profile, cards, connections and private notes as a
            JSON file.
          </p>
          <a className="button secondary" href="/api/export">
            <ArrowDownToLine size={16} /> Export my network
          </a>
        </section>
        <section>
          <h3>Connected features</h3>
          <div className="service-row">
            <span>AI memory recall</span>
            <span className={`pill ${capabilities.ai ? "available" : ""}`}>
              {capabilities.ai ? "Connected" : "Not connected"}
            </span>
          </div>
          <div className="service-row">
            <span>Business-card photo scanning</span>
            <span className={`pill ${capabilities.ocr ? "available" : ""}`}>
              {capabilities.ocr ? "Connected" : "Not connected"}
            </span>
          </div>
          <p>
            Manual entry, private memories, keyword recall and QR sharing work
            independently of these services.
          </p>
        </section>
        <section>
          <h3>Sharing and privacy</h3>
          <p>
            Your notes are only visible to you. Public cards contain only the
            fields you choose. Changing your profile updates active card links;
            people can refresh saved shared details from their connection
            screen. Revoking a link stops future access through that link, but
            cannot remove copies someone already saved.
          </p>
          <p>
            Wasl never scrapes LinkedIn. Add your own profile link to a card if
            you want to share it.
          </p>
        </section>
      </div>
    </>
  );
}
