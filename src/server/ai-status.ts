import OpenAI from "openai";
import { consumeLimit } from "../lib/auth";
import type { Database } from "../lib/db";
import { askLanguageModel, configuredModels, embedText } from "./ai-models";

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
      async () => ({ waslModel: (await embedText(client, "Wasl")).model }),
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
  const parts: { name: string; model: string; ok: boolean; detail: string }[] =
    [];
  for (const [name, asked, step, run] of tries) {
    try {
      const { waslModel } = await run();
      parts.push({
        name,
        model: waslModel,
        ok: true,
        // the account refused the usual model and a spare one answered
        detail:
          waslModel === asked
            ? ""
            : `This account can't use ${asked}, so Wasl uses ${waslModel} instead.`,
      });
    } catch (error) {
      if (error instanceof UnreadableAnswer) {
        await noteAiFailure(error, db, `${step}-unreadable`);
        parts.push({
          name,
          model: error.model,
          ok: false,
          detail: `${error.model} answered, but not in the form Wasl needs.`,
        });
        continue;
      }
      const problem = await noteAiFailure(error, db, step);
      const { status, code } = said(error);
      parts.push({
        name,
        model: asked,
        ok: false,
        detail: `${reasons[problem]}${status || code ? ` (OpenAI answered: ${[status || "", code].filter(Boolean).join(" ")})` : ""}`,
      });
    }
  }
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
  const failed = parts.filter((part) => !part.ok);
  return {
    state: failed.length ? ("failing" as const) : ("working" as const),
    reason: failed.length
      ? failed.length === parts.length
        ? failed[0].detail
        : `${failed[0].name} isn't working: ${failed[0].detail}`
      : "",
    parts,
    address,
    listed,
  };
}
