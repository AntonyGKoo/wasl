"use client";
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  ScanLine,
  Share2,
  Sparkles,
  Copy,
  CreditCard,
  Link2,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
  Pencil,
} from "lucide-react";
import { api } from "@/lib/client";
import {
  cardFieldLabels,
  cardFields,
  cardKinds,
  kindLabels,
  type Capabilities,
  type Card,
  type CardField,
  type Profile,
  type ProfileField,
  type User,
} from "@/lib/types";
import { Avatar, Button, Modal, Notice, ProfileFields } from "./ui";
import { ScanModal } from "./recall-view";
import { squarePhoto } from "@/lib/photo";
export function WalletView({
  cards,
  user,
  onChanged,
  onProfile,
  onScanCode,
}: {
  cards: Card[];
  user: User;
  onChanged: () => void;
  onProfile: () => void;
  onScanCode: () => void;
}) {
  const [editing, setEditing] = useState<Card | null | undefined>();
  const [sharing, setSharing] = useState<Card | null>(null);
  const [deleting, setDeleting] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`cards/${deleting.id}`, "DELETE");
      setDeleting(null);
      onChanged();
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
          <h1>My cards</h1>
          <p>
            Each card shares only what you switch on. Your notes never leave
            your phone.
          </p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={17} /> Create a card
        </Button>
      </section>
      {error ? <Notice error>{error}</Notice> : null}
      {!cards.length ? (
        <div className="empty-state">
          <span className="empty-icon">
            <CreditCard size={32} />
          </span>
          <h3>A card for every side of you.</h3>
          <p>
            Start with a professional card. Add a social or event card whenever
            you want to share a different set of details.
          </p>
          <Button onClick={() => setEditing(null)}>
            <Plus size={16} /> Create your first card
          </Button>
        </div>
      ) : (
        <div className="wallet-grid">
          {cards.map((card) => (
            <article className="wallet-item" key={card.id}>
              <CardFace card={card} profile={user.profile} />
              <div className="wallet-card-info">
                <div>
                  <h3>{card.label}</h3>
                  <span>
                    Shares {card.fields.length} details ·{" "}
                    {card.token ? "link on" : "not shared yet"}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Edit ${card.label}`}
                  onClick={() => setEditing(card)}
                >
                  <Pencil size={16} />
                </button>
              </div>
              <div className="wallet-card-actions">
                <Button onClick={() => setSharing(card)}>
                  <QrCode size={16} /> Share card
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Delete ${card.label}`}
                  onClick={() => setDeleting(card)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing !== undefined ? (
        <CardForm
          card={editing || undefined}
          profile={user.profile}
          taken={cards.filter((c) => c.id !== editing?.id).map((c) => c.label)}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onChanged();
          }}
        />
      ) : null}
      {sharing ? (
        <ShareModal
          card={sharing}
          onClose={() => setSharing(null)}
          onChanged={onChanged}
          onScanCode={() => {
            setSharing(null);
            onScanCode();
          }}
        />
      ) : null}
      {deleting ? (
        <Modal
          title={`Delete ${deleting.label}?`}
          description="Its sharing links will stop working. Other people may still have copies they already saved."
          onClose={() => setDeleting(null)}
        >
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep card
            </Button>
            <Button variant="danger" busy={busy} onClick={remove}>
              Delete card
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
// The card as other people see it, used in the wallet and as a live preview while editing.
export function CardFace({
  card,
  profile,
  detailed = false,
}: {
  card: Pick<Card, "label" | "kind" | "color" | "fields">;
  profile: Partial<Profile>;
  detailed?: boolean;
}) {
  const has = (f: CardField) => card.fields.includes(f);
  const shown = (f: ProfileField) => (has(f) ? profile[f] || "" : "");
  const work = [shown("title"), shown("company") || shown("university")].filter(
    Boolean,
  );
  const lines = detailed
    ? (["email", "phone", "linkedin", "instagram", "website"] as const)
        .map((f) => shown(f).replace(/^https?:\/\/(www\.)?/, ""))
        .filter(Boolean)
    : [];
  return (
    <div className={`digital-card ${card.color}`}>
      <div className="digital-card-top">
        <span className="mini-wordmark">wasl</span>
        <span>{kindLabels[card.kind]}</span>
      </div>
      <Avatar
        name={profile.name || "You"}
        photo={has("photo") ? profile.photo : undefined}
      />
      <h2>{profile.name || "Your name"}</h2>
      <p>{work.join(" · ")}</p>
      {lines.length ? (
        <ul className="digital-card-lines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      <div className="digital-card-bottom">
        <span>{card.label || kindLabels[card.kind]}</span>
        <QrCode size={26} />
      </div>
    </div>
  );
}
const kindHints: Record<Card["kind"], string> = {
  professional: "For work: your role, company and how to reach you.",
  event: "For events: share less, like your name and LinkedIn only.",
  social: "For friends: Instagram instead of your work email.",
  team: "For your team or club: what your teammates need.",
};
const kindFields: Record<Card["kind"], CardField[]> = {
  professional: [
    "name",
    "title",
    "company",
    "email",
    "phone",
    "linkedin",
    "photo",
  ],
  event: ["name", "title", "company", "linkedin", "photo"],
  social: ["name", "instagram", "photo"],
  team: ["name", "title", "email", "phone", "photo"],
};
function CardForm({
  card,
  profile,
  taken = [],
  onClose,
  onSaved,
}: {
  card?: Card;
  profile: Profile;
  // names of the other cards, so a new one isn't called the same
  taken?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(card?.label || "");
  const [kind, setKind] = useState<Card["kind"]>(card?.kind || "professional");
  const [color, setColor] = useState<Card["color"]>(card?.color || "ocean");
  const [fields, setFields] = useState<CardField[]>(
    card?.fields || kindFields.professional,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // no name typed: the card type, numbered if you already have one ("Professional 2")
    let name = label.trim() || kindLabels[kind];
    if (!label.trim())
      for (let n = 2; taken.includes(name); n++)
        name = `${kindLabels[kind]} ${n}`;
    try {
      await api(`cards${card ? `/${card.id}` : ""}`, card ? "PUT" : "POST", {
        label: name,
        kind,
        color,
        fields,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={card ? `Edit your ${card.label} card` : "A new card"}
      description="Switch off anything you don't want this card to share."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="card-editor">
          <div className="card-preview">
            <span className="eyebrow">What they&rsquo;ll see</span>
            <CardFace
              card={{ label, kind, color, fields }}
              profile={profile}
              detailed
            />
            <p className="muted small-copy">{kindHints[kind]}</p>
          </div>
          <div className="card-settings">
            <div className="form-grid">
              <label>
                <span>Card type</span>
                <select
                  value={kind}
                  onChange={(e) => {
                    const next = e.target.value as Card["kind"];
                    setKind(next);
                    // a new card starts with the details that suit its crowd
                    if (!card) setFields(kindFields[next]);
                  }}
                >
                  {cardKinds.map((k) => (
                    <option key={k} value={k}>
                      {kindLabels[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Card name</span>
                <input
                  value={label}
                  maxLength={60}
                  placeholder={kindLabels[kind]}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
            </div>
            <div
              className="swatch-row"
              role="radiogroup"
              aria-label="Card color"
            >
              {(
                [
                  ["ocean", "Ocean"],
                  ["violet", "Violet"],
                  ["coral", "Coral"],
                  ["ink", "Midnight"],
                ] as const
              ).map(([c, name]) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={color === c}
                  aria-label={name}
                  className={`swatch ${c}`}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="field-selection">
              {cardFields.map((field) => {
                const value =
                  field === "photo"
                    ? profile.photo
                      ? "Your profile photo"
                      : ""
                    : profile[field];
                return (
                  <label key={field} className="field-choice">
                    <input
                      type="checkbox"
                      checked={fields.includes(field)}
                      disabled={field === "name"}
                      onChange={(e) =>
                        setFields(
                          e.target.checked
                            ? [...fields, field]
                            : fields.filter((f) => f !== field),
                        )
                      }
                    />
                    <span>
                      <strong>{cardFieldLabels[field]}</strong>
                      <small>{value || "Not in your profile yet"}</small>
                    </span>
                    <em aria-hidden="true">
                      {fields.includes(field) ? "Shown" : "Hidden"}
                    </em>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <p className="muted small-copy">
          Changes to your profile update your active card links. People can keep
          a copy of details they have already saved.
        </p>
        {error ? <Notice error>{error}</Notice> : null}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {card ? "Save card" : "Add card"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ShareModal({
  card,
  onClose,
  onChanged,
  onScanCode,
}: {
  card: Card;
  onClose: () => void;
  onChanged: () => void;
  onScanCode: () => void;
}) {
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = card.token
          ? { token: card.token }
          : await api<{ token: string }>(`cards/${card.id}/share`, "POST", {});
        const link = new URL(`/c/${result.token}`, window.location.origin).href;
        const image = await QRCode.toDataURL(link, {
          width: 600,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#1c303d", light: "#ffffff" },
        });
        if (active) {
          setUrl(link);
          setQr(image);
          onChanged();
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [card.id]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Copy the link from the field below to share it.");
    }
  }
  async function revoke() {
    setBusy(true);
    try {
      await api(`cards/${card.id}/share`, "DELETE");
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Share ${card.label}`}
      description={
        url &&
        ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
          ? "This local link opens on this laptop. Phone sharing needs a reachable address."
          : "Let someone scan this code with their phone camera."
      }
      onClose={onClose}
    >
      <div className="qr-wrap">
        {qr ? (
          <img
            src={qr}
            width={230}
            height={230}
            alt={`QR code for ${card.label}`}
          />
        ) : (
          <p>Creating your share link…</p>
        )}
      </div>
      <div className="qr-caption">
        <ShieldCheck size={15} />
        {card.fields.length} selected details. No private notes.
      </div>
      <p className="swap-hint">
        <ArrowLeftRight size={15} />
        <span>
          <strong>They have Wasl?</strong> When they save your card, they can
          send theirs back in the same tap. Or scan their code.
        </span>
      </p>
      <div className="share-actions">
        <Button variant="secondary" onClick={onScanCode}>
          <ScanLine size={16} /> Scan their code
        </Button>
        {canShare ? (
          <Button
            variant="secondary"
            disabled={!url}
            onClick={() =>
              void navigator
                .share({ title: `${card.label} card on Wasl`, url })
                .catch(() => {})
            }
          >
            <Share2 size={16} /> Send my card
          </Button>
        ) : null}
      </div>
      <label>
        <span>Or share a link</span>
        <input
          value={url}
          readOnly
          aria-label="Share link"
          onFocus={(e) => e.target.select()}
        />
      </label>
      <Button
        className="full"
        variant="secondary"
        onClick={copy}
        disabled={!url}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
        {copied ? "Link copied" : "Copy share link"}
      </Button>
      {error ? <Notice error>{error}</Notice> : null}
      <div className="danger-zone">
        {revoking ? (
          <>
            <p>
              Stop this link from opening your card? Existing saved copies will
              remain.
            </p>
            <div className="row">
              <Button variant="secondary" onClick={() => setRevoking(false)}>
                Keep sharing
              </Button>
              <Button variant="danger" busy={busy} onClick={revoke}>
                Revoke link
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setRevoking(true)}
            disabled={!url}
          >
            <Link2 size={14} /> Revoke this sharing link
          </Button>
        )}
      </div>
    </Modal>
  );
}
// what makes a profile complete enough to share well
const strengthItems: {
  key: string;
  label: string;
  done: (p: Profile) => boolean;
}[] = [
  { key: "photo", label: "a photo", done: (p) => !!p.photo },
  { key: "title", label: "your role", done: (p) => !!p.title },
  {
    key: "org",
    label: "your company or university",
    done: (p) => !!(p.company || p.university),
  },
  { key: "email", label: "your email", done: (p) => !!p.email },
  { key: "phone", label: "your phone", done: (p) => !!p.phone },
  { key: "linkedin", label: "your LinkedIn", done: (p) => !!p.linkedin },
  { key: "bio", label: "a line about you", done: (p) => !!p.bio },
];
// "a, b and c"
const listOf = (items: string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
    : items[0] || "";
export function profileStrength(p: Profile) {
  const missing = strengthItems.filter((i) => !i.done(p));
  return {
    done: strengthItems.length - missing.length,
    total: strengthItems.length,
    missing: missing.map((i) => i.label),
  };
}
export function ProfileView({
  user,
  capabilities,
  onSaved,
  startedFrom = null,
  onSeeCard,
}: {
  user: User;
  capabilities: Capabilities;
  onSaved: (user: User) => void;
  onSeeCard?: () => void;
  // this profile was just filled at sign-up, from the person's card or LinkedIn link
  startedFrom?: "card" | "linkedin" | null;
}) {
  const [profile, setProfile] = useState<Profile>(user.profile);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [filledByAi, setFilledByAi] = useState<boolean | null>(null);
  const strength = profileStrength(profile);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ user: User }>("profile", "PUT", profile);
      onSaved(result.user);
      setFilledByAi(null);
      setMessage("Your profile and active card links are updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // the photo is saved right away, on top of the last saved profile
  async function savePhoto(photo: string) {
    setPhotoBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ user: User }>("profile", "PUT", {
        ...user.profile,
        photo,
      });
      onSaved(result.user);
      setProfile((p) => ({ ...p, photo }));
      setMessage(photo ? "Photo saved." : "Photo removed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function choosePhoto(file?: File) {
    if (!file) return;
    try {
      await savePhoto(await squarePhoto(file));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <section className="page-intro">
        <div>
          <h1>Profile</h1>
          <p>Your cards take their details from here.</p>
        </div>
        <Button variant="secondary" onClick={() => setScanning(true)}>
          <ScanLine size={16} /> Fill from my business card
        </Button>
      </section>
      {startedFrom && filledByAi === null && !message ? (
        // the same next step as the mockup, after a profile is made from a card
        <div className="next-step">
          <Check size={18} />
          <span>
            <strong>Your profile is ready</strong>
            <span>
              {startedFrom === "card"
                ? "Wasl filled it in from your card and made your first card from it. Check each detail below."
                : "Your LinkedIn link is on it, and Wasl made your first card from it. Add your role and where you study or work below."}
            </span>
          </span>
          <Button onClick={onSeeCard}>
            See my card <ArrowRight size={16} />
          </Button>
        </div>
      ) : null}
      <div className="profile-editor">
        <div className="profile-editor-heading">
          <Avatar
            name={profile.name || user.name}
            size="large"
            photo={profile.photo || undefined}
          />
          <div className="profile-heading-text">
            <h3>{profile.name || user.name}</h3>
            <div className="photo-actions">
              <label className={`text-button ${photoBusy ? "busy" : ""}`}>
                <Camera size={15} />
                {profile.photo ? "Change photo" : "Add a photo"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={photoBusy}
                  onChange={(e) => {
                    void choosePhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {profile.photo ? (
                <button
                  type="button"
                  className="text-button"
                  disabled={photoBusy}
                  onClick={() => void savePhoto("")}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="strength" aria-label="Profile strength">
          <div className="strength-top">
            <strong>
              {strength.done === strength.total
                ? "Your profile is complete"
                : `Profile ${strength.done} of ${strength.total}`}
            </strong>
            <span>{Math.round((strength.done / strength.total) * 100)}%</span>
          </div>
          <div className="strength-bar">
            <i
              style={{ width: `${(strength.done / strength.total) * 100}%` }}
            />
          </div>
          {strength.missing.length ? (
            <p className="muted small-copy">
              Add {listOf(strength.missing.slice(0, 3))}
              {strength.missing.length > 3 ? " and more" : ""} so people
              remember you. Each card shares only what you choose.
            </p>
          ) : null}
        </div>
        {filledByAi !== null ? (
          <p className={`draft-source ${filledByAi ? "ai" : ""}`}>
            {filledByAi ? <Sparkles size={15} /> : <ScanLine size={15} />}
            Filled from your card. Check each detail, then save.
          </p>
        ) : null}
        <form onSubmit={submit}>
          <ProfileFields
            key={filledByAi === null ? "typed" : "scanned"}
            value={profile}
            onChange={setProfile}
          />
          {error ? <Notice error>{error}</Notice> : null}
          {message ? <Notice>{message}</Notice> : null}
          <div className="form-actions">
            <Button type="submit" busy={busy}>
              Save profile
            </Button>
          </div>
        </form>
      </div>
      {scanning ? (
        <ScanModal
          own
          capabilities={capabilities}
          onClose={() => setScanning(false)}
          onDraft={(found, byAi) => {
            setScanning(false);
            setMessage("");
            // keep what's already there unless the card has it
            setProfile((p) => {
              const next = { ...p };
              for (const [k, v] of Object.entries(found))
                if (typeof v === "string" && v.trim())
                  (next as Record<string, string>)[k] = v.trim();
              return next;
            });
            setFilledByAi(byAi);
          }}
        />
      ) : null}
    </>
  );
}
