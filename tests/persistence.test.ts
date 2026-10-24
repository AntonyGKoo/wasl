import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { migrate, openDatabase } from "../src/lib/db";
test("committed account data survives closing and reopening the local database", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "wasl-persistence-"));
  const id = randomUUID();
  let db = await openDatabase({ dataDir });
  try {
    await migrate(db);
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,'persistent@example.test','Persisted','unused')",
      [id],
    );
    await db.close();
    db = await openDatabase({ dataDir });
    assert.equal(
      (
        await db.query<{ name: string }>("SELECT name FROM users WHERE id=$1", [
          id,
        ])
      )[0].name,
      "Persisted",
    );
  } finally {
    await db.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
