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

// one line in the server log and one counter per reason per day
export async function noteAiFailure(error: unknown, db?: Database) {
  const problem = error === "slow" ? "slow" : aiProblem(error);
  console.error(
    "Wasl AI call failed:",
    problem,
    (error as { status?: number })?.status ?? "",
  );
  try {
    const day = new Date().toISOString().slice(0, 10);
    await consumeLimit(
      `ai-fail:${problem}:${day}`,
      Number.MAX_SAFE_INTEGER,
      7 * 86400,
      db,
    );
  } catch {
    // counting is best-effort
  }
  return problem;
}

// A real, tiny call to each AI service Wasl uses, so Settings can say "Working" and mean it.
export async function checkAi(userId: string, db?: Database) {
  if (!process.env.OPENAI_API_KEY) return { state: "off" as const, reason: "" };
  if (!(await consumeLimit(`ai-check:${userId}`, 12, 3600, db)))
    return {
      state: "unknown" as const,
      reason: "Checked a lot just now. Try again in a little while.",
    };
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 9000,
    maxRetries: 0,
  });
  try {
    await client.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      dimensions: 1536,
      input: "Wasl",
    });
    await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      store: false,
      max_output_tokens: 16,
      input: "Reply with the word OK.",
    });
    return { state: "working" as const, reason: "" };
  } catch (error) {
    const problem = await noteAiFailure(error, db);
    return { state: "failing" as const, reason: reasons[problem], problem };
  }
}
