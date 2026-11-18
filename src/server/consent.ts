import { randomUUID } from "node:crypto";
import { consumeLimit } from "../lib/auth";
import { asUser, database, type Database } from "../lib/db";
import type { ConsentState, User } from "../lib/types";
import { HttpError } from "./responses";

// Recording a chat needs a yes from the other person, on their own phone in Wasl. Someone
// who isn't on Wasl can't be asked, so they can't be recorded; that is the rule, not a setting.
//
// A question waits a few minutes for an answer. A yes covers one recording: it ends when the
// asker stops, or when the person asked taps Stop on their phone.
const ASK_MINUTES = 3;
const YES_HOURS = 2;
const STATE = `CASE
  WHEN status='asked' AND created_at < now() - interval '${ASK_MINUTES} minutes' THEN 'expired'
  WHEN status='allowed' AND answered_at < now() - interval '${YES_HOURS} hours' THEN 'ended'
  ELSE status END`;

type Row = {
  id: string;
  asker_id: string;
  person_id: string;
  state: ConsentState;
};

export async function askConsent(
  user: User,
  connectionId: string,
  providedDb?: Database,
) {
  const db = providedDb ?? (await database());
  const [contact] = await asUser(
    user.id,
    (tx) =>
      tx.query<{
        source_share_id: string | null;
        origin: string;
        name: string;
      }>(
        `SELECT source_share_id,origin,coalesce(profile->>'name','') AS name
         FROM connections WHERE id=$1 AND owner_id=$2`,
        [connectionId, user.id],
      ),
    db,
  );
  if (!contact) throw new HttpError(404, "Contact not found.");
  const first = contact.name.split(" ")[0] || "This person";
  if (contact.origin === "sample")
    throw new HttpError(
      409,
      `${first} is a sample person, so there is no one to ask. Recording needs a real person who has Wasl.`,
    );
  // the person behind the card you saved: only someone on Wasl can say yes
  const [share] = contact.source_share_id
    ? await db.query<{ owner_id: string }>(
        "SELECT owner_id FROM shares WHERE id=$1",
        [contact.source_share_id],
      )
    : [];
  if (!share || share.owner_id === user.id)
    throw new HttpError(
      409,
      `${first} isn't on Wasl, so Wasl can't record. To record a chat, the other person needs the Wasl app and has to agree on their own phone.`,
    );
  if (!(await consumeLimit(`consent:${user.id}`, 20, 3600, db)))
    throw new HttpError(
      429,
      "That's a lot of requests to record. Try again in an hour.",
    );
  return asUser(
    user.id,
    async (tx) => {
      // one open question per person: asking again replaces the last one
      await tx.query(
        "UPDATE consents SET status='ended' WHERE asker_id=$1 AND connection_id=$2 AND status IN ('asked','allowed')",
        [user.id, connectionId],
      );
      const [row] = await tx.query<{ id: string; state: ConsentState }>(
        `INSERT INTO consents(id,asker_id,person_id,connection_id,asker_name)
         VALUES($1,$2,$3,$4,$5) RETURNING id,status AS state`,
        [
          randomUUID(),
          user.id,
          share.owner_id,
          connectionId,
          (user.profile?.name || user.name).slice(0, 80),
        ],
      );
      return row;
    },
    db,
  );
}

// The asker's phone asks every couple of seconds: has the other person answered?
export async function consentState(userId: string, id: string, db?: Database) {
  const [row] = await asUser(
    userId,
    (tx) =>
      tx.query<Row>(
        `SELECT id,asker_id,person_id,${STATE} AS state FROM consents WHERE id=$1`,
        [id],
      ),
    db,
  );
  if (!row) throw new HttpError(404, "This request to record is gone.");
  return { id: row.id, state: row.state };
}

// What the person asked sees: questions waiting for them, and recordings they said yes to
// that are still going, so they can stop one.
export async function incomingConsents(userId: string, db?: Database) {
  return asUser(
    userId,
    (tx) =>
      tx.query<{ id: string; asker_name: string; state: ConsentState }>(
        `SELECT id,asker_name,${STATE} AS state FROM consents
         WHERE person_id=$1 AND status IN ('asked','allowed')
           AND created_at > now() - interval '${YES_HOURS} hours'
         ORDER BY created_at DESC LIMIT 5`,
        [userId],
      ),
    db,
  ).then((rows) =>
    rows.filter((r) => r.state === "asked" || r.state === "allowed"),
  );
}

export async function answerConsent(
  userId: string,
  id: string,
  answer: "allow" | "decline" | "end",
  db?: Database,
) {
  return asUser(
    userId,
    async (tx) => {
      const [row] = await tx.query<Row>(
        `SELECT id,asker_id,person_id,${STATE} AS state FROM consents WHERE id=$1`,
        [id],
      );
      if (!row) throw new HttpError(404, "This request to record is gone.");
      if (answer === "end") {
        if (row.state === "asked" || row.state === "allowed")
          await tx.query("UPDATE consents SET status='ended' WHERE id=$1", [
            id,
          ]);
        return { id, state: "ended" as ConsentState };
      }
      if (row.person_id !== userId)
        throw new HttpError(403, "Only the person asked can answer.");
      if (row.state !== "asked")
        throw new HttpError(
          409,
          row.state === "expired"
            ? "This request timed out. Ask them to send it again."
            : "This request was already answered.",
        );
      const state: ConsentState = answer === "allow" ? "allowed" : "declined";
      await tx.query(
        "UPDATE consents SET status=$2,answered_at=now() WHERE id=$1 AND status='asked'",
        [id, state],
      );
      return { id, state };
    },
    db,
  );
}
