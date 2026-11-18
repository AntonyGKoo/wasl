import OpenAI from "openai";
import { consumeLimit } from "../lib/auth";
import type { Database } from "../lib/db";
import { askLanguageModel, configuredModels, embedText } from "./ai-models";
import { groundedMatches, lexicalRecall, matchRequest } from "./recall";
import { blankProfile, type Connection } from "../lib/types";

// When a call to the AI provider fails, Wasl carries on without AI (keyword search, built-in
// rules). This file works out WHY it failed, in words the person running Wasl can act on, and
// keeps a daily count per reason. Nothing about the request or its contents is kept.
export type AiProblem =
  | "key"
  | "credit"
  | "access"
  | "model"
  | "busy"
  | "request"
  | "network"
  | "slow"
  | "other";

const reasons: Record<AiProblem, string> = {
  key: "OpenAI rejected the API key. Put a working key in OPENAI_API_KEY.",
  credit:
    "The OpenAI account has no credit. Add a payment method or credits at platform.openai.com (a ChatGPT subscription doesn't count).",
  access:
    "This OpenAI key isn't allowed to use the model or project Wasl asks for.",
  model:
    "OpenAI says this account's project isn't allowed to use the model. Usually the account has no paid credit yet (an account without it can use very few models), or the project's list of allowed models leaves it out.",
  busy: "OpenAI is limiting how many requests this account can make right now.",
  request: "OpenAI didn't accept Wasl's request.",
  network: "Wasl couldn't reach OpenAI.",
  slow: "OpenAI took too long to answer.",
  other: "The AI service returned an error.",
};

// the model answered, but what came back couldn't be read as the fixed form Wasl asked for
class UnreadableAnswer extends Error {
  constructor(public model: string) {
    super("unreadable");
  }
}
// the model answered a test search, but didn't pick the person it should have
class WrongPerson extends Error {
  constructor(public model: string) {
    super("wrong person");
  }
}

// A real AI search, run the way Wasl runs one, on three made-up people. The question can only
// be answered by meaning: Sara's note says "CV", the question says "resume", and keyword search
// finds no one. Nobody's saved data is used.
const madeUp = (
  id: string,
  profile: { name: string; title: string; company: string },
  note: string,
): Connection => ({
  id,
  owner_id: "",
  profile: { ...blankProfile, ...profile },
  tags: [],
  event: "Campus career fair",
  place: "Education City",
  met_on: "2026-11-02",
  favorite: false,
  albums: [],
  origin: "sample",
  unseen: false,
  source_share_id: null,
  created_at: "",
  updated_at: "",
  version: 1,
  notes: [
    {
      id: `${id}-note`,
      connection_id: id,
      body: note,
      happened_on: "2026-11-02",
      created_at: "",
    },
  ],
});
const testPeople = [
  madeUp(
    "00000000-0000-4000-8000-00000000a001",
    {
      name: "Sara Nasser",
      title: "Security analyst",
      company: "Corniche Bank",
    },
    "Offered to review my CV and do a mock interview.",
  ),
  madeUp(
    "00000000-0000-4000-8000-00000000a002",
    { name: "Omar Haddad", title: "Product designer", company: "Sidra Studio" },
    "Showed me his portfolio app and the sign-up screens he is building.",
  ),
  madeUp(
    "00000000-0000-4000-8000-00000000a003",
    { name: "Yousef Al-Kuwari", title: "Founder", company: "Najm Robotics" },
    "Building delivery robots and hiring a first engineer.",
  ),
];
const testQuestion = "who could look over my resume";
export function aiProblem(error: unknown): AiProblem {
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    (error as { name?: string })?.name === "TimeoutError"
  )
    return "slow";
  if (error instanceof OpenAI.APIConnectionError) return "network";
  if (error instanceof OpenAI.APIError) {
    const code = String(error.code || "");
    if (error.status === 401) return "key";
    if (code === "insufficient_quota") return "credit";
    if (code === "model_not_found" || error.status === 404) return "model";
    if (error.status === 403) return "access";
    if (error.status === 429) return "busy";
    if (error.status === 400) return "request";
  }
  return "other";
}
export const aiReason = (problem: AiProblem) => reasons[problem];

// what the provider said, as two short codes ("403", "model_not_found"): no message, no content
const said = (error: unknown) => {
  const status = Number((error as { status?: number })?.status) || 0;
  const code = String((error as { code?: unknown })?.code || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
  return { status, code };
};
// One line in the server log and one counter per day, named after the reason, the step that
// failed and what the provider said: "ai-fail:model:search-index:403:model_not_found:2026-11-12".
export async function noteAiFailure(
  error: unknown,
  db?: Database,
  step = "other",
) {
  const problem = error === "slow" ? "slow" : aiProblem(error);
  const { status, code } = said(error);
  console.error("Wasl AI call failed:", problem, step, status || "", code);
  try {
    const day = new Date().toISOString().slice(0, 10);
    await consumeLimit(
      `ai-fail:${problem}:${step}:${status || "-"}:${code || "-"}:${day}`,
      Number.MAX_SAFE_INTEGER,
      7 * 86400,
      db,
    );
  } catch {
    // counting is best-effort
  }
  return problem;
}

// A real, tiny call to each of the two AI services Wasl uses, so Settings can say "Working" and
// mean it, and when one is refused, say which one, which model, and what the provider answered.
export async function checkAi(userId: string | null, db?: Database) {
  if (!process.env.OPENAI_API_KEY)
    return { state: "off" as const, reason: "", parts: [] };
  // signed in (Settings): 12 an hour each. Not signed in (the status address used to keep an
  // eye on the live site): 6 an hour for everyone together, so it can't be used to run up a bill.
  const allowed = userId
    ? await consumeLimit(`ai-check:${userId}`, 12, 3600, db)
    : await consumeLimit("ai-check:public", 6, 3600, db);
  if (!allowed)
    return {
      state: "unknown" as const,
      reason: "Checked a lot just now. Try again in a little while.",
      parts: [],
    };
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 9000,
    maxRetries: 0,
  });
  const wanted = configuredModels();
  const tries: [
    string,
    string,
    string,
    () => Promise<{ waslModel: string }>,
  ][] = [
    [
      "Search by meaning",
      wanted.index,
      "check-index",
      async () => ({
        waslModel: (await embedText(client, "Wasl", undefined, true)).model,
      }),
    ],
    [
      "Reading cards, summaries and picking matches",
      wanted.language,
      "check-model",
      // the same kind of request Wasl really makes: an answer in a fixed form, which is then read
      async () => {
        const response = await askLanguageModel(client, {
          store: false,
          max_output_tokens: 200,
          instructions: "Answer with ok set to true.",
          input: "Is this working?",
          text: {
            format: {
              type: "json_schema",
              name: "check",
              strict: true,
              schema: {
                type: "object",
                properties: { ok: { type: "boolean" } },
                required: ["ok"],
                additionalProperties: false,
              },
            },
          },
        });
        let ok = false;
        try {
          ok = JSON.parse(response.output_text).ok === true;
        } catch {
          ok = false;
        }
        if (!ok) throw new UnreadableAnswer(response.waslModel);
        return response;
      },
    ],
  ];
  // a real AI search on made-up people, with the same time limit a real search has
  let searchSeconds = 0;
  tries.push([
    "AI search, tested on three made-up people",
    wanted.language,
    "check-search",
    async () => {
      const started = Date.now();
      const searchClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 10000,
        maxRetries: 0,
      });
      const response = await askLanguageModel(
        searchClient,
        matchRequest(testQuestion, testPeople),
      );
      searchSeconds = (Date.now() - started) / 1000;
      let found: ReturnType<typeof groundedMatches> = [];
      try {
        found = groundedMatches(JSON.parse(response.output_text), testPeople);
      } catch {
        throw new UnreadableAnswer(response.waslModel);
      }
      if (!found.some((h) => h.connection.id === testPeople[0].id))
        throw new WrongPerson(response.waslModel);
      return response;
    },
  ]);
  // keyword search alone can't answer the test question, so a right answer is the AI's
  const keywordFinds = lexicalRecall(testQuestion, testPeople).length > 0;
  // the checks run side by side, so the whole check takes as long as the slowest one
  const parts = await Promise.all(
    tries.map(async ([name, asked, step, run]) => {
      try {
        const { waslModel } = await run();
        const spare =
          waslModel === asked
            ? ""
            : `This account can't use ${asked}, so Wasl uses ${waslModel} instead.`;
        return {
          name,
          model: waslModel,
          ok: true,
          // the account refused the usual model and a spare one answered
          detail:
            step === "check-search"
              ? `Asked "${testQuestion}", it found Sara, whose note says "CV", in ${searchSeconds.toFixed(1)} s${keywordFinds ? "" : " (keyword search finds no one for this)"}.`
              : spare,
        };
      } catch (error) {
        if (error instanceof UnreadableAnswer || error instanceof WrongPerson) {
          await noteAiFailure(
            error,
            db,
            `${step}-${error instanceof WrongPerson ? "wrong" : "unreadable"}`,
          );
          return {
            name,
            model: error.model,
            ok: false,
            detail:
              error instanceof WrongPerson
                ? `${error.model} answered a test search, but didn't find the right person.`
                : `${error.model} answered, but not in the form Wasl needs.`,
          };
        }
        const problem = await noteAiFailure(error, db, step);
        const { status, code } = said(error);
        return {
          name,
          model: asked,
          ok: false,
          detail: `${reasons[problem]}${status || code ? ` (OpenAI answered: ${[status || "", code].filter(Boolean).join(" ")})` : ""}`,
        };
      }
    }),
  );
  // Search by meaning refused: which models of that kind does OpenAI list for this account?
  // (Names only. Listing is free. One of them can be set as OPENAI_EMBEDDING_MODEL.)
  let listed: string[] = [];
  if (!parts[0].ok) {
    try {
      for await (const model of client.models.list()) {
        if (/embed/i.test(model.id)) listed.push(model.id);
        if (listed.length >= 12) break;
      }
      listed = listed.sort();
    } catch {
      listed = [];
    }
  }
  // set only when the AI address was changed from OpenAI's own; the host name is not a secret
  let address = "";
  try {
    if (process.env.OPENAI_BASE_URL)
      address = new URL(process.env.OPENAI_BASE_URL).host;
  } catch {
    address = "an address that isn't a valid link";
  }
  // The language model does the real work (reading cards, summaries, picking search matches),
  // so AI is "working" when it answers. Search by meaning's own model is a helper: without it
  // AI search still works by reading the saved people directly.
  const [meaning, languagePart, searchPart] = parts;
  return {
    state:
      languagePart.ok && searchPart.ok
        ? ("working" as const)
        : ("failing" as const),
    reason: !languagePart.ok
      ? languagePart.detail
      : !searchPart.ok
        ? searchPart.detail
        : !meaning.ok
          ? "This OpenAI account has no model for search by meaning, so AI search reads your saved people directly instead (everyone, up to 25 people; after that, keyword matches and your most recent people)."
          : "",
    parts,
    address,
    listed,
  };
}
