import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleApi } from "../src/server/api";
import { database } from "../src/lib/db";
import { parseContactText, readContactCode } from "../src/lib/contact-code";
import { lexicalRecall } from "../src/server/recall";
import { blankProfile, type Connection } from "../src/lib/types";

// a 1×1 JPEG, the smallest real photo
const PHOTO =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

test("people swap cards both ways, with albums, favorites, password change and account deletion", async () => {
  process.env.WASL_DATA_DIR = await mkdtemp(
    path.join(tmpdir(), "wasl-product-"),
  );
  const origin = "http://localhost:3000";
  const call = async (
    route: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) => {
    const response = await handleApi(
      new Request(`${origin}/api/${route}`, {
        method,
        headers: { origin, "content-type": "application/json", cookie },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    return {
      status: response.status,
      headers: response.headers,
      data: await response.json(),
    };
  };
  const register = async (name: string, email: string) => {
    const r = await call("auth/register", "POST", {
      name,
      email,
      password: "test-password-123",
    });
    assert.equal(r.status, 201);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  const alice = await register("Alice Haddad", "alice@example.test");
  const bob = await register("Bob Karim", "bob@example.test");

  // every new account starts with a Professional card that can share a photo
  const aliceCards = (await call("cards", "GET", undefined, alice)).data.cards;
  assert.equal(aliceCards.length, 1);
  assert.equal(aliceCards[0].kind, "professional");
  assert.ok(aliceCards[0].fields.includes("photo"));
  const bobCard = (await call("cards", "GET", undefined, bob)).data.cards[0];

  // a profile photo is saved and only real image data is accepted
  const profile = {
    ...blankProfile,
    name: "Alice Haddad",
    title: "Product designer",
    company: "Sidra Studio",
    email: "alice@example.test",
  };
  assert.equal(
    (
      await call(
        "profile",
        "PUT",
        { ...profile, photo: "javascript:alert(1)" },
        alice,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call("profile", "PUT", { ...profile, photo: PHOTO }, alice)).status,
    200,
  );
  await call(
    "profile",
    "PUT",
    {
      ...blankProfile,
      name: "Bob Karim",
      title: "Founder",
      company: "Falcon Labs",
    },
    bob,
  );

  // Alice shows her code; Bob saves her card and sends his back in the same tap
  const token = (
    await call(`cards/${aliceCards[0].id}/share`, "POST", {}, alice)
  ).data.token;
  const publicCard = (await call(`share/${token}`)).data.card;
  assert.equal(publicCard.profile.photo, PHOTO);
  const swap = await call(
    "connections/import",
    "POST",
    {
      token,
      event: "Web Summit Qatar",
      place: "Doha",
      met_on: "2026-11-10",
      share_back_card_id: bobCard.id,
    },
    bob,
  );
  assert.equal(swap.status, 201);
  assert.equal(swap.data.swapped, true);
  assert.equal(swap.data.connection.origin, "link");
  // Bob can't send someone else's card
  const stranger = await register("Sam", "sam@example.test");
  const samCard = (await call("cards", "GET", undefined, stranger)).data
    .cards[0];
  assert.equal(
    (
      await call(
        "connections/import",
        "POST",
        { token, met_on: "2026-11-10", share_back_card_id: samCard.id },
        bob,
      )
    ).status,
    404,
  );

  // Bob is now in Alice's network, marked New, with where they met
  let aliceNetwork: Connection[] = (
    await call("connections", "GET", undefined, alice)
  ).data.connections;
  assert.equal(aliceNetwork.length, 1);
  const bobForAlice = aliceNetwork[0];
  assert.equal(bobForAlice.profile.name, "Bob Karim");
  assert.equal(bobForAlice.profile.company, "Falcon Labs");
  assert.equal(bobForAlice.origin, "swap");
  assert.equal(bobForAlice.unseen, true);
  assert.equal(bobForAlice.event, "Web Summit Qatar");
  // Alice's phone, still showing her code, learns that a card came back: a small answer
  // with no details beyond the name, and only her own
  const arrived = await call("connections/new", "GET", undefined, alice);
  assert.equal(arrived.status, 200);
  assert.equal(arrived.data.people.length, 1);
  assert.deepEqual(Object.keys(arrived.data.people[0]).sort(), [
    "at",
    "id",
    "name",
  ]);
  assert.equal(arrived.data.people[0].id, bobForAlice.id);
  assert.equal(arrived.data.people[0].name, "Bob Karim");
  assert.deepEqual(
    (await call("connections/new", "GET", undefined, bob)).data.people,
    [],
  );
  assert.equal((await call("connections/new")).status, 401);
  // swapping again doesn't add Bob twice
  await call(
    "connections/import",
    "POST",
    { token, met_on: "2026-11-10", share_back_card_id: bobCard.id },
    bob,
  );
  assert.equal(
    (await call("connections", "GET", undefined, alice)).data.connections
      .length,
    1,
  );
  // opening Bob clears New
  await call(`connections/${bobForAlice.id}`, "GET", undefined, alice);
  assert.deepEqual(
    (await call("connections/new", "GET", undefined, alice)).data.people,
    [],
  );
  aliceNetwork = (await call("connections", "GET", undefined, alice)).data
    .connections;
  assert.equal(aliceNetwork[0].unseen, false);
  // Bob's later profile changes reach Alice through his card
  await call(
    "profile",
    "PUT",
    {
      ...blankProfile,
      name: "Bob Karim",
      title: "CEO",
      company: "Falcon Labs",
    },
    bob,
  );
  const refreshed = await call(
    `connections/${bobForAlice.id}/refresh`,
    "POST",
    {},
    alice,
  );
  assert.equal(refreshed.data.connection.profile.title, "CEO");

  // favorites and albums
  const fav = await call(
    `connections/${bobForAlice.id}/favorite`,
    "POST",
    { favorite: true },
    alice,
  );
  assert.equal(fav.data.connection.favorite, true);
  // one-tap tags on a person's page: exactly these tags, nothing else about the person changes,
  // and only on your own people
  const tagged = await call(
    `connections/${bobForAlice.id}/tags`,
    "POST",
    { tags: ["Hiring", "Hiring", "Intro offered"] },
    alice,
  );
  assert.equal(tagged.status, 200);
  assert.deepEqual(tagged.data.connection.tags, ["Hiring", "Intro offered"]);
  assert.equal(tagged.data.connection.profile.name, "Bob Karim");
  assert.equal(tagged.data.connection.favorite, true);
  assert.equal(
    (
      await call(
        `connections/${bobForAlice.id}/tags`,
        "POST",
        { tags: ["x".repeat(41)] },
        alice,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `connections/${bobForAlice.id}/tags`,
        "POST",
        { tags: ["Mine now"] },
        bob,
      )
    ).status,
    404,
  );
  const untagged = await call(
    `connections/${bobForAlice.id}/tags`,
    "POST",
    { tags: [] },
    alice,
  );
  assert.deepEqual(untagged.data.connection.tags, []);
  await call(
    "albums",
    "PUT",
    { name: "Founders", connection_ids: [bobForAlice.id] },
    alice,
  );
  aliceNetwork = (await call("connections", "GET", undefined, alice)).data
    .connections;
  assert.deepEqual(aliceNetwork[0].albums, ["Founders"]);
  await call(
    "albums",
    "PUT",
    {
      name: "Startup founders",
      previous_name: "Founders",
      connection_ids: [bobForAlice.id],
    },
    alice,
  );
  aliceNetwork = (await call("connections", "GET", undefined, alice)).data
    .connections;
  assert.deepEqual(aliceNetwork[0].albums, ["Startup founders"]);
  // another person's id can't be put in Alice's album
  const bobNetwork = (await call("connections", "GET", undefined, bob)).data
    .connections;
  await call(
    "albums",
    "PUT",
    {
      name: "Startup founders",
      connection_ids: [bobForAlice.id, bobNetwork[0].id],
    },
    alice,
  );
  assert.deepEqual(
    (await call("connections", "GET", undefined, bob)).data.connections[0]
      .albums,
    [],
  );
  await call(
    `albums/${encodeURIComponent("Startup founders")}`,
    "DELETE",
    undefined,
    alice,
  );
  aliceNetwork = (await call("connections", "GET", undefined, alice)).data
    .connections;
  assert.deepEqual(aliceNetwork[0].albums, []);

  // a Team card
  assert.equal(
    (
      await call(
        "cards",
        "POST",
        {
          label: "CMU-Q robotics",
          kind: "team",
          color: "violet",
          fields: ["name", "email"],
        },
        alice,
      )
    ).status,
    201,
  );

  // password change: wrong password refused, then other sessions end
  assert.equal(
    (
      await call(
        "account/password",
        "POST",
        { current: "wrong-password", next: "new-password-456" },
        alice,
      )
    ).status,
    400,
  );
  const changed = await call(
    "account/password",
    "POST",
    { current: "test-password-123", next: "new-password-456" },
    alice,
  );
  assert.equal(changed.status, 200);
  assert.equal(
    (await call("connections", "GET", undefined, alice)).status,
    401,
  );
  const aliceAgain = changed.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await call("connections", "GET", undefined, aliceAgain)).status,
    200,
  );
  assert.equal(
    (
      await call("auth/login", "POST", {
        email: "alice@example.test",
        password: "new-password-456",
      })
    ).status,
    200,
  );

  // deleting the account removes everything; Bob keeps his own copy of Alice's card
  assert.equal(
    (await call("account", "DELETE", { password: "nope" }, aliceAgain)).status,
    400,
  );
  assert.equal(
    (
      await call(
        "account",
        "DELETE",
        { password: "new-password-456" },
        aliceAgain,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("connections", "GET", undefined, aliceAgain)).status,
    401,
  );
  assert.equal(
    (
      await call("auth/login", "POST", {
        email: "alice@example.test",
        password: "new-password-456",
      })
    ).status,
    401,
  );
  assert.equal((await call(`share/${token}`)).status, 404);
  const bobAfter = (await call("connections", "GET", undefined, bob)).data
    .connections;
  assert.equal(bobAfter.length, 1);
  assert.equal(bobAfter[0].profile.name, "Alice Haddad");
});

test("QR codes on paper cards become contacts; Wasl codes open the card", () => {
  const vcard = parseContactText(
    "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Ali;Mariam;;;\r\nFN:Mariam Ali\r\nORG:Pearl Labs;Engineering\r\nTITLE:Software engineer\r\nTEL;TYPE=CELL:+974 5571 2290\r\nEMAIL:Mariam@PearlLabs.example\r\nURL:https://www.linkedin.com/in/mariamali\r\nEND:VCARD",
  );
  assert.equal(vcard?.name, "Mariam Ali");
  assert.equal(vcard?.company, "Pearl Labs");
  assert.equal(vcard?.title, "Software engineer");
  assert.equal(vcard?.phone, "+974 5571 2290");
  assert.equal(vcard?.email, "mariam@pearllabs.example");
  assert.equal(vcard?.linkedin, "https://www.linkedin.com/in/mariamali");
  const mecard = parseContactText(
    "MECARD:N:Omar,Yousef;TEL:+97455550000;EMAIL:yousef@example.com;URL:falcon.example;;",
  );
  assert.equal(mecard?.name, "Yousef Omar");
  assert.equal(mecard?.website, "https://falcon.example");
  const token = "a".repeat(43);
  assert.deepEqual(
    readContactCode(
      `https://wasl-sable.vercel.app/c/${token}`,
      "http://localhost:3000",
    ),
    {
      kind: "wasl",
      path: `/c/${token}`,
    },
  );
  assert.equal(
    readContactCode("https://example.com/promo", "http://localhost:3000").kind,
    "link",
  );
  assert.equal(
    readContactCode("just some words", "http://localhost:3000").kind,
    "other",
  );
});

test("search matches what was saved, not the names of the fields", () => {
  const contact = {
    id: "c1",
    owner_id: "o",
    profile: {
      ...blankProfile,
      name: "Lina Farouk",
      company: "Falcon Analytics",
      photo: PHOTO,
    },
    tags: [],
    albums: [],
    origin: "",
    unseen: false,
    event: "Career fair",
    place: "Doha",
    met_on: "2026-11-10",
    favorite: false,
    source_share_id: null,
    created_at: "",
    updated_at: "",
    version: 1,
    notes: [],
  } as Connection;
  // "company", "meeting" and "date" are labels, not memories
  assert.equal(lexicalRecall("company meeting date", [contact]).length, 0);
  const hits = lexicalRecall("falcon", [contact]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].evidence[0], "Company: Falcon Analytics");
  // the photo is never searched
  assert.equal(lexicalRecall("base64 jpeg", [contact]).length, 0);
});

test("password guessing is limited per account, not for everyone on the same Wi-Fi", async () => {
  process.env.WASL_DATA_DIR ||= await mkdtemp(
    path.join(tmpdir(), "wasl-limit-"),
  );
  const origin = "http://localhost:3000";
  const post = (route: string, body: unknown) =>
    handleApi(
      new Request(`${origin}/api/${route}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  for (const name of ["Dana", "Eli"])
    assert.equal(
      (
        await post("auth/register", {
          name,
          email: `${name.toLowerCase()}@limit.test`,
          password: "right-password-123",
        })
      ).status,
      201,
    );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await post("auth/login", {
          email: "dana@limit.test",
          password: "wrong-password-0",
        })
      ).status,
      401,
    );
  // the eleventh try on Dana's account is stopped, even with the right password
  assert.equal(
    (
      await post("auth/login", {
        email: "dana@limit.test",
        password: "right-password-123",
      })
    ).status,
    429,
  );
  // someone else on the same connection can still sign in
  assert.equal(
    (
      await post("auth/login", {
        email: "eli@limit.test",
        password: "right-password-123",
      })
    ).status,
    200,
  );
});

test("anyone can ask which build is live, so an installed app knows to update", async () => {
  process.env.WASL_DATA_DIR = await mkdtemp(
    path.join(tmpdir(), "wasl-version-"),
  );
  const response = await handleApi(
    new Request("http://localhost:3000/api/version"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { build } = (await response.json()) as { build: string };
  assert.equal(typeof build, "string");
  assert.ok(build.length > 0);
});

test("a new account can add sample people, find them by search, and remove them", async () => {
  process.env.WASL_DATA_DIR = await mkdtemp(
    path.join(tmpdir(), "wasl-samples-"),
  );
  const origin = "http://localhost:3000";
  let cookie = "";
  const call = async (route: string, method = "GET", body?: unknown) => {
    const response = await handleApi(
      new Request(`${origin}/api/${route}`, {
        method,
        headers: { origin, "content-type": "application/json", cookie },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: response.status, data: await response.json() };
  };
  assert.equal(
    (
      await call("auth/register", "POST", {
        name: "Noor",
        email: "noor@samples.test",
        password: "test-password-123",
      })
    ).status,
    201,
  );
  const find = async (query: string) =>
    (
      (await call("search", "POST", { query, mode: "keyword" })).data as {
        hits: { connection: Connection }[];
      }
    ).hits.map((h) => h.connection.profile.name);
  // nobody saved: nothing to find
  assert.deepEqual(await find("who offered to review my CV"), []);
  assert.equal((await call("sample-people", "POST")).data.added, 5);
  // asking twice doesn't double them
  assert.equal((await call("sample-people", "POST")).data.added, 0);
  const list = (await call("connections")).data as {
    connections: Connection[];
  };
  assert.equal(list.connections.length, 5);
  assert.ok(list.connections.every((c) => c.origin === "sample"));
  assert.deepEqual(await find("who offered to review my CV"), ["Sara Nasser"]);
  assert.deepEqual(await find("mar"), ["Mariam Ali"]);
  assert.equal((await find("Who did I meet at Web Summit Qatar?")).length, 3);
  assert.deepEqual(await find("someone in cybersecurity"), ["Sara Nasser"]);
  assert.deepEqual(await find("how r u"), []);
  // a real person stays when the samples leave
  const saved = await call("connections", "POST", {
    profile: { ...blankProfile, name: "Real Person" },
    tags: [],
    event: "",
    place: "",
    met_on: "2026-11-11",
    favorite: false,
  });
  assert.equal(saved.status, 201);
  assert.equal((await call("sample-people", "DELETE")).data.removed, 5);
  const after = (await call("connections")).data as {
    connections: Connection[];
  };
  assert.deepEqual(
    after.connections.map((c) => c.profile.name),
    ["Real Person"],
  );
});

test("AI search never shows less than keyword search, whatever the model answers", async () => {
  // a stand-in for the AI provider: it answers in the provider's shapes, the way this test tells it to
  let answer:
    | "nothing"
    | "paraphrase"
    | "down"
    | "slow"
    | "nokey"
    | "nocredit"
    | "noindex"
    | "oldmodels" = "nothing";
  const provider = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body || "{}");
    res.setHeader("content-type", "application/json");
    // the list of models the account can see (asked for when search by meaning is refused)
    if (req.method === "GET" && req.url?.endsWith("/models"))
      return res.end(
        JSON.stringify({
          object: "list",
          data: [
            "gpt-6-luna",
            "text-embedding-4",
            "text-embedding-3-small",
          ].map((id) => ({
            id,
            object: "model",
            created: 0,
            owned_by: "openai",
          })),
        }),
      );
    // the two ways a real AI account most often refuses: a bad key, or no credit
    if (answer === "nokey" || answer === "nocredit") {
      res.statusCode = answer === "nokey" ? 401 : 429;
      return res.end(
        JSON.stringify({
          error:
            answer === "nokey"
              ? {
                  message: "Incorrect API key provided.",
                  type: "invalid_request_error",
                  code: "invalid_api_key",
                }
              : {
                  message: "You exceeded your current quota.",
                  type: "insufficient_quota",
                  code: "insufficient_quota",
                },
        }),
      );
    }
    // an account that may not use the two models Wasl asks for first, but may use newer ones
    if (
      answer === "oldmodels" &&
      ["gpt-4o-mini", "text-embedding-3-small"].includes(data.model)
    ) {
      res.statusCode = 403;
      return res.end(
        JSON.stringify({
          error: {
            message: "Project does not have access to model.",
            type: "invalid_request_error",
            code: "model_not_found",
          },
        }),
      );
    }
    // an account that refuses only the "meaning index" model, as some OpenAI projects do
    if (answer === "noindex" && req.url?.endsWith("/embeddings")) {
      res.statusCode = 403;
      return res.end(
        JSON.stringify({
          error: {
            message: "Project does not have access to model.",
            type: "invalid_request_error",
            code: "model_not_found",
          },
        }),
      );
    }
    if (req.url?.endsWith("/embeddings")) {
      const inputs = Array.isArray(data.input) ? data.input : [data.input];
      const vector = new Float32Array(1536).fill(0.02);
      return res.end(
        JSON.stringify({
          object: "list",
          model: data.model,
          data: inputs.map((_: string, index: number) => ({
            object: "embedding",
            index,
            embedding:
              data.encoding_format === "base64"
                ? Buffer.from(vector.buffer).toString("base64")
                : Array.from(vector),
          })),
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
      );
    }
    if (answer === "slow") await new Promise((ok) => setTimeout(ok, 900));
    if (answer === "down") {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: { message: "down" } }));
    }
    // only a search sends saved people; the "is AI working?" check sends a plain sentence
    const { contacts } = (
      data.text?.format?.name === "contact_matches"
        ? JSON.parse(data.input)
        : { contacts: [] }
    ) as { contacts: { id: string; context: string }[] };
    const sara = contacts.find((c) => c.context.includes("Sara Nasser"));
    const matches =
      answer === "paraphrase" && sara
        ? [{ id: sara.id, evidence: "she offered to review the CV" }]
        : (answer === "noindex" || answer === "oldmodels") && sara
          ? [{ id: sara.id, evidence: "Offered to review my CV" }]
          : [];
    res.end(
      JSON.stringify({
        id: "resp_test",
        object: "response",
        created_at: 0,
        status: "completed",
        model: data.model,
        output: [
          {
            type: "message",
            id: "msg_test",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                // the "is AI working?" check asks for a different fixed form
                text: JSON.stringify(
                  data.text?.format?.name === "check"
                    ? { ok: true }
                    : { matches },
                ),
                annotations: [],
              },
            ],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  await new Promise<void>((ok) => provider.listen(0, "127.0.0.1", ok));
  const port = (provider.address() as { port: number }).port;
  process.env.OPENAI_API_KEY = "test-only";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.WASL_DATA_DIR = await mkdtemp(path.join(tmpdir(), "wasl-ai-"));
  try {
    const origin = "http://localhost:3000";
    let cookie = "";
    const call = async (route: string, method = "GET", body?: unknown) => {
      const response = await handleApi(
        new Request(`${origin}/api/${route}`, {
          method,
          headers: { origin, "content-type": "application/json", cookie },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return { status: response.status, data: await response.json() };
    };
    await call("auth/register", "POST", {
      name: "Noor",
      email: "noor@ai.test",
      password: "test-password-123",
    });
    await call("sample-people", "POST");
    const ask = async () =>
      (
        await call("search", "POST", {
          query: "who offered to review my CV",
          mode: "ai",
        })
      ).data as {
        hits: { connection: Connection; evidence: string[] }[];
        mode: string;
        warning: string;
      };
    // the model finds no one: the keyword match still shows
    let result = await ask();
    // the search stored each saved person in the meaning index (five sample people)
    const [stored] = await (
      await database()
    ).query<{ n: number }>(
      "SELECT count(*)::int AS n FROM embeddings e JOIN users u ON u.id=e.owner_id WHERE u.email='noor@ai.test'",
    );
    assert.equal(stored.n, 5);
    assert.deepEqual(
      result.hits.map((h) => h.connection.profile.name),
      ["Sara Nasser"],
    );
    assert.equal(result.warning, "");
    // the model rewords its evidence: the person shows, with the note as it was saved
    answer = "paraphrase";
    result = await ask();
    assert.equal(result.mode, "ai");
    assert.equal(result.hits[0].connection.profile.name, "Sara Nasser");
    assert.match(
      result.hits[0].evidence[0],
      /^Note \(.*Offered to review my CV/,
    );
    // the provider is down: keyword matches, and a line that says so
    answer = "down";
    result = await ask();
    assert.deepEqual(
      result.hits.map((h) => h.connection.profile.name),
      ["Sara Nasser"],
    );
    assert.match(result.warning, /unavailable/);
    // the provider is slow: the answer doesn't wait for it
    answer = "slow";
    process.env.WASL_AI_SEARCH_MS = "300";
    const started = Date.now();
    result = await ask();
    assert.ok(Date.now() - started < 800);
    assert.deepEqual(
      result.hits.map((h) => h.connection.profile.name),
      ["Sara Nasser"],
    );
    assert.match(result.warning, /too long/);
    await new Promise((ok) => setTimeout(ok, 1000));
    // Settings can say whether the AI really works, and why not
    answer = "nothing";
    assert.equal((await call("ai-check")).data.state, "working");
    answer = "nokey";
    let check = (await call("ai-check")).data;
    assert.equal(check.state, "failing");
    assert.match(check.reason, /rejected the API key/);
    answer = "nocredit";
    check = (await call("ai-check")).data;
    assert.equal(check.state, "failing");
    assert.match(check.reason, /no credit/);
    // a search in that state still answers by keyword, and the reason is counted for the day
    result = await ask();
    assert.deepEqual(
      result.hits.map((h) => h.connection.profile.name),
      ["Sara Nasser"],
    );
    assert.match(result.warning, /unavailable/);
    const counter = async (like: string) =>
      (
        await (
          await database()
        ).query<{ count: number }>(
          "SELECT coalesce(sum(count),0)::int AS count FROM usage_buckets WHERE bucket LIKE $1",
          [like],
        )
      )[0].count;
    assert.ok(
      (await counter("ai-fail:credit:%:429:insufficient_quota:%")) >= 2,
    );
    // Only the meaning index is refused (the language model works): AI search still answers by
    // reading the small network whole, and Settings names the part and the model that failed
    answer = "noindex";
    result = await ask();
    assert.equal(result.mode, "ai");
    assert.equal(result.warning, "");
    assert.equal(result.hits[0].connection.profile.name, "Sara Nasser");
    // AI counts as working (the language model does the real work); the missing index is a note
    check = (await call("ai-check")).data;
    assert.equal(check.state, "working");
    assert.match(check.reason, /no model for search by meaning/);
    assert.deepEqual(
      check.parts.map((part: { ok: boolean }) => part.ok),
      [false, true],
    );
    assert.equal(check.parts[0].model, "text-embedding-3-small");
    assert.match(check.parts[0].detail, /403 model_not_found/);
    // and lists the models of that kind the account can see, to choose one from
    assert.deepEqual(check.listed, [
      "text-embedding-3-small",
      "text-embedding-4",
    ]);
    assert.equal(
      await counter("ai-fail:model:search-index:403:model_not_found:%"),
      1,
    );
    // the refusal is remembered: the next search doesn't ask for the index again
    result = await ask();
    assert.equal(result.mode, "ai");
    assert.equal(
      await counter("ai-fail:model:search-index:403:model_not_found:%"),
      1,
    );
    // the status address for whoever looks after the live site needs no sign-in, says which AI
    // service answered, and is limited for everyone together
    const health = async () =>
      (
        await handleApi(new Request("http://localhost:3000/api/health/ai"))
      ).json();
    let seen = await health();
    assert.equal(seen.state, "working");
    assert.equal(seen.parts[0].ok, false);
    assert.match(seen.parts[0].detail, /403 model_not_found/);
    assert.equal(seen.parts[1].ok, true);
    assert.equal("address" in seen, false);
    answer = "nothing";
    seen = await health();
    assert.equal(seen.state, "working");
    for (let i = 0; i < 4; i++) await health();
    assert.equal((await health()).state, "unknown");
    // The account refuses the two models Wasl asks for first but allows newer ones: Wasl
    // switches by itself, AI search works, and Settings says which models it is using
    answer = "oldmodels";
    result = await ask();
    assert.equal(result.mode, "ai");
    assert.equal(result.warning, "");
    assert.equal(result.hits[0].connection.profile.name, "Sara Nasser");
    const [reindexed] = await (
      await database()
    ).query<{ n: number }>(
      "SELECT count(*)::int AS n FROM embeddings e JOIN users u ON u.id=e.owner_id WHERE u.email='noor@ai.test' AND e.model='text-embedding-3-large'",
    );
    assert.equal(reindexed.n, 5);
    check = (await call("ai-check")).data;
    assert.equal(check.state, "working");
    assert.deepEqual(
      check.parts.map((part: { model: string }) => part.model),
      ["text-embedding-3-large", "gpt-6-luna"],
    );
    assert.match(
      check.parts[1].detail,
      /can't use gpt-4o-mini, so Wasl uses gpt-6-luna/,
    );
    // the day's AI searches are used up: search still answers, by keyword
    answer = "nothing";
    process.env.WASL_DAILY_AI_LIMIT = "8";
    result = await ask();
    assert.deepEqual(
      result.hits.map((h) => h.connection.profile.name),
      ["Sara Nasser"],
    );
    assert.match(result.warning, /used up/);
  } finally {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.WASL_AI_SEARCH_MS;
    delete process.env.WASL_DAILY_AI_LIMIT;
    provider.close();
  }
});

test("everyday edges: an email already in use, links typed naturally, a big photo, staying signed in, a card saved twice, AI used up", async () => {
  process.env.WASL_DATA_DIR = await mkdtemp(path.join(tmpdir(), "wasl-edges-"));
  const origin = "http://localhost:3000";
  const session = () => {
    let cookie = "";
    return async (route: string, method = "GET", body?: unknown) => {
      const response = await handleApi(
        new Request(`${origin}/api/${route}`, {
          method,
          headers: { origin, "content-type": "application/json", cookie },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return {
        status: response.status,
        setCookie: set,
        data: await response.json(),
      };
    };
  };
  const alice = session();
  const bob = session();
  const password = "test-password-123";
  assert.equal(
    (
      await alice("auth/register", "POST", {
        name: "Alice",
        email: "alice@edges.test",
        password,
      })
    ).status,
    201,
  );
  // the same email again: a clear message, not a generic one
  const again = await bob("auth/register", "POST", {
    name: "Someone",
    email: "Alice@Edges.test",
    password,
  });
  assert.equal(again.status, 409);
  assert.match(again.data.error, /already exists\. Sign in instead/);
  assert.equal(
    (
      await bob("auth/register", "POST", {
        name: "Bob",
        email: "bob@edges.test",
        password,
      })
    ).status,
    201,
  );

  // links typed the way people say them, and a photo near the size limit (about 45 KB)
  const photo = `data:image/jpeg;base64,${"A".repeat(45000)}`;
  const profile = await alice("profile", "PUT", {
    ...blankProfile,
    name: "Alice Haddad",
    email: " Alice@Sidra.example ",
    linkedin: "linkedin.com/in/alice",
    instagram: "@alice.h",
    website: "sidra.example",
    photo,
  });
  assert.equal(profile.status, 200);
  assert.equal(
    profile.data.user.profile.linkedin,
    "https://linkedin.com/in/alice",
  );
  assert.equal(
    profile.data.user.profile.instagram,
    "https://instagram.com/alice.h",
  );
  assert.equal(profile.data.user.profile.website, "https://sidra.example");
  assert.equal(profile.data.user.profile.email, "alice@sidra.example");
  assert.equal(profile.data.user.profile.photo.length, photo.length);
  const nonsense = await alice("profile", "PUT", {
    ...blankProfile,
    name: "Alice Haddad",
    website: "not a link at all",
  });
  assert.equal(nonsense.status, 400);
  assert.match(nonsense.data.error, /link doesn't look right/);

  // opening the app keeps you signed in: a session with two days left gets its 30 days back
  assert.equal((await alice("session")).setCookie, null);
  await (
    await database()
  ).query(
    "UPDATE sessions SET expires_at=now()+interval '2 days' WHERE user_id=(SELECT id FROM users WHERE email='alice@edges.test')",
  );
  const renewed = await alice("session");
  assert.match(renewed.setCookie || "", /Max-Age=2592000/);
  const [left] = await (
    await database()
  ).query<{ days: number }>(
    "SELECT extract(day FROM expires_at-now())::int AS days FROM sessions WHERE user_id=(SELECT id FROM users WHERE email='alice@edges.test')",
  );
  assert.ok(left.days >= 29);

  // Bob saves Alice's card; opening the link again says it's already saved
  const cards = (await alice("cards")).data.cards as { id: string }[];
  const token = (await alice(`cards/${cards[0].id}/share`, "POST", {})).data
    .token as string;
  assert.equal((await bob(`share/${token}`)).data.saved_id, null);
  const imported = await bob("connections/import", "POST", {
    token,
    event: "Career fair",
    place: "",
    met_on: "2026-11-12",
  });
  assert.equal(imported.status, 201);
  assert.equal(
    (await bob(`share/${token}`)).data.saved_id,
    imported.data.connection.id,
  );
  // a visitor who isn't signed in sees the card, and nothing about anyone's network
  const visitor = session();
  assert.equal((await visitor(`share/${token}`)).data.saved_id, null);

  // AI is switched on but today's allowance is spent: card reading and summaries still answer
  process.env.OPENAI_API_KEY = "test-only";
  process.env.OPENAI_BASE_URL = "http://127.0.0.1:9/v1";
  process.env.WASL_DAILY_AI_LIMIT = "0";
  try {
    const read = await bob("scan-text", "POST", {
      text: "Sara Smith\nProduct Designer\nsara@example.test\n+974 5555 1234",
    });
    assert.equal(read.status, 200);
    assert.equal(read.data.mode, "rules");
    assert.equal(read.data.profile.email, "sara@example.test");
    const summary = await bob("summarize", "POST", {
      transcript:
        "She works on fraud detection at Falcon Analytics.\nShe said to send my CV before December.\nWe both like football.",
    });
    assert.equal(summary.status, 200);
    assert.equal(summary.data.mode, "rules");
    assert.ok(summary.data.points.length > 0);
    assert.match(summary.data.warning, /used up/);
  } finally {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.WASL_DAILY_AI_LIMIT;
  }
});

test("a place lookup that is turned away is tried once more, and the same spot is not asked about twice", async () => {
  process.env.WASL_DATA_DIR = await mkdtemp(path.join(tmpdir(), "wasl-place-"));
  process.env.WASL_PLACE_RETRY_MS = "5";
  const origin = "http://localhost:3000";
  let cookie = "";
  const call = async (route: string, method = "GET", body?: unknown) => {
    const response = await handleApi(
      new Request(`${origin}/api/${route}`, {
        method,
        headers: { origin, "content-type": "application/json", cookie },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: response.status, data: await response.json() };
  };
  assert.equal(
    (
      await call("auth/register", "POST", {
        name: "Place Tester",
        email: "place@example.test",
        password: "test-password-123",
      })
    ).status,
    201,
  );
  // a stand-in for OpenStreetMap's lookup: it answers what the test tells it to
  const real = globalThis.fetch;
  const asked: string[] = [];
  let answers: (number | "down")[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("nominatim.openstreetmap.org")) throw new Error(url);
    asked.push(url);
    const next = answers.shift() ?? 200;
    if (next === "down") throw new Error("network");
    return new Response(
      JSON.stringify({
        name: "Qatar National Convention Centre",
        address: { city: "Doha" },
      }),
      { status: next, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    // turned away once (the free service was busy), then answered
    answers = [503, 200];
    const first = await call("place?lat=25.3148&lon=51.4396");
    assert.equal(first.status, 200);
    assert.equal(first.data.place, "Qatar National Convention Centre, Doha");
    assert.equal(asked.length, 2);
    // only rounded coordinates leave Wasl
    assert.match(asked[0], /lat=25\.3148&lon=51\.4396/);

    // the next person saved at the same event: answered from memory, nothing is asked again
    const again = await call("place?lat=25.31482&lon=51.43958");
    assert.equal(again.status, 200);
    assert.equal(again.data.place, "Qatar National Convention Centre, Doha");
    assert.equal(asked.length, 2);

    // somewhere else, with the service down both times: a plain message, and nothing is kept
    answers = ["down", 500];
    const down = await call("place?lat=25.2600&lon=51.5300");
    assert.equal(down.status, 502);
    assert.match(down.data.error, /Type it instead/);
    assert.equal(asked.length, 4);
    answers = [200];
    assert.equal((await call("place?lat=25.2600&lon=51.5300")).status, 200);
    assert.equal(asked.length, 5);

    // coordinates that aren't on Earth are refused before anything is asked
    assert.equal((await call("place?lat=125&lon=51")).status, 400);
    assert.equal(asked.length, 5);
  } finally {
    globalThis.fetch = real;
    delete process.env.WASL_PLACE_RETRY_MS;
  }
});
