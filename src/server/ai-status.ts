import OpenAI from "openai";
import { consumeLimit } from "../lib/auth";
import type { Database } from "../lib/db";

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
    "The AI model Wasl asks for isn't available to this OpenAI account. Set OPENAI_MODEL to one that is.",
  busy: "OpenAI is limiting how many requests this account can make right now.",
  request: "OpenAI didn't accept Wasl's request.",
  network: "Wasl couldn't reach OpenAI.",
  slow: "OpenAI took too long to answer.",
  other: "The AI service returned an error.",
};

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
export async function checkAi(userId: string, db?: Database) {
  if (!process.env.OPENAI_API_KEY)
    return { state: "off" as const, reason: "", parts: [] };
  if (!(await consumeLimit(`ai-check:${userId}`, 12, 3600, db)))
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
  const index = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const language = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const tries: [string, string, string, () => Promise<unknown>][] = [
    [
      "Search by meaning",
      index,
      "check-index",
      () =>
        client.embeddings.create({
          model: index,
          dimensions: 1536,
          input: "Wasl",
        }),
    ],
    [
      "Reading cards, summaries and picking matches",
      language,
      "check-model",
      () =>
        client.responses.create({
          model: language,
          store: false,
          max_output_tokens: 16,
          input: "Reply with the word OK.",
        }),
    ],
  ];
  const parts: { name: string; model: string; ok: boolean; detail: string }[] =
    [];
  for (const [name, model, step, run] of tries) {
    try {
      await run();
      parts.push({ name, model, ok: true, detail: "" });
    } catch (error) {
      const problem = await noteAiFailure(error, db, step);
      const { status, code } = said(error);
      parts.push({
        name,
        model,
        ok: false,
        detail: `${reasons[problem]}${status || code ? ` (OpenAI answered: ${[status || "", code].filter(Boolean).join(" ")})` : ""}`,
      });
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
  };
}
