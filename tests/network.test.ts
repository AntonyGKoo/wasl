import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, migrate, asUser } from "../src/lib/db";
import { blankProfile, type User } from "../src/lib/types";
import {
  deleteCard,
  deleteConnection,
  getConnection,
  importCard,
  publicCard,
  revokeShare,
  saveCard,
  saveNote,
  shareCard,
} from "../src/server/network";
test("sharing only publishes selected fields; contacts and notes remain private", async () => {
  const db = await openDatabase({ memory: true });
  try {
    await migrate(db);
    const alice: User = {
      id: randomUUID(),
      name: "Alice",
      email: "alice@example.test",
      profile: {
        ...blankProfile,
        name: "Alice",
        email: "private@example.test",
        phone: "+123",
        company: "Wasl",
      },
      created_at: "",
    };
    const bob: User = { ...alice, id: randomUUID(), email: "bob@example.test" };
    for (const u of [alice, bob])
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,profile) VALUES($1,$2,$3,'unused',$4::jsonb)",
        [u.id, u.email, u.name, JSON.stringify(u.profile)],
      );
    const card = await saveCard(
      alice,
      {
        label: "Work",
        kind: "professional",
        color: "ocean",
        fields: ["name", "company"],
      },
      undefined,
      db,
    );
    const token = await shareCard(alice.id, card.id, db);
    assert.equal(token, await shareCard(alice.id, card.id, db));
    assert.deepEqual((await publicCard(token, db)).profile, {
      name: "Alice",
      company: "Wasl",
    });
    const input = {
      token,
      event: "Career Fair",
      place: "Doha",
      met_on: "2026-10-24",
    };
    const contact = await importCard(bob.id, input, db);
    assert.equal((await importCard(bob.id, input, db)).id, contact.id);
    await saveNote(
      bob.id,
      contact.id,
      { body: "Private conversation", happened_on: "2026-10-24" },
      db,
    );
    await assert.rejects(getConnection(alice.id, contact.id, db), {
      status: 404,
    });
    await assert.rejects(deleteCard(bob.id, card.id, db), { status: 404 });
    await revokeShare(alice.id, card.id, db);
    await assert.rejects(publicCard(token, db), { status: 404 });
    assert.equal(
      (await getConnection(bob.id, contact.id, db)).notes?.length,
      1,
    );
    await deleteConnection(bob.id, contact.id, db);
    assert.equal(
      (await asUser(bob.id, (tx) => tx.query("SELECT * FROM interactions"), db))
        .length,
      0,
    );
  } finally {
    await db.close();
  }
});
