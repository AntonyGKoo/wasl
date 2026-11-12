"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Download,
  LoaderCircle,
  LocateFixed,
  ShieldCheck,
} from "lucide-react";
import {
  api,
  autoLocation,
  lastMeeting,
  locatePlace,
  rememberMeeting,
  today,
} from "@/lib/client";
import { kindLabels, type Card, type PublicCard, type User } from "@/lib/types";
import { Avatar, Brand, Button, Notice, ProfileLinks } from "./ui";

export function PublicShare({ token }: { token: string }) {
  const [card, setCard] = useState<PublicCard | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [event, setEvent] = useState("");
  const [place, setPlace] = useState("");
  const [carried, setCarried] = useState(false);
  const [locating, setLocating] = useState(false);
  const [date, setDate] = useState(today());
  const [sendBack, setSendBack] = useState(true);
  const [backCard, setBackCard] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{
    id: string;
    swapped: boolean;
    before?: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          api<{ card: PublicCard; saved_id: string | null }>(`share/${token}`),
          api<{ user: User | null }>("session"),
        ]);
        let cards: Card[] = [];
        if (b.user) cards = (await api<{ cards: Card[] }>("cards")).cards;
        if (!active) return;
        setCard(a.card);
        setUser(b.user);
        // saved on an earlier visit: say so instead of offering to save it again
        if (a.saved_id)
          setSaved({ id: a.saved_id, swapped: false, before: true });
        setMyCards(cards);
        setBackCard(
          (cards.find((c) => c.kind === "professional") || cards[0])?.id || "",
        );
        const last = lastMeeting();
        if (last) {
          setEvent(last.event);
          setPlace(last.place);
          setCarried(true);
        } else if (b.user && autoLocation.get()) void fillLocation();
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);
  async function fillLocation() {
    setLocating(true);
    setError("");
    try {
      setPlace(await locatePlace());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }
  // your own card, opened from your own phone
  const own = myCards.some((c) => c.token === token);
  const first = card?.profile.name?.split(" ")[0] || "them";
  const chosen = myCards.find((c) => c.id === backCard);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      window.location.assign(`/?returnTo=${encodeURIComponent(`/c/${token}`)}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        connection: { id: string };
        swapped: boolean;
      }>("connections/import", "POST", {
        token,
        event,
        place,
        met_on: date,
        ...(sendBack && backCard ? { share_back_card_id: backCard } : {}),
      });
      rememberMeeting(event, place);
      setSaved({ id: result.connection.id, swapped: result.swapped });
    } catch (e) {
      // signed out in the meantime: sign in, then come straight back to this card
      if ((e as { status?: number }).status === 401)
        return window.location.assign(
          `/?returnTo=${encodeURIComponent(`/c/${token}`)}`,
        );
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="public-page">
      <a className="public-brand" href="/">
        <Brand />
      </a>
      {loading ? (
        <div className="loading">
          <LoaderCircle className="spin" /> Opening card…
        </div>
      ) : !card ? (
        <div className="public-card-shell">
          <h2>This card is no longer available.</h2>
          <p className="muted">
            {/* the heading already says it's gone; don't say it twice */}
            {error.replace(/^This card is no longer available\.\s*/, "") ||
              "Ask its owner for a new sharing link."}
          </p>
          <a href="/" className="button secondary">
            Open Wasl
          </a>
        </div>
      ) : (
        <div className="public-card-shell">
          <div className={`public-card-cover ${card.color}`}>
            <span>{card.label}</span>
            <ShieldCheck size={20} />
          </div>
          <div className="public-card-content">
            <Avatar
              name={card.profile.name || "Contact"}
              size="large"
              photo={card.profile.photo}
            />
            <h1>{card.profile.name}</h1>
            <p className="public-role">
              {[
                card.profile.title,
                card.profile.company,
                card.profile.university,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {card.profile.bio ? (
              <p className="bio">{card.profile.bio}</p>
            ) : null}
            <ProfileLinks profile={card.profile} />
            <a
              className="button secondary full"
              href={`/api/share/${token}/vcard`}
            >
              <Download size={16} /> Save contact to phone
            </a>
            {own ? (
              <div className="saved-connection">
                <h3>This is your card</h3>
                <p>
                  This is what people see when they scan your code. Only the
                  details you chose are here.
                </p>
                <a href="/?view=wallet" className="button primary">
                  Back to my cards <ArrowRight size={15} />
                </a>
              </div>
            ) : saved ? (
              <div className="saved-connection">
                <span>
                  {saved.swapped ? (
                    <ArrowLeftRight size={24} />
                  ) : (
                    <Check size={24} />
                  )}
                </span>
                <h3>
                  {saved.swapped
                    ? `You swapped cards with ${first}`
                    : saved.before
                      ? `${first} is already in your network`
                      : `${first} is in your network`}
                </h3>
                <p>
                  {saved.swapped
                    ? `${first} now has your ${chosen?.label || ""} card, and ${first}'s card is in your network. Add what you talked about while you remember it.`
                    : saved.before
                      ? "You saved this card before. Open it to see your notes or add a new one."
                      : "Add what you talked about while you remember it. Only you can see it."}
                </p>
                <a href={`/?contact=${saved.id}`} className="button primary">
                  Open {first} <ArrowRight size={15} />
                </a>
              </div>
            ) : (
              <>
                <div className="form-divider">
                  {user ? "Save and swap cards" : `Remember ${first} with Wasl`}
                </div>
                <form onSubmit={save}>
                  {user ? (
                    <>
                      <label>
                        <span>Where did you meet?</span>
                        <input
                          value={event}
                          onChange={(e) => {
                            setEvent(e.target.value);
                            setCarried(false);
                          }}
                          placeholder="Event or occasion"
                          maxLength={200}
                        />
                      </label>
                      {carried ? (
                        <p className="field-hint">
                          Same event as the last person you saved today.
                        </p>
                      ) : null}
                      <div className="form-grid">
                        <label>
                          <span>Place</span>
                          <span className="input-with-action">
                            <input
                              value={place}
                              onChange={(e) => setPlace(e.target.value)}
                              maxLength={200}
                              placeholder="City or venue"
                            />
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Use my location"
                              title="Use my location"
                              disabled={locating}
                              onClick={() => void fillLocation()}
                            >
                              {locating ? (
                                <LoaderCircle size={16} className="spin" />
                              ) : (
                                <LocateFixed size={16} />
                              )}
                            </button>
                          </span>
                        </label>
                        <label>
                          <span>Meeting date</span>
                          <input
                            type="date"
                            value={date}
                            required
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </label>
                      </div>
                      {myCards.length ? (
                        <div className="send-back">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={sendBack}
                              onChange={(e) => setSendBack(e.target.checked)}
                            />
                            <span>
                              Send {first} my card too, so we both have each
                              other
                            </span>
                          </label>
                          {sendBack && myCards.length > 1 ? (
                            <label>
                              <span>Which card?</span>
                              <select
                                value={backCard}
                                onChange={(e) => setBackCard(e.target.value)}
                              >
                                {myCards.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.label} ({kindLabels[c.kind]})
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>
                      ) : (
                        <p className="muted small-copy">
                          Make a card in Wasl to swap cards next time.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="muted small-copy">
                      Save this card with where you met and what you talked
                      about, and send your own card back. It&rsquo;s free and
                      takes a minute.
                    </p>
                  )}
                  {error ? <Notice error>{error}</Notice> : null}
                  <Button className="full" type="submit" busy={busy}>
                    {!user
                      ? `Save ${first} in Wasl`
                      : sendBack && backCard
                        ? "Swap cards"
                        : "Save to my Wasl network"}
                    <ArrowRight size={16} />
                  </Button>
                </form>
              </>
            )}
            <p className="public-privacy">
              <ShieldCheck size={13} /> This card only includes details its
              owner chose to share.
            </p>
          </div>
        </div>
      )}
      <footer className="public-footer">
        Never forget who you met, or why it mattered.
      </footer>
    </div>
  );
}
