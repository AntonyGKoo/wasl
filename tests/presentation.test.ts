import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate } from "../src/lib/db";
import { registerAccount, verifyPassword } from "../src/lib/auth";
import { seedPresentation } from "../scripts/presentation-data";
import { presentationAccount } from "../src/lib/presentation";
import {
  importCard,
  listCards,
  listConnections,
  publicCard,
  saveNote,
} from "../src/server/network";
import { recall } from "../src/server/recall";

test("presentation flow saves a real shared card, recalls its private note and resets only fictional accounts", async () => {
  const db = await openDatabase({ memory: true });
  try {
    await migrate(db);
    const unrelated = await registerAccount(
      {
        name: "Another user",
        email: "unrelated@example.test",
        password: "UnrelatedPassword!",
      },
      db,
    );
    const first = await seedPresentation(db);
    const [login] = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=$1",
      [first.owner.id],
    );
    assert.ok(
      await verifyPassword(presentationAccount.password, login.password_hash),
    );
    assert.equal((await listConnections(first.owner.id, db)).length, 3);
    const cards = await listCards(first.owner, db);
    assert.equal(cards.length, 2);
    assert.equal(
      cards.find((c) => c.label === "Event")?.profile?.email,
      undefined,
    );
    assert.equal(
      (await publicCard(first.token, db)).profile.name,
      "Mariam Ali",
    );
    const contact = await importCard(
      first.owner.id,
      {
        token: first.token,
        event: "Campus networking night",
        place: "Doha",
        met_on: "2026-10-26",
      },
      db,
    );
    await saveNote(
      first.owner.id,
      contact.id,
      {
        body: "Offered to introduce me to her CTO.",
        happened_on: "2026-10-26",
      },
      db,
    );
    const hits = await recall(
      first.owner.id,
      "Who offered to introduce me to their CTO?",
      "keyword",
      db,
    );
    assert.equal(hits.hits[0].connection.profile.name, "Mariam Ali");
    assert.equal((await listConnections(first.guest.id, db)).length, 0);
    const second = await seedPresentation(db);
    assert.equal((await listConnections(second.owner.id, db)).length, 3);
    assert.equal(second.token, first.token);
    assert.equal(
      (await db.query("SELECT id FROM users WHERE id=$1", [unrelated])).length,
      1,
    );
  } finally {
    await db.close();
  }
});
