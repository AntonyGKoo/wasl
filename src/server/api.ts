import { authRoute, updateProfile } from "./auth-routes";
import {
  assertOrigin,
  errorResponse,
  HttpError,
  json,
  readJson,
} from "./responses";
import { consumeLimit, sessionUser } from "../lib/auth";
import { blankProfile } from "../lib/types";
import {
  cardSchema,
  connectionSchema,
  importSchema,
  noteSchema,
  searchSchema,
  uuidSchema,
} from "../lib/validation";
import {
  deleteCard,
  deleteConnection,
  deleteNote,
  getConnection,
  importCard,
  listCards,
  listConnections,
  publicCard,
  refreshSharedContact,
  revokeShare,
  saveCard,
  saveConnection,
  saveNote,
  shareCard,
} from "./network";
import { recall, searchableContacts } from "./recall";
import { scanCard } from "./scan";
import { makeVcard } from "../lib/vcard";
export async function handleApi(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname
      .replace(/^\/api\/?/, "")
      .split("/")
      .filter(Boolean);
    const [area, id, action] = parts;
    const method = request.method;
    if (!["GET", "HEAD"].includes(method)) assertOrigin(request);
    if (area === "auth" && method === "POST")
      return await authRoute(request, id);
    if (area === "share" && method === "GET") {
      const card = await publicCard(id);
      if (action === "vcard") return vcardResponse(card.profile);
      return json({ card });
    }
    const user = await sessionUser(request);
    if (area === "session" && method === "GET")
      return json({
        user: user
          ? { ...user, profile: { ...blankProfile, ...user.profile } }
          : null,
        capabilities: {
          presentation:
            process.env.WASL_PRESENTATION_MODE === "true" &&
            !process.env.DATABASE_URL &&
            !process.env.VERCEL,
          ai: !!process.env.OPENAI_API_KEY,
          ocr: !!process.env.GOOGLE_CLOUD_VISION_API_KEY,
          database: process.env.DATABASE_URL ? "postgres" : "local",
        },
      });
    if (!user) throw new HttpError(401, "Please sign in to continue.");
    if (method !== "GET" && !(await consumeLimit(`write:${user.id}`, 120, 60)))
      throw new HttpError(429, "Please slow down and try again in a minute.");
    if (area === "profile" && method === "PUT")
      return await updateProfile(request, user);
    if (area === "cards") {
      if (!id && method === "GET")
        return json({ cards: await listCards(user) });
      if (!id && method === "POST")
        return json(
          { card: await saveCard(user, await readJson(request, cardSchema)) },
          201,
        );
      uuidSchema.parse(id);
      if (action === "share" && method === "POST")
        return json({ token: await shareCard(user.id, id) });
      if (action === "share" && method === "DELETE") {
        await revokeShare(user.id, id);
        return json({ ok: true });
      }
      if (!action && method === "PUT")
        return json({
          card: await saveCard(user, await readJson(request, cardSchema), id),
        });
      if (!action && method === "DELETE") {
        await deleteCard(user.id, id);
        return json({ ok: true });
      }
    }
    if (area === "connections") {
      if (!id && method === "GET")
        return json({ connections: await listConnections(user.id) });
      if (!id && method === "POST")
        return json(
          {
            connection: await saveConnection(
              user.id,
              await readJson(request, connectionSchema),
            ),
          },
          201,
        );
      if (id === "import" && method === "POST")
        return json(
          {
            connection: await importCard(
              user.id,
              await readJson(request, importSchema),
            ),
          },
          201,
        );
      uuidSchema.parse(id);
      if (!action && method === "GET")
        return json({ connection: await getConnection(user.id, id) });
      if (!action && method === "PUT")
        return json({
          connection: await saveConnection(
            user.id,
            await readJson(request, connectionSchema),
            id,
          ),
        });
      if (!action && method === "DELETE") {
        await deleteConnection(user.id, id);
        return json({ ok: true });
      }
      if (action === "notes" && method === "POST")
        return json(
          {
            note: await saveNote(
              user.id,
              id,
              await readJson(request, noteSchema),
            ),
          },
          201,
        );
      if (action === "refresh" && method === "POST")
        return json({ connection: await refreshSharedContact(user.id, id) });
      if (action === "vcard" && method === "GET")
        return vcardResponse((await getConnection(user.id, id)).profile);
    }
    if (area === "notes" && method === "DELETE") {
      uuidSchema.parse(id);
      await deleteNote(user.id, id);
      return json({ ok: true });
    }
    if (area === "search" && method === "POST") {
      const input = await readJson(request, searchSchema);
      return json(await recall(user.id, input.query, input.mode));
    }
    if (area === "scan" && method === "POST")
      return json(await scanCard(request, user.id));
    if (area === "export" && method === "GET")
      return json(
        {
          version: 1,
          exported_at: new Date().toISOString(),
          profile: user.profile,
          cards: await listCards(user),
          connections: await searchableContacts(user.id),
        },
        200,
        { "Content-Disposition": "attachment; filename=wasl-network.json" },
      );
    throw new HttpError(404, "Not found.");
  } catch (error) {
    return errorResponse(error);
  }
}
function vcardResponse(profile: Parameters<typeof makeVcard>[0]) {
  return new Response(makeVcard(profile), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": "attachment; filename=wasl-contact.vcf",
      "Cache-Control": "no-store",
    },
  });
}
