"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Check,
  LoaderCircle,
  LocateFixed,
  QrCode,
  Tag,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Star,
  Users,
  X,
  ScanLine,
  Trash2,
  RefreshCw,
  Pencil,
  Download,
  Sparkles,
  Send,
  Mail,
  Share2,
  Copy,
} from "lucide-react";
import {
  api,
  autoLocation,
  lastMeeting,
  locatePlace,
  rememberMeeting,
  shortDate,
  today,
} from "@/lib/client";
import {
  blankProfile,
  suggestedTags,
  type Card,
  type Connection,
  type Profile,
} from "@/lib/types";
import {
  Avatar,
  Button,
  Modal,
  Notice,
  ProfileFields,
  ProfileLinks,
} from "./ui";
import { VoiceMemory } from "./voice-memory";
type Group = "recent" | "event" | "company" | "tag";
type Album = {
  key: string;
  name: string;
  kind: "event" | "company" | "mine";
  people: Connection[];
};
const companyOf = (c: Connection) =>
  (c.profile.company || c.profile.university || "").trim();
// Albums build themselves from where you met and where people work; your own albums join them.
export function albumsOf(contacts: Connection[]): Album[] {
  const groups = new Map<string, Album>();
  const add = (kind: Album["kind"], name: string, c: Connection) => {
    const key = `${kind}:${name.toLowerCase()}`;
    const album = groups.get(key) || { key, name, kind, people: [] };
    if (!album.people.includes(c)) album.people.push(c);
    groups.set(key, album);
  };
  for (const c of contacts) {
    if (c.event.trim()) add("event", c.event.trim(), c);
    if (companyOf(c)) add("company", companyOf(c), c);
    for (const a of c.albums || []) add("mine", a, c);
  }
  return [...groups.values()]
    .filter((a) => a.kind !== "company" || a.people.length > 1)
    .sort(
      (a, b) =>
        Number(b.kind === "mine") - Number(a.kind === "mine") ||
        b.people.length - a.people.length ||
        a.name.localeCompare(b.name),
    );
}
// the people from today, or else from the last day you met anyone
export function tonightsPeople(contacts: Connection[]) {
  const day = today();
  const todays = contacts.filter((c) => c.met_on.slice(0, 10) === day);
  if (todays.length) return { people: todays, today: true };
  const latest = contacts
    .map((c) => c.met_on.slice(0, 10))
    .sort()
    .at(-1);
  return {
    people: latest
      ? contacts.filter((c) => c.met_on.slice(0, 10) === latest)
      : [],
    today: false,
  };
}
const albumLabel = { event: "Event", company: "Company", mine: "Your album" };
export function NetworkView({
  contacts,
  onOpen,
  onAdd,
  onScan,
  onScanCode,
  onRecall,
  onDebrief,
  onChanged,
}: {
  contacts: Connection[];
  onOpen: (contact: Connection) => void;
  onAdd: () => void;
  onScan: () => void;
  onScanCode: () => void;
  onRecall: () => void;
  onDebrief: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group>("recent");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [albumKey, setAlbumKey] = useState("");
  const [editingAlbum, setEditingAlbum] = useState<Album | null | undefined>();
  const albums = useMemo(() => albumsOf(contacts), [contacts]);
  const album = albums.find((a) => a.key === albumKey);
  const fresh = contacts.filter((c) => c.unseen);
  const tonight = tonightsPeople(contacts);
  const filtered = (album ? album.people : contacts).filter(
    (c) =>
      (!onlyFavorites || c.favorite) &&
      [
        ...Object.entries(c.profile)
          .filter(([k]) => k !== "photo")
          .map(([, v]) => v),
        c.event,
        c.place,
        ...c.tags,
        ...(c.albums || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const sections: [string, Connection[]][] =
    group === "recent"
      ? [["", filtered]]
      : Object.entries(
          filtered.reduce<Record<string, Connection[]>>((acc, c) => {
            const keys =
              group === "event"
                ? [c.event.trim() || "No event"]
                : group === "company"
                  ? [companyOf(c) || "No company"]
                  : c.tags.length
                    ? c.tags
                    : ["No tag"];
            for (const k of keys) (acc[k] ||= []).push(c);
            return acc;
          }, {}),
        ).sort(
          (a, b) =>
            Number(a[0].startsWith("No ")) - Number(b[0].startsWith("No ")) ||
            b[1].length - a[1].length,
        );
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const recent = contacts.filter(
    (c) => new Date(c.created_at).getTime() >= monthStart,
  ).length;
  return (
    <>
      <section className="page-intro">
        <div>
          <span className="eyebrow">YOUR PEOPLE, IN ONE PLACE</span>
          <h1>Your network</h1>
          <p>Good connections deserve more than a name in your phone.</p>
        </div>
        <div className="row intro-actions">
          <Button variant="secondary" onClick={onScanCode}>
            <QrCode size={16} /> Scan their code
          </Button>
          <Button variant="secondary" onClick={onScan}>
            <ScanLine size={16} /> Scan a card
          </Button>
          <Button onClick={onAdd}>
            <Plus size={17} /> Add a connection
          </Button>
        </div>
      </section>
      {fresh.length ? (
        <button className="swap-news" onClick={() => onOpen(fresh[0])}>
          <ArrowLeftRight size={18} />
          <span>
            <strong>
              {fresh.length === 1
                ? `${fresh[0].profile.name} swapped cards with you`
                : `${fresh.length} people swapped cards with you`}
            </strong>
            <span>
              {fresh.length === 1
                ? "Their card is in your network. Tap to open it."
                : "Their cards are in your network. Tap to open."}
            </span>
          </span>
          <ArrowRight size={17} />
        </button>
      ) : null}
      <div className="stats-strip">
        <div>
          <span className="stat-icon">
            <Users size={18} />
          </span>
          <div>
            <strong>{contacts.length}</strong>
            <span>Connections</span>
          </div>
        </div>
        <div>
          <span className="stat-icon violet">
            <CalendarDays size={18} />
          </span>
          <div>
            <strong>{recent}</strong>
            <span>Added this month</span>
          </div>
        </div>
        <div>
          <span className="stat-icon coral">
            <MessageSquare size={18} />
          </span>
          <div>
            <strong>
              {contacts.reduce((n, c) => n + (c.note_count || 0), 0)}
            </strong>
            <span>Memories saved</span>
          </div>
        </div>
      </div>
      {tonight.people.length ? (
        <button className="tonight-banner" onClick={onDebrief}>
          <span className="tonight-faces" aria-hidden="true">
            {tonight.people.slice(0, 3).map((c, i) => (
              <Avatar
                key={c.id}
                name={c.profile.name || "Contact"}
                photo={c.profile.photo}
                color={["ocean", "violet", "coral"][i]}
              />
            ))}
          </span>
          <span>
            <strong>
              {tonight.today
                ? `You met ${tonight.people.length} ${tonight.people.length === 1 ? "person" : "people"} today`
                : `Your last event: ${tonight.people[0].event || shortDate(tonight.people[0].met_on)}`}
            </strong>
            <span>
              Go through them while you remember: favorite, keep, add a memory.
            </span>
          </span>
          <ArrowRight size={18} />
        </button>
      ) : null}
      <button className="recall-banner" onClick={onRecall}>
        <div>
          <span className="eyebrow">REMEMBER THE CONVERSATION?</span>
          <h3>Find the person behind it.</h3>
          <p>Search your saved details, notes and the places you met.</p>
        </div>
        <span className="banner-arrow">
          <ArrowRight size={20} />
        </span>
      </button>
      {contacts.length ? (
        <section className="albums-section">
          <div className="section-heading">
            <h2>
              Albums <span className="auto-label">BUILD THEMSELVES</span>
            </h2>
          </div>
          <div className="album-strip">
            {albums.map((a) => (
              <button
                key={a.key}
                className={`album-tile ${albumKey === a.key ? "active" : ""}`}
                aria-pressed={albumKey === a.key}
                onClick={() => {
                  setAlbumKey(albumKey === a.key ? "" : a.key);
                  // show who's in it (on a phone the list is below the albums)
                  if (albumKey !== a.key)
                    setTimeout(
                      () =>
                        document
                          .querySelector(".network-section")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          }),
                      50,
                    );
                }}
              >
                <span className="album-cover" aria-hidden="true">
                  {a.people.slice(0, 3).map((c, i) => (
                    <Avatar
                      key={c.id}
                      name={c.profile.name || "Contact"}
                      photo={c.profile.photo}
                      color={["ocean", "violet", "coral"][i]}
                    />
                  ))}
                </span>
                <strong>{a.name}</strong>
                <span>
                  {albumLabel[a.kind]} · {a.people.length}{" "}
                  {a.people.length === 1 ? "person" : "people"}
                </span>
              </button>
            ))}
            <button
              className="album-tile new"
              onClick={() => setEditingAlbum(null)}
            >
              <span className="album-cover" aria-hidden="true">
                <Plus size={22} />
              </span>
              <strong>New album</strong>
              <span>Make your own</span>
            </button>
          </div>
        </section>
      ) : null}
      <section className="network-section">
        <div className="section-heading">
          <h2>
            {album ? album.name : "Your connections"}{" "}
            <span>{album ? album.people.length : contacts.length}</span>
          </h2>
          <div className="search-box">
            <Search size={16} />
            <input
              aria-label="Filter connections"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, role, company…"
            />
            {query ? (
              <button
                className="icon-button"
                aria-label="Clear filter"
                onClick={() => setQuery("")}
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>
        {album ? (
          <div className="album-bar">
            <span>
              {albumLabel[album.kind]} album
              {album.kind === "mine" ? "" : " · built from your connections"}
            </span>
            {album.kind === "mine" ? (
              <button
                className="text-button"
                onClick={() => setEditingAlbum(album)}
              >
                <Pencil size={13} /> Edit album
              </button>
            ) : null}
            <button className="text-button" onClick={() => setAlbumKey("")}>
              <X size={13} /> Show everyone
            </button>
          </div>
        ) : null}
        <div className="filter-row" role="group" aria-label="Group by">
          {(
            [
              ["recent", "Recent"],
              ["event", "Event"],
              ["company", "Company"],
              ["tag", "Tag"],
            ] as const
          ).map(([g, label]) => (
            <button
              key={g}
              className={`filter-chip ${group === g ? "active" : ""}`}
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
            >
              {label}
            </button>
          ))}
          <button
            className={`filter-chip ${onlyFavorites ? "active" : ""}`}
            aria-pressed={onlyFavorites}
            onClick={() => setOnlyFavorites(!onlyFavorites)}
          >
            <Star size={12} /> Favorites
          </button>
        </div>
        {!contacts.length ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Users size={30} />
            </span>
            <h3>Start with one meaningful connection.</h3>
            <p>
              Swap cards with someone, scan their paper card, or add them by
              hand. Then save where you met and what you talked about.
            </p>
            <div className="row center">
              <Button variant="secondary" onClick={onScanCode}>
                <QrCode size={16} /> Scan their code
              </Button>
              <Button onClick={onAdd}>
                <Plus size={16} /> Add your first connection
              </Button>
            </div>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state small">
            <Search size={27} />
            <h3>No connections match this filter.</h3>
            <p>
              Try another name or category, or use Search to look through your
              notes.
            </p>
          </div>
        ) : (
          sections.map(([heading, people]) => (
            <div key={heading || "all"} className="contact-group">
              {heading ? (
                <h3 className="group-heading">
                  {heading} <span>{people.length}</span>
                </h3>
              ) : null}
              <div className="contact-grid">
                {people.map((c, index) => (
                  <ContactTile
                    key={c.id}
                    contact={c}
                    index={index}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
      {editingAlbum !== undefined ? (
        <AlbumEditor
          album={editingAlbum}
          contacts={contacts}
          onClose={() => setEditingAlbum(undefined)}
          onSaved={(name) => {
            setEditingAlbum(undefined);
            setAlbumKey(name ? `mine:${name.toLowerCase()}` : "");
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
function ContactTile({
  contact: c,
  index,
  onOpen,
}: {
  contact: Connection;
  index: number;
  onOpen: (contact: Connection) => void;
}) {
  return (
    <button className="contact-card" onClick={() => onOpen(c)}>
      <div className="contact-top">
        <Avatar
          name={c.profile.name || "Contact"}
          photo={c.profile.photo}
          color={["ocean", "violet", "coral", "ink"][index % 4]}
        />
        {c.unseen ? (
          <span className="pill new-pill">New</span>
        ) : c.favorite ? (
          <Star size={15} className="favorite filled" />
        ) : (
          <ArrowRight className="contact-arrow" size={17} />
        )}
      </div>
      <h3>{c.profile.name}</h3>
      <p className="contact-role">
        {[c.profile.title, c.profile.company || c.profile.university]
          .filter(Boolean)
          .join(" · ") || "A new connection"}
      </p>
      <div className="contact-tags">
        {c.tags.slice(0, 3).map((t) => (
          <span className="pill" key={t}>
            {t}
          </span>
        ))}
      </div>
      <div className="contact-context">
        {c.event ? (
          <span>
            <CalendarDays size={13} />
            {c.event}
          </span>
        ) : c.place ? (
          <span>
            <MapPin size={13} />
            {c.place}
          </span>
        ) : (
          <span>
            <CalendarDays size={13} />
            Met {shortDate(c.met_on)}
          </span>
        )}
        <span>
          <MessageSquare size={13} />
          {c.note_count || 0} {(c.note_count || 0) === 1 ? "note" : "notes"}
        </span>
      </div>
    </button>
  );
}
function AlbumEditor({
  album,
  contacts,
  onClose,
  onSaved,
}: {
  album: Album | null;
  contacts: Connection[];
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(album?.name || "");
  const [chosen, setChosen] = useState<string[]>(
    album?.people.map((c) => c.id) || [],
  );
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shown = contacts.filter((c) =>
    `${c.profile.name} ${companyOf(c)} ${c.event}`
      .toLowerCase()
      .includes(find.toLowerCase()),
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("albums", "PUT", {
        name: name.trim(),
        ...(album ? { previous_name: album.name } : {}),
        connection_ids: chosen,
      });
      onSaved(name.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!album) return;
    setBusy(true);
    try {
      await api(`albums/${encodeURIComponent(album.name)}`, "DELETE");
      onSaved("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={album ? "Edit album" : "New album"}
      description="Group people your own way, like a project, a team or a trip."
      onClose={onClose}
    >
      <form onSubmit={save}>
        <label>
          <span>Album name</span>
          <input
            value={name}
            required
            maxLength={60}
            placeholder="e.g. Startup mentors"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          <span>
            Who&rsquo;s in it · {chosen.length}{" "}
            {chosen.length === 1 ? "person" : "people"}
          </span>
          <input
            value={find}
            placeholder="Find someone"
            aria-label="Find someone"
            onChange={(e) => setFind(e.target.value)}
          />
        </label>
        <div className="people-picker">
          {shown.map((c) => (
            <label key={c.id} className="field-choice">
              <input
                type="checkbox"
                checked={chosen.includes(c.id)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, c.id]
                      : chosen.filter((id) => id !== c.id),
                  )
                }
              />
              <span>
                <strong>{c.profile.name}</strong>
                <small>
                  {[c.profile.title, companyOf(c)]
                    .filter(Boolean)
                    .join(" · ") ||
                    c.event ||
                    "Connection"}
                </small>
              </span>
            </label>
          ))}
          {!shown.length ? <p className="muted">No one matches.</p> : null}
        </div>
        {error ? <Notice error>{error}</Notice> : null}
        <div className="form-actions">
          {album ? (
            confirmDelete ? (
              <Button
                type="button"
                variant="danger"
                busy={busy}
                onClick={remove}
              >
                Delete album (people stay)
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} /> Delete album
              </Button>
            )
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!name.trim()}>
            Save album
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function ConnectionForm({
  contact,
  draft,
  draftByAi,
  knownTags = [],
  onClose,
  onSaved,
}: {
  contact?: Connection;
  draft?: Profile;
  draftByAi?: boolean;
  knownTags?: string[];
  onClose: () => void;
  onSaved: (contact: Connection) => void;
}) {
  // a new person starts with where you met the last person you saved today
  const [carried] = useState(() => (contact ? null : lastMeeting()));
  const [profile, setProfile] = useState<Profile>({
    ...blankProfile,
    ...contact?.profile,
    ...draft,
  });
  const [tags, setTags] = useState<string[]>(contact?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [event, setEvent] = useState(contact?.event || carried?.event || "");
  const [place, setPlace] = useState(contact?.place || carried?.place || "");
  const [placeFrom, setPlaceFrom] = useState<"" | "carried" | "location">(
    carried?.place ? "carried" : "",
  );
  const [locating, setLocating] = useState(false);
  const [metOn, setMetOn] = useState(contact?.met_on.slice(0, 10) || today());
  const [favorite, setFavorite] = useState(contact?.favorite || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tagChoices = [
    ...new Set([...suggestedTags, ...knownTags, ...tags]),
  ].slice(0, 16);
  async function fillLocation() {
    setLocating(true);
    setError("");
    try {
      setPlace(await locatePlace());
      setPlaceFrom("location");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }
  useEffect(() => {
    if (!contact && !carried?.place && autoLocation.get()) void fillLocation();
  }, []);
  function addTag() {
    const t = newTag.trim().slice(0, 40);
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setNewTag("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const pending = newTag.trim() ? [...tags, newTag.trim()] : tags;
      const result = await api<{ connection: Connection }>(
        `connections${contact ? `/${contact.id}` : ""}`,
        contact ? "PUT" : "POST",
        {
          profile,
          tags: pending,
          event,
          place,
          met_on: metOn,
          favorite,
          origin: !contact && draft ? "scan" : "",
        },
      );
      if (!contact) rememberMeeting(event, place);
      onSaved(result.connection);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={contact ? "Edit connection" : "A new connection"}
      description="The details help you reach them. The context helps you remember them."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        {draft && !contact ? (
          <p className={`draft-source ${draftByAi ? "ai" : ""}`}>
            {draftByAi ? <Sparkles size={15} /> : <ScanLine size={15} />}
            {draftByAi
              ? "Wasl's AI read these details from the card. Check each one before saving."
              : "Read from the card. Check each detail before saving."}
          </p>
        ) : null}
        <ProfileFields value={profile} onChange={setProfile} />
        <div className="form-divider">WHERE YOU MET</div>
        <div className="form-grid">
          <label>
            <span>Event or occasion</span>
            <input
              value={event}
              maxLength={200}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="e.g. Web Summit Qatar"
            />
          </label>
          <label>
            <span>Place</span>
            <span className="input-with-action">
              <input
                value={place}
                maxLength={200}
                onChange={(e) => {
                  setPlace(e.target.value);
                  setPlaceFrom("");
                }}
                placeholder="e.g. Doha"
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
            <span>When did you meet?</span>
            <input
              type="date"
              value={metOn}
              onChange={(e) => setMetOn(e.target.value)}
              required
            />
          </label>
        </div>
        {carried?.event && event === carried.event ? (
          <p className="field-hint">
            <CalendarDays size={13} /> Same event as the last person you saved
            today.
          </p>
        ) : null}
        {placeFrom === "location" ? (
          <p className="field-hint">
            <MapPin size={13} /> Place from your location. Change it if
            it&rsquo;s not right.
          </p>
        ) : placeFrom === "carried" && place ? (
          <p className="field-hint">
            <MapPin size={13} /> Same place as the last person you saved today.
          </p>
        ) : null}
        <div className="form-divider">ADD A TAG · ONE TAP</div>
        <div className="tag-picker" role="group" aria-label="Tags">
          {tagChoices.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                type="button"
                key={t}
                className={`filter-chip ${on ? "active" : ""}`}
                aria-pressed={on}
                onClick={() =>
                  setTags(on ? tags.filter((x) => x !== t) : [...tags, t])
                }
              >
                {on ? <Check size={12} /> : <Tag size={12} />} {t}
              </button>
            );
          })}
          <span className="tag-add">
            <input
              value={newTag}
              maxLength={40}
              placeholder="Your own tag"
              aria-label="Your own tag"
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Add tag"
              onClick={addTag}
            >
              <Plus size={15} />
            </button>
          </span>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          <span>Add to favorites</span>
        </label>
        {error ? <Notice error>{error}</Notice> : null}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {contact ? "Save changes" : "Save connection"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function ConnectionDetail({
  initial,
  onClose,
  onEdit,
  onChanged,
}: {
  initial: Connection;
  onClose: () => void;
  onEdit: (c: Connection) => void;
  onChanged: () => void;
}) {
  const [contact, setContact] = useState(initial);
  const [body, setBody] = useState("");
  const [noteDate, setNoteDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loaded, setLoaded] = useState(!!initial.notes);
  async function load() {
    try {
      const data = await api<{ connection: Connection }>(
        `connections/${contact.id}`,
      );
      setContact(data.connection);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // Load details once rather than including private note bodies in the list API.
  useEffect(() => {
    void load();
  }, [initial.id]);
  async function addNote(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`connections/${contact.id}/notes`, "POST", {
        body,
        happened_on: noteDate,
      });
      setBody("");
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // key points from a recorded chat are saved like any other private note
  async function saveVoiceNote(text: string) {
    await api(`connections/${contact.id}/notes`, "POST", {
      body: text,
      happened_on: today(),
    });
    await load();
    onChanged();
  }
  async function removeNote(id: string) {
    setBusy(true);
    try {
      await api(`notes/${id}`, "DELETE");
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`connections/${contact.id}`, "DELETE");
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleFavorite() {
    setError("");
    try {
      const result = await api<{ connection: Connection }>(
        `connections/${contact.id}/favorite`,
        "POST",
        { favorite: !contact.favorite },
      );
      setContact({ ...contact, favorite: result.connection.favorite });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ connection: Connection }>(
        `connections/${contact.id}/refresh`,
        "POST",
        {},
      );
      setContact(result.connection);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Connection details" onClose={onClose} wide>
      <div className="detail-profile">
        <Avatar
          name={contact.profile.name || "Contact"}
          size="large"
          photo={contact.profile.photo}
        />
        <div>
          <h2>{contact.profile.name}</h2>
          <p>
            {[
              contact.profile.title,
              contact.profile.company || contact.profile.university,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="contact-tags">
            {contact.tags.map((t) => (
              <span key={t} className="pill">
                {t}
              </span>
            ))}
            {(contact.albums || []).map((a) => (
              <span key={`album-${a}`} className="pill album-pill">
                {a}
              </span>
            ))}
          </div>
          {originText[contact.origin] ? (
            <p className="origin-line">{originText[contact.origin]}</p>
          ) : null}
        </div>
        <div className="detail-tools">
          <button
            className={`icon-button ${contact.favorite ? "starred" : ""}`}
            onClick={() => void toggleFavorite()}
            aria-label={
              contact.favorite ? "Remove from favorites" : "Add to favorites"
            }
            aria-pressed={contact.favorite}
          >
            <Star size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => onEdit(contact)}
            aria-label="Edit connection"
          >
            <Pencil size={18} />
          </button>
        </div>
      </div>
      {contact.profile.bio ? (
        <p className="bio">{contact.profile.bio}</p>
      ) : null}
      <ProfileLinks profile={contact.profile} />
      <div className="meeting-context">
        <CalendarDays size={18} />
        <div>
          <strong>{contact.event || "Your first connection"}</strong>
          <p>
            {[contact.place, shortDate(contact.met_on)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <span className="muted">Saved {shortDate(contact.created_at)}</span>
        </div>
      </div>
      <div className="detail-actions">
        <a
          className="button secondary"
          href={`/api/connections/${contact.id}/vcard`}
        >
          <Download size={15} /> Save to phone
        </a>
        {contact.source_share_id ? (
          <Button variant="secondary" busy={busy} onClick={refresh}>
            <RefreshCw size={15} /> Update shared details
          </Button>
        ) : null}
      </div>
      {!contact.source_share_id ? <Invite contact={contact} /> : null}
      <div className="form-divider">
        <MessageSquare size={15} /> YOUR PRIVATE MEMORY
      </div>
      <p className="private-copy">
        Only you can see these notes. They are never included in a shared card.
      </p>
      <VoiceMemory name={contact.profile.name || ""} onSave={saveVoiceNote} />
      <form onSubmit={addNote}>
        <label>
          <span>Add an interaction or something to remember</span>
          <textarea
            placeholder="What did you talk about? What would you like to follow up on?"
            value={body}
            maxLength={5000}
            required
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="note-actions">
          <input
            type="date"
            aria-label="Interaction date"
            value={noteDate}
            required
            onChange={(e) => setNoteDate(e.target.value)}
          />
          <Button type="submit" busy={busy}>
            Save memory
          </Button>
        </div>
      </form>
      {error ? <Notice error>{error}</Notice> : null}
      <div className="timeline">
        {!loaded ? (
          <p className="muted">Loading memories…</p>
        ) : !contact.notes?.length ? (
          <p className="muted">Your story with this person starts here.</p>
        ) : (
          contact.notes.map((note) => (
            <article key={note.id}>
              <div className="timeline-dot" />
              <div>
                <time>{shortDate(note.happened_on)}</time>
                <p>{note.body}</p>
              </div>
              <button
                className="icon-button"
                aria-label="Delete note"
                onClick={() => void removeNote(note.id)}
                disabled={busy}
              >
                <X size={15} />
              </button>
            </article>
          ))
        )}
      </div>
      <div className="danger-zone">
        {confirmDelete ? (
          <>
            <p>
              Delete this connection and all its private memories? This cannot
              be undone.
            </p>
            <div className="row">
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Keep connection
              </Button>
              <Button variant="danger" busy={busy} onClick={remove}>
                Delete permanently
              </Button>
            </div>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> Delete connection
          </Button>
        )}
      </div>
    </Modal>
  );
}

const originText: Record<string, string> = {
  swap: "Swapped cards with you",
  link: "Saved from their Wasl card",
  scan: "Scanned from a paper card",
};
// People without Wasl get your card link by email, text or the phone's share sheet.
function Invite({ contact }: { contact: Connection }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const first = contact.profile.name?.split(" ")[0] || "them";
  const message = `Hi ${first}, it was great meeting you${contact.event ? ` at ${contact.event}` : ""}. Here's my card on Wasl, so we stay in touch: ${link}`;
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const { cards } = await api<{ cards: Card[] }>("cards");
      const card = cards.find((c) => c.kind === "professional") || cards[0];
      if (!card) throw new Error("Make a card first, then invite people.");
      const token =
        card.token ||
        (await api<{ token: string }>(`cards/${card.id}/share`, "POST", {}))
          .token;
      setLink(new URL(`/c/${token}`, window.location.origin).href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setError("Copy the message below to send it.");
    }
  }
  return (
    <div className="invite-box">
      <div className="invite-head">
        <Send size={17} />
        <div>
          <strong>Invite {first} to Wasl</strong>
          <span>Send your card so {first} has you too.</span>
        </div>
        {!link ? (
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void prepare()}
          >
            Invite
          </Button>
        ) : null}
      </div>
      {link ? (
        <>
          <p className="invite-message">{message}</p>
          <div className="invite-actions">
            {contact.profile.email ? (
              <a
                className="button secondary"
                href={`mailto:${encodeURIComponent(contact.profile.email)}?subject=${encodeURIComponent("Great meeting you")}&body=${encodeURIComponent(message)}`}
              >
                <Mail size={15} /> Email
              </a>
            ) : null}
            {contact.profile.phone ? (
              <a
                className="button secondary"
                href={`sms:${contact.profile.phone.replace(/[^+\d]/g, "")}${/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(message)}`}
              >
                <MessageSquare size={15} /> Text
              </a>
            ) : null}
            {typeof navigator !== "undefined" && navigator.share ? (
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.share({ text: message }).catch(() => {})
                }
              >
                <Share2 size={15} /> Share
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </>
      ) : null}
      {error ? <Notice error>{error}</Notice> : null}
    </div>
  );
}
