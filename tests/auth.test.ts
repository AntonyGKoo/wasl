import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, createSession, sessionUser, registerAccount, consumeLimit } from "../src/lib/auth";
import { openDatabase, migrate } from "../src/lib/db";
import { assertOrigin } from "../src/server/responses";
test("passwords use salted hashes and sessions are revocable", async () => {
  const hash = await hashPassword("a-real-test-password");
  assert.equal(await verifyPassword("a-real-test-password", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.notEqual(hash, await hashPassword("a-real-test-password"));
  const db = await openDatabase({ memory: true });
  try {
    await migrate(db);
    const id = await registerAccount({ email: "test@example.test", name: "Test", password: "a-real-test-password" }, db);
    const token = await createSession(id, db);
    const request = new Request("http://localhost/api/session", { headers: { cookie: `wasl_session=${token}` } });
    assert.equal((await sessionUser(request, db))?.id, id);
    const stored = await db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    assert.notEqual(stored[0].token_hash, token);
    await db.query("DELETE FROM sessions");
    assert.equal(await sessionUser(request, db), null);
    assert.equal(await consumeLimit("test", 1, 60, db), true);
    assert.equal(await consumeLimit("test", 1, 60, db), false);
  } finally { await db.close(); }
});
test("mutations reject absent and foreign origins", () => {
  assert.throws(() => assertOrigin(new Request("http://localhost/api/cards", { method: "POST" })));
  assert.throws(() => assertOrigin(new Request("http://localhost/api/cards", { method: "POST", headers: { origin: "https://evil.test" } })));
  assert.doesNotThrow(() => assertOrigin(new Request("http://localhost/api/cards", { method: "POST", headers: { origin: process.env.APP_URL || "http://localhost" } })));
});
