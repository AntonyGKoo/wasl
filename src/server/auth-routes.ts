import { z } from "zod";
import { database } from "../lib/db";
import {
  authBucket,
  consumeLimit,
  createSession,
  hashToken,
  registerAccount,
  sessionCookie,
  SESSION_COOKIE,
  verifyPassword,
} from "../lib/auth";
import {
  loginSchema,
  profileSchema,
  registrationSchema,
} from "../lib/validation";
import { HttpError, json, readJson } from "./responses";
import type { User } from "../lib/types";
export async function authRoute(request: Request, action: string) {
  const db = await database();
  if (action === "logout") {
    const token = (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
    if (token)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hashToken(token),
      ]);
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
  }
  if (!(await consumeLimit(authBucket(request), 20, 900, db)))
    throw new HttpError(
      429,
      "Too many sign-in attempts. Please try again in 15 minutes.",
    );
  let id: string;
  if (action === "register")
    id = await registerAccount(await readJson(request, registrationSchema), db);
  else if (action === "login") {
    const input = await readJson(request, loginSchema);
    const [record] = await db.query<{ id: string; password_hash: string }>(
      "SELECT id,password_hash FROM users WHERE email=$1",
      [input.email],
    );
    if (
      !(await verifyPassword(input.password, record?.password_hash)) ||
      !record
    )
      throw new HttpError(401, "Email or password is incorrect.");
    id = record.id;
  } else throw new HttpError(404, "Not found.");
  const token = await createSession(id, db);
  const [user] = await db.query<User>(
    "SELECT id,name,email,profile,created_at FROM users WHERE id=$1",
    [id],
  );
  return json({ user }, action === "register" ? 201 : 200, {
    "Set-Cookie": sessionCookie(token),
  });
}
export async function updateProfile(request: Request, user: User) {
  const profile = await readJson(request, profileSchema);
  if (!profile.name) throw new HttpError(400, "Please include your name.");
  const db = await database();
  await db.query("UPDATE users SET name=$1,profile=$2::jsonb WHERE id=$3", [
    profile.name,
    JSON.stringify(profile),
    user.id,
  ]);
  return json({ user: { ...user, name: profile.name, profile } });
}
