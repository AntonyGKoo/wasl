import { z } from "zod";
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "This request did not come from Wasl. Refresh the page and try again.");
}
export async function limitedBody(request: Request, max: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > max) throw new HttpError(413, "This file or request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new HttpError(413, "This file or request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "Send JSON data.");
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 32000))); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, "The request could not be read."); }
  return schema.parse(body);
}
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || "Check the form fields.", fields: error.flatten() }, 400);
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if ((error as { code?: string })?.code === "23505") return json({ error: "That email or connection already exists." }, 409);
  // Never log contact data, credentials, SQL statements, or provider response bodies.
  console.error("Wasl request failed:", error instanceof Error ? error.name : "UnknownError");
  return json({ error: "Something went wrong. Please try again." }, 500);
}
