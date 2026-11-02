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
test("a recorded chat becomes key points for a signed-in person, without an AI key", async () => {
  process.env.WASL_DATA_DIR = await mkdtemp(
    path.join(tmpdir(), "wasl-summary-"),
  );
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const origin = "http://localhost:3000";
  const call = (route: string, body: unknown, cookie = "") =>
    handleApi(
      new Request(`${origin}/api/${route}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie },
        body: JSON.stringify(body),
      }),
    );
  const transcript =
    "Hi, nice to meet you. The weather is lovely tonight. I work as a software engineer at Pearl Labs on our payments app. If you want I can introduce you to our CTO. We are hiring interns for next summer, so apply before December.";
  assert.equal((await call("summarize", { transcript })).status, 401);
  const register = await call("auth/register", {
    name: "Mona",
    email: "mona@example.test",
    password: "test-password-123",
  });
  const cookie = register.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await call("summarize", { transcript: "hi" }, cookie)).status,
    400,
  );
  const response = await call("summarize", { transcript }, cookie);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "rules");
  assert.ok(
    result.points.some((p: string) => /introduce you to our CTO/.test(p)),
  );
  assert.ok(result.points.some((p: string) => /hiring interns/.test(p)));
  assert.ok(!result.points.some((p: string) => /weather/.test(p)));
  if (key) process.env.OPENAI_API_KEY = key;
});
