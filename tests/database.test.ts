import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, migrate, asUser } from "../src/lib/db";
test("Postgres policies isolate accounts even without a WHERE filter", async () => {
  const db = await openDatabase({ memory: true });
  try {
    await migrate(db);
    await migrate(db);
    const [alice, bob] = [randomUUID(), randomUUID()];
    for (const [id, email] of [
      [alice, "alice@example.test"],
      [bob, "bob@example.test"],
    ]) {
      await db.query(
        "INSERT INTO users(id,email,name,password_hash) VALUES ($1,$2,'Test','unusable')",
        [id, email],
      );
    }
    const id = randomUUID();
    await asUser(
      alice,
      (tx) =>
        tx.query(
          "INSERT INTO cards(id,owner_id,label,kind,color,fields) VALUES ($1,$2,'Work','professional','ocean','{name}')",
          [id, alice],
        ),
      db,
    );
    assert.equal(
      (await asUser(bob, (tx) => tx.query("SELECT * FROM cards"), db)).length,
      0,
    );
    await assert.rejects(
      asUser(
        bob,
        (tx) =>
          tx.query(
            "INSERT INTO cards(id,owner_id,label,kind,color,fields) VALUES ($1,$2,'Bad','social','ocean','{name}')",
            [randomUUID(), alice],
          ),
        db,
      ),
    );
    assert.equal(
      (await asUser(alice, (tx) => tx.query("SELECT * FROM cards"), db)).length,
      1,
    );
  } finally {
    await db.close();
  }
});
