import { randomBytes, randomUUID } from "node:crypto";
import type { z } from "zod";
import { asUser, database, type Database } from "../lib/db";
import { profileFields, type Card, type Connection, type Interaction, type Profile, type PublicCard, type User } from "../lib/types";
import type { cardSchema, connectionSchema, importSchema, noteSchema } from "../lib/validation";
import { HttpError } from "./responses";
type CardInput = z.infer<typeof cardSchema>;
type ContactInput = z.infer<typeof connectionSchema>;
export function selectedProfile(profile: Partial<Profile>, fields: string[]): Partial<Profile> {
  return Object.fromEntries(profileFields.filter(key => fields.includes(key) && typeof profile[key] === "string").map(key => [key, profile[key]]));
}
export async function listCards(user: User, db?: Database) {
  const cards = await asUser(user.id, tx => tx.query<Card>(`
    SELECT c.*,s.token FROM cards c LEFT JOIN shares s ON s.card_id=c.id AND s.revoked_at IS NULL
    ORDER BY c.created_at`, []), db);
  return cards.map(card => ({ ...card, profile: selectedProfile(user.profile, card.fields) }));
}
export async function saveCard(user: User, input: CardInput, id?: string, db?: Database) {
  const fields = [...new Set(input.fields)];
  return asUser(user.id, async tx => {
    const rows = id ? await tx.query<Card>("UPDATE cards SET label=$1,kind=$2,color=$3,fields=$4 WHERE id=$5 AND owner_id=$6 RETURNING *", [input.label,input.kind,input.color,fields,id,user.id]) :
      await tx.query<Card>("INSERT INTO cards(id,owner_id,label,kind,color,fields) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [randomUUID(),user.id,input.label,input.kind,input.color,fields]);
    if (!rows.length) throw new HttpError(404, "Card not found.");
    return rows[0];
  }, db);
}
export async function deleteCard(userId: string, id: string, db?: Database) {
  return asUser(userId, async tx => {
    const result = await tx.query("DELETE FROM cards WHERE id=$1 AND owner_id=$2 RETURNING id", [id,userId]);
    if (!result.length) throw new HttpError(404, "Card not found.");
  }, db);
}
export async function shareCard(userId: string, cardId: string, db?: Database) {
  return asUser(userId, async tx => {
    const cards = await tx.query("SELECT id FROM cards WHERE id=$1 AND owner_id=$2", [cardId,userId]);
    if (!cards.length) throw new HttpError(404, "Card not found.");
    const [share] = await tx.query<{ token: string }>(`
      INSERT INTO shares(id,owner_id,card_id,token) VALUES ($1,$2,$3,$4)
      ON CONFLICT (card_id) WHERE revoked_at IS NULL DO UPDATE SET card_id=excluded.card_id RETURNING token`,
      [randomUUID(),userId,cardId,randomBytes(32).toString("base64url")]);
    return share.token;
  }, db);
}
export async function revokeShare(userId: string, cardId: string, db?: Database) {
  await asUser(userId, async tx => {
    const cards = await tx.query("SELECT id FROM cards WHERE id=$1 AND owner_id=$2", [cardId,userId]);
    if (!cards.length) throw new HttpError(404, "Card not found.");
    await tx.query("UPDATE shares SET revoked_at=now() WHERE card_id=$1 AND owner_id=$2 AND revoked_at IS NULL", [cardId,userId]);
  }, db);
}
type SharedSource = { share_id: string; owner_id: string; id: string; label: string; kind: string; color: Card["color"]; fields: string[]; profile: Profile };
async function sharedSource(token: string, db: Database) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(404, "This card is no longer available.");
  const [source] = await db.query<SharedSource>(`
    SELECT s.id AS share_id,s.owner_id,c.id,c.label,c.kind,c.color,c.fields,u.profile
    FROM shares s JOIN cards c ON c.id=s.card_id JOIN users u ON u.id=c.owner_id
    WHERE s.token=$1 AND s.revoked_at IS NULL`, [token]);
  if (!source) throw new HttpError(404, "This card is no longer available. Ask its owner for a new link.");
  return source;
}
export async function publicCard(token: string, providedDb?: Database): Promise<PublicCard> {
  const source = await sharedSource(token, providedDb ?? await database());
  return { id: source.id, label: source.label, kind: source.kind, color: source.color, profile: selectedProfile(source.profile,source.fields), token };
}
export async function listConnections(userId: string, db?: Database): Promise<Connection[]> {
  return asUser(userId, tx => tx.query<Connection>(`
    SELECT c.*,(SELECT count(*)::int FROM interactions i WHERE i.connection_id=c.id) AS note_count
    FROM connections c ORDER BY c.favorite DESC,c.updated_at DESC LIMIT 1000`, []), db);
}
export async function getConnection(userId: string, id: string, db?: Database) {
  return asUser(userId, async tx => {
    const [contact] = await tx.query<Connection>("SELECT * FROM connections WHERE id=$1 AND owner_id=$2", [id,userId]);
    if (!contact) throw new HttpError(404, "Contact not found.");
    contact.notes = await tx.query<Interaction>("SELECT id,connection_id,body,happened_on,created_at FROM interactions WHERE connection_id=$1 ORDER BY happened_on DESC,created_at DESC", [id]);
    return contact;
  }, db);
}
export async function saveConnection(userId: string, input: ContactInput, id?: string, db?: Database) {
  return asUser(userId, async tx => {
    if (!id && input.profile.email) {
      const duplicates = await tx.query("SELECT id FROM connections WHERE lower(profile->>'email')=lower($1)", [input.profile.email]);
      if (duplicates.length) throw new HttpError(409, "A contact with this email already exists. Open that contact to add a new interaction.");
    }
    const values = [JSON.stringify(input.profile), input.tags, input.event, input.place, input.met_on, input.favorite];
    const rows = id ? await tx.query<Connection>(`
      UPDATE connections SET profile=$1::jsonb,tags=$2,event=$3,place=$4,met_on=$5,favorite=$6,version=version+1,updated_at=now()
      WHERE id=$7 AND owner_id=$8 RETURNING *`, [...values,id,userId]) :
      await tx.query<Connection>(`
      INSERT INTO connections(profile,tags,event,place,met_on,favorite,id,owner_id)
      VALUES($1::jsonb,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [...values,randomUUID(),userId]);
    if (!rows.length) throw new HttpError(404, "Contact not found.");
    return rows[0];
  }, db);
}
export async function importCard(userId: string, input: z.infer<typeof importSchema>, providedDb?: Database) {
  const db = providedDb ?? await database();
  const source = await sharedSource(input.token, db);
  if (source.owner_id === userId) throw new HttpError(400, "This is your own card. Share it with someone else to connect.");
  return asUser(userId, async tx => {
    const [result] = await tx.query<Connection>(`
      INSERT INTO connections(id,owner_id,source_share_id,profile,event,place,met_on)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)
      ON CONFLICT (owner_id,source_share_id) WHERE source_share_id IS NOT NULL
      DO UPDATE SET source_share_id=excluded.source_share_id RETURNING *`,
      [randomUUID(),userId,source.share_id,JSON.stringify(selectedProfile(source.profile,source.fields)),input.event,input.place,input.met_on]);
    return result;
  }, db);
}
export async function refreshSharedContact(userId: string, id: string, providedDb?: Database) {
  const db = providedDb ?? await database();
  const contact = await getConnection(userId, id, db);
  const [share] = await db.query<{ token: string }>("SELECT token FROM shares WHERE id=$1 AND revoked_at IS NULL", [contact.source_share_id]);
  if (!share) throw new HttpError(410, "The source card is no longer shared. Your saved copy and notes remain available.");
  const source = await publicCard(share.token, db);
  await asUser(userId, tx => tx.query("UPDATE connections SET profile=$1::jsonb,version=version+1,updated_at=now() WHERE id=$2", [JSON.stringify(source.profile),id]), db);
  return getConnection(userId,id,db);
}
export async function deleteConnection(userId: string, id: string, db?: Database) {
  await asUser(userId, async tx => {
    const result = await tx.query("DELETE FROM connections WHERE id=$1 AND owner_id=$2 RETURNING id", [id,userId]);
    if (!result.length) throw new HttpError(404, "Contact not found.");
  }, db);
}
export async function saveNote(userId: string, connectionId: string, input: z.infer<typeof noteSchema>, db?: Database) {
  return asUser(userId, async tx => {
    const contacts = await tx.query("UPDATE connections SET version=version+1,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id", [connectionId,userId]);
    if (!contacts.length) throw new HttpError(404, "Contact not found.");
    const [note] = await tx.query<Interaction>("INSERT INTO interactions(id,owner_id,connection_id,body,happened_on) VALUES($1,$2,$3,$4,$5) RETURNING *", [randomUUID(),userId,connectionId,input.body,input.happened_on]);
    return note;
  }, db);
}
export async function deleteNote(userId: string, noteId: string, db?: Database) {
  await asUser(userId, async tx => {
    const [note] = await tx.query<{ connection_id: string }>("DELETE FROM interactions WHERE id=$1 AND owner_id=$2 RETURNING connection_id", [noteId,userId]);
    if (!note) throw new HttpError(404, "Note not found.");
    await tx.query("UPDATE connections SET version=version+1,updated_at=now() WHERE id=$1", [note.connection_id]);
  }, db);
}
