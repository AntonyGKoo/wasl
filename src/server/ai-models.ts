import OpenAI from "openai";

// Which AI models Wasl uses. It asks for the configured one first. If the AI account answers
// "you can't use that model" (the account isn't allowed to, or OpenAI has retired it), Wasl
// tries the spare ones in order and remembers the first that works, so AI features keep
// working without anyone changing a setting. Any other kind of failure is not retried here.
const language = () => process.env.OPENAI_MODEL || "gpt-4o-mini";
const index = () =>
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const list = (value: string | undefined, fallback: string) =>
  (value ?? fallback)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
// gpt-6-luna is the replacement OpenAI names for gpt-4o-mini (deprecations page, Nov 2026)
const spareLanguage = () =>
  list(process.env.OPENAI_FALLBACK_MODELS, "gpt-6-luna");
const spareIndex = () =>
  list(process.env.OPENAI_FALLBACK_EMBEDDING_MODELS, "text-embedding-3-large");

// remembered for as long as this server instance lives
const working: { language?: string; index?: string } = {};

export const modelRefused = (error: unknown) =>
  error instanceof OpenAI.APIError &&
  (error.code === "model_not_found" || error.status === 404);

async function firstAllowed<T>(
  kind: "language" | "index",
  run: (model: string) => Promise<T>,
) {
  const wanted = kind === "language" ? language() : index();
  const spares = kind === "language" ? spareLanguage() : spareIndex();
  const order = [...new Set([working[kind] || wanted, wanted, ...spares])];
  let refusal: unknown;
  for (const model of order) {
    try {
      const result = await run(model);
      working[kind] = model;
      return { model, result, wanted };
    } catch (error) {
      if (!modelRefused(error)) throw error;
      refusal ??= error; // report what was said about the model Wasl asked for first
      if (working[kind] === model) working[kind] = undefined;
    }
  }
  throw refusal;
}

type Ask = Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, "model">;
// One question to the language model (card reading, summaries, picking search matches).
export async function askLanguageModel(client: OpenAI, ask: Ask) {
  const { result, model, wanted } = await firstAllowed("language", (model) =>
    client.responses.create({
      ...ask,
      model,
      // a spare model may think before it answers; give it room so the answer isn't cut short
      ...(model === language()
        ? {}
        : {
            max_output_tokens: Math.max(ask.max_output_tokens || 0, 4000),
          }),
    }),
  );
  return Object.assign(result, { waslModel: model, waslWanted: wanted });
}
// Text as numbers for search by meaning. The model used is returned, because numbers from two
// different models can't be compared: everything in one search uses the same one.
export async function embedText(
  client: OpenAI,
  input: string | string[],
  only?: string,
  // the "is AI working?" check always really asks
  fresh = false,
) {
  const run = (model: string) =>
    client.embeddings.create({ model, dimensions: 1536, input });
  if (only) return { model: only, result: await run(only), wanted: index() };
  if (!fresh && Date.now() < indexRefusedUntil) throw new IndexUnavailable();
  try {
    const answer = await firstAllowed("index", run);
    indexRefusedUntil = 0;
    return answer;
  } catch (error) {
    // every model of this kind was refused: don't ask again on each search for a while
    if (modelRefused(error)) indexRefusedUntil = Date.now() + 30 * 60 * 1000;
    throw error;
  }
}
// The account has no model for search by meaning (asked recently, and it was refused).
export class IndexUnavailable extends Error {}
let indexRefusedUntil = 0;
export const configuredModels = () => ({
  language: language(),
  index: index(),
});
