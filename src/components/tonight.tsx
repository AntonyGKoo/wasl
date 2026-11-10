"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Mic, Star, X } from "lucide-react";
import { api, shortDate } from "@/lib/client";
import type { Connection } from "@/lib/types";
import { Avatar, Button, Modal, Notice } from "./ui";

export type Choice = "fav" | "keep";

// Right after an event: go through the people you met, one card at a time.
// Swipe right (or tap the star) to favorite, left (or tap ✕) to keep as a contact,
// the mic opens the person to record or type what you talked about.
export function TonightsPeople({
  people,
  today,
  start: startAt = 0,
  decided = {},
  onProgress,
  onClose,
  onOpen,
  onChanged,
}: {
  people: Connection[];
  today: boolean;
  start?: number;
  decided?: Record<string, Choice>;
  onProgress?: (index: number, choices: Record<string, Choice>) => void;
  onClose: () => void;
  onOpen: (contact: Connection) => void;
  onChanged: () => void;
}) {
  const [index, setIndex] = useState(startAt);
  const [choices, setChoices] = useState<Record<string, Choice>>(decided);
  // remember where the deck is and what was chosen, so it reopens the same way after a memory
  useEffect(() => {
    onProgress?.(index, choices);
  }, [index, choices]);
  const [dx, setDx] = useState(0);
  const [error, setError] = useState("");
  const start = useRef<number | null>(null);
  const current = people[index];
  const event = people.find((p) => p.event)?.event;
  const title = today ? "Today's people" : "Your last event";
  const subtitle = [
    event,
    today ? "today" : people[0] ? shortDate(people[0].met_on) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  async function decide(choice: Choice) {
    if (!current) return;
    setError("");
    setDx(0);
    const contact = current;
    setChoices((c) => ({ ...c, [contact.id]: choice }));
    setIndex((i) => i + 1);
    const favorite = choice === "fav";
    if (favorite !== contact.favorite)
      try {
        await api(`connections/${contact.id}/favorite`, "POST", { favorite });
        onChanged();
      } catch (e) {
        setError((e as Error).message);
      }
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    start.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (start.current !== null) setDx(e.clientX - start.current);
  }
  function up() {
    if (start.current === null) return;
    start.current = null;
    if (dx > 90) void decide("fav");
    else if (dx < -90) void decide("keep");
    else setDx(0);
  }

  const favs = Object.values(choices).filter((c) => c === "fav").length;
  const keeps = Object.values(choices).filter((c) => c === "keep").length;
  return (
    <Modal
      title={current ? title : "Everyone is saved"}
      description={
        current
          ? `${subtitle ? subtitle + " · " : ""}${index + 1} of ${people.length}`
          : subtitle
      }
      onClose={onClose}
    >
      {current ? (
        <>
          <div className="deck">
            {people
              .slice(index, index + 3)
              .reverse()
              .map((p, i, list) => {
                const top = i === list.length - 1;
                const depth = list.length - 1 - i;
                return (
                  <div
                    key={p.id}
                    className={`deck-card ${top ? "top" : ""}`}
                    style={{
                      transform: top
                        ? `translateX(${dx}px) rotate(${dx / 18}deg)`
                        : `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`,
                      zIndex: 10 - depth,
                    }}
                    onPointerDown={top ? down : undefined}
                    onPointerMove={top ? move : undefined}
                    onPointerUp={top ? up : undefined}
                    onPointerCancel={top ? () => setDx(0) : undefined}
                  >
                    {top && dx > 40 ? (
                      <span className="stamp fav">Favorite</span>
                    ) : null}
                    {top && dx < -40 ? (
                      <span className="stamp keep">Keep</span>
                    ) : null}
                    <Avatar
                      name={p.profile.name || "Contact"}
                      photo={p.profile.photo}
                      size="large"
                    />
                    <h3>{p.profile.name}</h3>
                    <p>
                      {[
                        p.profile.title,
                        p.profile.company || p.profile.university,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "A new connection"}
                    </p>
                    {p.tags.length ? (
                      <div className="contact-tags">
                        {p.tags.slice(0, 3).map((t) => (
                          <span className="pill" key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <span className="deck-memory">
                      {p.note_count
                        ? `${p.note_count} ${p.note_count === 1 ? "memory" : "memories"} saved`
                        : "No memory yet"}
                    </span>
                  </div>
                );
              })}
          </div>
          <div className="deck-actions">
            <button
              className="deck-button keep"
              aria-label="Keep as a contact"
              onClick={() => void decide("keep")}
            >
              <X size={24} />
            </button>
            <button
              className="deck-button memory"
              aria-label="Add a memory"
              onClick={() => onOpen(current)}
            >
              <Mic size={22} />
            </button>
            <button
              className="deck-button fav"
              aria-label="Favorite"
              onClick={() => void decide("fav")}
            >
              <Star size={24} />
            </button>
          </div>
          <p className="muted small-copy center">
            Swipe right to favorite · left to keep · mic to add a memory
          </p>
        </>
      ) : (
        <div className="deck-summary">
          <span className="deck-done">
            <Check size={26} />
          </span>
          <div className="service-row">
            <span>Favorites</span>
            <strong>{favs}</strong>
          </div>
          <div className="service-row">
            <span>Kept as contacts</span>
            <strong>{keeps}</strong>
          </div>
          {event ? (
            <div className="service-row">
              <span>Album</span>
              <strong>{event}</strong>
            </div>
          ) : null}
          <Button className="full" onClick={onClose}>
            Back to my network
          </Button>
        </div>
      )}
      {error ? <Notice error>{error}</Notice> : null}
    </Modal>
  );
}
