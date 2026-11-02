import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleApi } from "../src/server/api";
test("HTTP flow persists profile, shares a card, saves private notes and revokes sessions", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "wasl-api-"));
  process.env.WASL_DATA_DIR = dataDir;
  const origin = "http://localhost:3000";
  async function call(
    route: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) {
    return handleApi(
      new Request(`${origin}/api/${route}`, {
        method,
        headers: { origin, "content-type": "application/json", cookie },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  }
  const register = await call("auth/register", "POST", {
    name: "Alice",
    email: "alice@example.test",
    password: "test-password-123",
  });
  assert.equal(register.status, 201);
  const cookie = register.headers.get("set-cookie")!.split(";")[0];
  const cardResponse = await call(
    "cards",
    "POST",
    { label: "Work", kind: "professional", color: "ocean", fields: ["name"] },
    cookie,
  );
  assert.equal(cardResponse.status, 201);
  const { card } = await cardResponse.json();
  const share = await call(`cards/${card.id}/share`, "POST", {}, cookie);
  const { token } = await share.json();
  const publicResponse = await call(`share/${token}`);
  const publicData = await publicResponse.json();
  assert.deepEqual(publicData.card.profile, { name: "Alice" });
  const other = await call("auth/register", "POST", {
    name: "Bob",
    email: "bob@example.test",
    password: "test-password-456",
  });
  const bobCookie = other.headers.get("set-cookie")!.split(";")[0];
  const saved = await call(
    "connections/import",
    "POST",
    { token, met_on: "2026-10-24" },
    bobCookie,
  );
  assert.equal(saved.status, 201);
  const { connection } = await saved.json();
  assert.equal(
    (await call(`connections/${connection.id}`, "GET", undefined, cookie))
      .status,
    404,
  );
  assert.equal(
    (
      await call(
        `connections/${connection.id}/notes`,
        "POST",
        { body: "Met at a startup event", happened_on: "2026-10-24" },
        bobCookie,
      )
    ).status,
    201,
  );
  const search = await call(
    "search",
    "POST",
    { query: "startup event", mode: "keyword" },
    bobCookie,
  );
  assert.equal((await search.json()).hits.length, 1);
  const download = await call(
    `connections/${connection.id}/vcard`,
    "GET",
    undefined,
    bobCookie,
  );
  assert.match(await download.text(), /FN:Alice/);
  await call("auth/logout", "POST", {}, cookie);
  assert.equal((await call("cards", "GET", undefined, cookie)).status, 401);
  const globalDb = globalThis as unknown as {
    waslDb?: Promise<{ close(): Promise<void> }>;
  };
  await (await globalDb.waslDb)?.close();
  globalDb.waslDb = undefined;
  await rm(dataDir, { recursive: true, force: true });
});
test("health check answers from the database without signing in", async () => {
  process.env.WASL_DATA_DIR = await mkdtemp(
    path.join(tmpdir(), "wasl-health-"),
  );
  const response = await handleApi(
    new Request("http://localhost:3000/api/health"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
