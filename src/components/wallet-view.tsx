"use client";
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  ArrowUpRight,
  Check,
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
  fieldLabels,
  profileFields,
  type Card,
  type Profile,
  type User,
} from "@/lib/types";
import { Avatar, Button, Modal, Notice, ProfileFields } from "./ui";
export function WalletView({
  cards,
  user,
  onChanged,
  onProfile,
}: {
  cards: Card[];
  user: User;
  onChanged: () => void;
  onProfile: () => void;
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
          <span className="eyebrow">ONE YOU. DIFFERENT CONTEXTS.</span>
          <h1>Your card wallet</h1>
          <p>Choose the right identity for the moment.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={17} /> Create a card
        </Button>
      </section>
      <div className="wallet-guidance">
        <ShieldCheck size={21} />
        <div>
          <strong>You decide what leaves your wallet.</strong>
          <p>
            Each card shares only the fields you select. Your private notes
            always stay with you.
          </p>
        </div>
        <Button variant="ghost" onClick={onProfile}>
          Edit your details <ArrowUpRight size={15} />
        </Button>
      </div>
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
              <div className={`digital-card ${card.color}`}>
                <div className="digital-card-top">
                  <span className="mini-wordmark">wasl</span>
                  <span>{card.kind}</span>
                </div>
                <Avatar name={user.name} />
                <h2>{user.name}</h2>
                <p>
                  {[
                    card.profile?.title,
                    card.profile?.company || card.profile?.university,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="digital-card-bottom">
                  <span>{card.label}</span>
                  <QrCode size={26} />
                </div>
              </div>
              <div className="wallet-card-info">
                <div>
                  <h3>{card.label}</h3>
                  <span>
                    {card.fields.length} selected fields ·{" "}
                    {card.token ? "Link active" : "Link not shared"}
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
              <div className="wallet-fields">
                {card.fields.map((f) => (
                  <span key={f}>{fieldLabels[f]}</span>
                ))}
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
function CardForm({
  card,
  profile,
  onClose,
  onSaved,
}: {
  card?: Card;
  profile: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(card?.label || "");
  const [kind, setKind] = useState<Card["kind"]>(card?.kind || "professional");
  const [color, setColor] = useState<Card["color"]>(card?.color || "ocean");
  const [fields, setFields] = useState(
    card?.fields || ["name", "title", "company", "email"],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`cards${card ? `/${card.id}` : ""}`, card ? "PUT" : "POST", {
        label,
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
      title={card ? "Edit your card" : "Create a card"}
      description="Choose the details you want to share in this context."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          <span>Card name</span>
          <input
            value={label}
            required
            maxLength={60}
            placeholder="e.g. Professional, Friends, Web Summit"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            <span>Card type</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Card["kind"])}
            >
              <option value="professional">Professional</option>
              <option value="social">Social</option>
              <option value="event">Event</option>
            </select>
          </label>
          <label>
            <span>Card color</span>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as Card["color"])}
            >
              <option value="ocean">Ocean</option>
              <option value="violet">Violet</option>
              <option value="coral">Coral</option>
              <option value="ink">Midnight</option>
            </select>
          </label>
        </div>
        <div className="field-selection">
          {profileFields.map((field) => (
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
                <strong>{fieldLabels[field]}</strong>
                <small>
                  {profile[field] || "Not added to your profile yet"}
                </small>
              </span>
              {fields.includes(field) ? <Check size={15} /> : null}
            </label>
          ))}
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
            Save card
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
}: {
  card: Card;
  onClose: () => void;
  onChanged: () => void;
}) {
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
        {card.fields.length} selected fields. No private notes.
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
export function ProfileView({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (user: User) => void;
}) {
  const [profile, setProfile] = useState<Profile>(user.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await api<{ user: User }>("profile", "PUT", profile);
      onSaved(result.user);
      setSaved(true);
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
          <span className="eyebrow">THE STARTING POINT FOR EVERY CARD</span>
          <h1>Your profile</h1>
          <p>Update once. Your active cards stay up to date.</p>
        </div>
      </section>
      <div className="profile-editor">
        <div className="profile-editor-heading">
          <Avatar name={profile.name || user.name} size="large" />
          <div>
            <h3>{user.name}</h3>
            <p className="muted">
              Choose what to share when you create a card.
            </p>
          </div>
        </div>
        <form onSubmit={submit}>
          <ProfileFields value={profile} onChange={setProfile} />
          {error ? <Notice error>{error}</Notice> : null}
          {saved ? (
            <Notice>Your profile and active card links are updated.</Notice>
          ) : null}
          <div className="form-actions">
            <Button type="submit" busy={busy}>
              Save profile
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
