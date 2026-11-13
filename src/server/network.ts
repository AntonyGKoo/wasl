import { randomBytes, randomUUID } from "node:crypto";
import type { z } from "zod";
import { asUser, database, type Database } from "../lib/db";
import {
  profileFields,
  type Card,
  type Connection,
  type Interaction,
  type Profile,
  type PublicCard,
  type User,
} from "../lib/types";
import type {
  albumSchema,
  cardSchema,
  connectionSchema,
  importSchema,
  noteSchema,
} from "../lib/validation";
import { HttpError } from "./responses";
type CardInput = z.infer<typeof cardSchema>;
type ContactInput = Omit<z.infer<typeof connectionSchema>, "origin"> & {
  origin?: "" | "scan";
};
export function selectedProfile(
  profile: Partial<Profile>,
  fields: string[],
): Partial<Profile> {
  const chosen: Partial<Profile> = Object.fromEntries(
    profileFields
      .filter((key) => fields.includes(key) && typeof profile[key] === "string")
      .map((key) => [key, profile[key]]),
  );
  if (fields.includes("photo") && profile.photo) chosen.photo = profile.photo;
  return chosen;
}
export async function listCards(user: User, db?: Database) {
  const cards = await asUser(
    user.id,
    (tx) =>
      tx.query<Card>(
        `
    SELECT c.*,s.token FROM cards c LEFT JOIN shares s ON s.card_id=c.id AND s.revoked_at IS NULL
    ORDER BY c.created_at`,
        [],
      ),
    db,
  );
  return cards.map((card) => ({
    ...card,
    profile: selectedProfile(user.profile, card.fields),
  }));
}
export async function saveCard(
  user: User,
  input: CardInput,
  id?: string,
  db?: Database,
) {
  const fields = [...new Set(input.fields)];
  return asUser(
    user.id,
    async (tx) => {
      const rows = id
        ? await tx.query<Card>(
            "UPDATE cards SET label=$1,kind=$2,color=$3,fields=$4 WHERE id=$5 AND owner_id=$6 RETURNING *",
            [input.label, input.kind, input.color, fields, id, user.id],
          )
        : await tx.query<Card>(
            "INSERT INTO cards(id,owner_id,label,kind,color,fields) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              randomUUID(),
              user.id,
              input.label,
              input.kind,
              input.color,
              fields,
            ],
          );
      if (!rows.length) throw new HttpError(404, "Card not found.");
      return rows[0];
    },
    db,
  );
}
export async function deleteCard(userId: string, id: string, db?: Database) {
  return asUser(
    userId,
    async (tx) => {
      const result = await tx.query(
        "DELETE FROM cards WHERE id=$1 AND owner_id=$2 RETURNING id",
        [id, userId],
      );
      if (!result.length) throw new HttpError(404, "Card not found.");
    },
    db,
  );
}
export async function shareCard(userId: string, cardId: string, db?: Database) {
  return asUser(
    userId,
    async (tx) => {
      const cards = await tx.query(
        "SELECT id FROM cards WHERE id=$1 AND owner_id=$2",
        [cardId, userId],
      );
      if (!cards.length) throw new HttpError(404, "Card not found.");
      const [share] = await tx.query<{ token: string }>(
        `
      INSERT INTO shares(id,owner_id,card_id,token) VALUES ($1,$2,$3,$4)
      ON CONFLICT (card_id) WHERE revoked_at IS NULL DO UPDATE SET card_id=excluded.card_id RETURNING token`,
        [randomUUID(), userId, cardId, randomBytes(32).toString("base64url")],
      );
      return share.token;
    },
    db,
  );
}
export async function revokeShare(
  userId: string,
  cardId: string,
  db?: Database,
) {
  await asUser(
    userId,
    async (tx) => {
      const cards = await tx.query(
        "SELECT id FROM cards WHERE id=$1 AND owner_id=$2",
        [cardId, userId],
      );
      if (!cards.length) throw new HttpError(404, "Card not found.");
      await tx.query(
        "UPDATE shares SET revoked_at=now() WHERE card_id=$1 AND owner_id=$2 AND revoked_at IS NULL",
        [cardId, userId],
      );
    },
    db,
  );
}
type SharedSource = {
  share_id: string;
  owner_id: string;
  id: string;
  label: string;
  kind: string;
  color: Card["color"];
  fields: string[];
  profile: Profile;
};
async function sharedSource(token: string, db: Database) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(404, "This card is no longer available.");
  const [source] = await db.query<SharedSource>(
    `
    SELECT s.id AS share_id,s.owner_id,c.id,c.label,c.kind,c.color,c.fields,u.profile
    FROM shares s JOIN cards c ON c.id=s.card_id JOIN users u ON u.id=c.owner_id
    WHERE s.token=$1 AND s.revoked_at IS NULL`,
    [token],
  );
  if (!source)
    throw new HttpError(
      404,
      "This card is no longer available. Ask its owner for a new link.",
    );
  return source;
}
export async function publicCard(
  token: string,
  providedDb?: Database,
): Promise<PublicCard> {
  const source = await sharedSource(token, providedDb ?? (await database()));
  return {
    id: source.id,
    label: source.label,
    kind: source.kind,
    color: source.color,
    profile: selectedProfile(source.profile, source.fields),
    token,
  };
}
// Has this person already saved the card behind this link? (So the page can say so.)
export async function savedFromShare(
  userId: string,
  token: string,
  providedDb?: Database,
) {
  const db = providedDb ?? (await database());
  const [share] = await db.query<{ id: string }>(
    "SELECT id FROM shares WHERE token=$1",
    [token],
  );
  if (!share) return null;
  const [saved] = await asUser(
    userId,
    (tx) =>
      tx.query<{ id: string }>(
        "SELECT id FROM connections WHERE owner_id=$1 AND source_share_id=$2",
        [userId, share.id],
      ),
    db,
  );
  return saved?.id ?? null;
}
export async function listConnections(
  userId: string,
  db?: Database,
): Promise<Connection[]> {
  return asUser(
    userId,
    (tx) =>
      tx.query<Connection>(
        `
    SELECT c.*,(SELECT count(*)::int FROM interactions i WHERE i.connection_id=c.id) AS note_count
    FROM connections c ORDER BY c.favorite DESC,c.updated_at DESC LIMIT 1000`,
        [],
      ),
    db,
  );
}
export async function getConnection(userId: string, id: string, db?: Database) {
  return asUser(
    userId,
    async (tx) => {
      const [contact] = await tx.query<Connection>(
        "SELECT * FROM connections WHERE id=$1 AND owner_id=$2",
        [id, userId],
      );
      if (!contact) throw new HttpError(404, "Contact not found.");
      contact.notes = await tx.query<Interaction>(
        "SELECT id,connection_id,body,happened_on,created_at FROM interactions WHERE connection_id=$1 ORDER BY happened_on DESC,created_at DESC",
        [id],
      );
      return contact;
    },
    db,
  );
}
export async function saveConnection(
  userId: string,
  input: ContactInput,
  id?: string,
  db?: Database,
) {
  return asUser(
    userId,
    async (tx) => {
      if (!id && input.profile.email) {
        const duplicates = await tx.query(
          "SELECT id FROM connections WHERE lower(profile->>'email')=lower($1)",
          [input.profile.email],
        );
        if (duplicates.length)
          throw new HttpError(
            409,
            "A contact with this email already exists. Open that contact to add a new interaction.",
          );
      }
      const values = [
        JSON.stringify(input.profile),
        input.tags,
        input.event,
        input.place,
        input.met_on,
        input.favorite,
      ];
      const rows = id
        ? await tx.query<Connection>(
            `
      UPDATE connections SET profile=$1::jsonb,tags=$2,event=$3,place=$4,met_on=$5,favorite=$6,version=version+1,updated_at=now()
      WHERE id=$7 AND owner_id=$8 RETURNING *`,
            [...values, id, userId],
          )
        : await tx.query<Connection>(
            `
      INSERT INTO connections(profile,tags,event,place,met_on,favorite,id,owner_id,origin)
      VALUES($1::jsonb,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [...values, randomUUID(), userId, input.origin || ""],
          );
      if (!rows.length) throw new HttpError(404, "Contact not found.");
      return rows[0];
    },
    db,
  );
}
export async function importCard(
  userId: string,
  input: z.infer<typeof importSchema>,
  providedDb?: Database,
) {
  const db = providedDb ?? (await database());
  const source = await sharedSource(input.token, db);
  if (source.owner_id === userId)
    throw new HttpError(
      400,
      "This is your own card. Share it with someone else to connect.",
    );
  return asUser(
    userId,
    async (tx) => {
      const [result] = await tx.query<Connection>(
        `
      INSERT INTO connections(id,owner_id,source_share_id,profile,event,place,met_on,origin)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,'link')
      ON CONFLICT (owner_id,source_share_id) WHERE source_share_id IS NOT NULL
      DO UPDATE SET source_share_id=excluded.source_share_id RETURNING *`,
        [
          randomUUID(),
          userId,
          source.share_id,
          JSON.stringify(selectedProfile(source.profile, source.fields)),
          input.event,
          input.place,
          input.met_on,
        ],
      );
      return result;
    },
    db,
  );
}
// Two-way swap: after someone saves your card, they can send one of their own cards back.
// It lands in your network marked New, linked to their card so it stays up to date.
export async function swapBack(
  userId: string,
  input: z.infer<typeof importSchema>,
  providedDb?: Database,
) {
  if (!input.share_back_card_id) return null;
  const db = providedDb ?? (await database());
  const source = await sharedSource(input.token, db);
  if (source.owner_id === userId) return null;
  const [me] = await db.query<{ profile: Partial<Profile> }>(
    "SELECT profile FROM users WHERE id=$1",
    [userId],
  );
  const [card] = await asUser(
    userId,
    (tx) =>
      tx.query<{ id: string; fields: string[] }>(
        "SELECT id,fields FROM cards WHERE id=$1 AND owner_id=$2",
        [input.share_back_card_id, userId],
      ),
    db,
  );
  if (!me || !card) throw new HttpError(404, "Card not found.");
  const token = await shareCard(userId, card.id, db);
  const [share] = await db.query<{ id: string }>(
    "SELECT id FROM shares WHERE token=$1",
    [token],
  );
  const [row] = await asUser(
    source.owner_id,
    (tx) =>
      tx.query<{ id: string }>(
        `
      INSERT INTO connections(id,owner_id,source_share_id,profile,event,place,met_on,origin,unseen)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,'swap',true)
      ON CONFLICT (owner_id,source_share_id) WHERE source_share_id IS NOT NULL
      DO UPDATE SET profile=excluded.profile,unseen=true,updated_at=now() RETURNING id`,
        [
          randomUUID(),
          source.owner_id,
          share.id,
          JSON.stringify(selectedProfile(me.profile, card.fields)),
          input.event,
          input.place,
          input.met_on,
        ],
      ),
    db,
  );
  return row?.id ?? null;
}
export async function setFavorite(
  userId: string,
  id: string,
  favorite: boolean,
  db?: Database,
) {
  return asUser(
    userId,
    async (tx) => {
      const rows = await tx.query<Connection>(
        "UPDATE connections SET favorite=$1,updated_at=now() WHERE id=$2 AND owner_id=$3 RETURNING *",
        [favorite, id, userId],
      );
      if (!rows.length) throw new HttpError(404, "Contact not found.");
      return rows[0];
    },
    db,
  );
}
// One-tap tags on a person's page: sets exactly these tags, nothing else about the person.
export async function setTags(
  userId: string,
  id: string,
  tags: string[],
  db?: Database,
) {
  return asUser(
    userId,
    async (tx) => {
      const rows = await tx.query<Connection>(
        "UPDATE connections SET tags=$1,version=version+1,updated_at=now() WHERE id=$2 AND owner_id=$3 RETURNING *",
        [tags, id, userId],
      );
      if (!rows.length) throw new HttpError(404, "Contact not found.");
      return rows[0];
    },
    db,
  );
}
// People whose card came back in a swap and hasn't been opened yet. A small answer (no
// details, no photos), asked for every few seconds while your code is on screen, so a swap
// shows up on your phone as it happens.
export async function unseenPeople(userId: string, db?: Database) {
  return asUser(
    userId,
    (tx) =>
      tx.query<{ id: string; name: string; at: string }>(
        `SELECT id,coalesce(profile->>'name','') AS name,updated_at AS at
         FROM connections WHERE owner_id=$1 AND unseen ORDER BY updated_at DESC LIMIT 20`,
        [userId],
      ),
    db,
  );
}
export async function markSeen(userId: string, id: string, db?: Database) {
  await asUser(
    userId,
    (tx) =>
      tx.query(
        "UPDATE connections SET unseen=false WHERE id=$1 AND owner_id=$2 AND unseen",
        [id, userId],
      ),
    db,
  );
}
// An album you make yourself is a name on each person in it. Saving sets exactly who is in it.
export async function saveAlbum(
  userId: string,
  input: z.infer<typeof albumSchema>,
  db?: Database,
) {
  return asUser(
    userId,
    async (tx) => {
      if (input.previous_name && input.previous_name !== input.name)
        await tx.query(
          "UPDATE connections SET albums=array_remove(albums,$1) WHERE owner_id=$2 AND $1=ANY(albums)",
          [input.previous_name, userId],
        );
      await tx.query(
        "UPDATE connections SET albums=array_remove(albums,$1) WHERE owner_id=$2 AND $1=ANY(albums) AND NOT (id=ANY($3::uuid[]))",
        [input.name, userId, input.connection_ids],
      );
      const rows = await tx.query<{ id: string }>(
        "UPDATE connections SET albums=array_append(albums,$1) WHERE owner_id=$2 AND id=ANY($3::uuid[]) AND NOT ($1=ANY(albums)) RETURNING id",
        [input.name, userId, input.connection_ids],
      );
      return { name: input.name, added: rows.length };
    },
    db,
  );
}
export async function deleteAlbum(userId: string, name: string, db?: Database) {
  await asUser(
    userId,
    (tx) =>
      tx.query(
        "UPDATE connections SET albums=array_remove(albums,$1) WHERE owner_id=$2 AND $1=ANY(albums)",
        [name, userId],
      ),
    db,
  );
}
export async function refreshSharedContact(
  userId: string,
  id: string,
  providedDb?: Database,
) {
  const db = providedDb ?? (await database());
  const contact = await getConnection(userId, id, db);
  const [share] = await db.query<{ token: string }>(
    "SELECT token FROM shares WHERE id=$1 AND revoked_at IS NULL",
    [contact.source_share_id],
  );
  if (!share)
    throw new HttpError(
      410,
      "The source card is no longer shared. Your saved copy and notes remain available.",
    );
  const source = await publicCard(share.token, db);
  await asUser(
    userId,
    (tx) =>
      tx.query(
        "UPDATE connections SET profile=$1::jsonb,version=version+1,updated_at=now() WHERE id=$2",
        [JSON.stringify(source.profile), id],
      ),
    db,
  );
  return getConnection(userId, id, db);
}
export async function deleteConnection(
  userId: string,
  id: string,
  db?: Database,
) {
  await asUser(
    userId,
    async (tx) => {
      const result = await tx.query(
        "DELETE FROM connections WHERE id=$1 AND owner_id=$2 RETURNING id",
        [id, userId],
      );
      if (!result.length) throw new HttpError(404, "Contact not found.");
    },
    db,
  );
}
export async function saveNote(
  userId: string,
  connectionId: string,
  input: z.infer<typeof noteSchema>,
  db?: Database,
) {
  return asUser(
    userId,
    async (tx) => {
      const contacts = await tx.query(
        "UPDATE connections SET version=version+1,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id",
        [connectionId, userId],
      );
      if (!contacts.length) throw new HttpError(404, "Contact not found.");
      const [note] = await tx.query<Interaction>(
        "INSERT INTO interactions(id,owner_id,connection_id,body,happened_on) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), userId, connectionId, input.body, input.happened_on],
      );
      return note;
    },
    db,
  );
}
export async function deleteNote(
  userId: string,
  noteId: string,
  db?: Database,
) {
  await asUser(
    userId,
    async (tx) => {
      const [note] = await tx.query<{ connection_id: string }>(
        "DELETE FROM interactions WHERE id=$1 AND owner_id=$2 RETURNING connection_id",
        [noteId, userId],
      );
      if (!note) throw new HttpError(404, "Note not found.");
      await tx.query(
        "UPDATE connections SET version=version+1,updated_at=now() WHERE id=$1",
        [note.connection_id],
      );
    },
    db,
  );
}

// Five made-up people, so a new account can try Search, albums and notes before the first real
// meeting. They are marked origin 'sample' and leave together in one tap.
const samplePeople = [
  {
    name: "Mariam Ali",
    title: "Software engineer",
    company: "Pearl Labs",
    event: "Web Summit Qatar",
    tags: ["Intro offered"],
    favorite: true,
    daysAgo: 3,
    note: "Offered to introduce me to her CTO. Pearl Labs is hiring summer interns.",
  },
  {
    name: "Omar Haddad",
    title: "Product designer",
    company: "Sidra Studio",
    event: "Web Summit Qatar",
    tags: ["Follow up"],
    favorite: false,
    daysAgo: 3,
    note: "Showed me his portfolio app and asked for feedback on the sign-up screens.",
  },
  {
    name: "Yousef Al-Kuwari",
    title: "Founder",
    company: "Najm Robotics",
    event: "Web Summit Qatar",
    tags: ["Co-founder"],
    favorite: false,
    daysAgo: 3,
    note: "Building delivery robots and looking for a first engineer.",
  },
  {
    name: "Lina Farouk",
    title: "Data scientist",
    company: "Falcon Analytics",
    event: "Campus career fair",
    tags: ["Hiring"],
    favorite: false,
    daysAgo: 12,
    note: "Her team works on fraud detection. She said to send my CV before December.",
  },
  {
    name: "Sara Nasser",
    title: "Security analyst",
    company: "Corniche Bank",
    event: "Campus career fair",
    tags: ["Mentor"],
    favorite: false,
    daysAgo: 12,
    note: "Works in cybersecurity. Offered to review my CV and do a mock interview.",
  },
];
export async function addSamplePeople(userId: string, db?: Database) {
  return asUser(
    userId,
    async (tx) => {
      const have = await tx.query(
        "SELECT 1 FROM connections WHERE owner_id=$1 AND origin='sample' LIMIT 1",
        [userId],
      );
      if (have.length) return 0;
      for (const person of samplePeople) {
        const id = randomUUID();
        const day = new Date(Date.now() - person.daysAgo * 86400000)
          .toISOString()
          .slice(0, 10);
        await tx.query(
          `INSERT INTO connections(profile,tags,event,place,met_on,favorite,id,owner_id,origin)
          VALUES($1::jsonb,$2,$3,'Doha',$4,$5,$6,$7,'sample')`,
          [
            JSON.stringify({
              name: person.name,
              title: person.title,
              company: person.company,
              university: "",
              email: "",
              phone: "",
              linkedin: "",
              instagram: "",
              website: "",
              bio: "",
            }),
            person.tags,
            person.event,
            day,
            person.favorite,
            id,
            userId,
          ],
        );
        await tx.query(
          "INSERT INTO interactions(id,owner_id,connection_id,body,happened_on) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), userId, id, person.note, day],
        );
      }
      return samplePeople.length;
    },
    db,
  );
}
export async function removeSamplePeople(userId: string, db?: Database) {
  const gone = await asUser(
    userId,
    (tx) =>
      tx.query(
        "DELETE FROM connections WHERE owner_id=$1 AND origin='sample' RETURNING id",
        [userId],
      ),
    db,
  );
  return gone.length;
}
