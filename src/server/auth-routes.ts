import { randomUUID } from "node:crypto";
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
  hashPassword,
} from "../lib/auth";
import {
  accountDeleteSchema,
  loginSchema,
  passwordChangeSchema,
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
  // A whole event can share one Wi-Fi connection, so the limit per connection is generous;
  // guessing one account's password is limited per email below.
  if (!(await consumeLimit(authBucket(request), 150, 900, db)))
    throw new HttpError(
      429,
      "Too many sign-in attempts from this network. Please try again in 15 minutes.",
    );
  let id: string;
  if (action === "register") {
    try {
      id = await registerAccount(
        await readJson(request, registrationSchema),
        db,
      );
    } catch (error) {
      if ((error as { code?: string })?.code === "23505")
        throw new HttpError(
          409,
          "An account with this email already exists. Sign in instead.",
        );
      throw error;
    }
    // like the mockup: a new account starts with one card, ready to share
    await db.query(
      "INSERT INTO cards(id,owner_id,label,kind,color,fields) VALUES($1,$2,'Professional','professional','ocean',$3)",
      [
        randomUUID(),
        id,
        [
          "name",
          "title",
          "company",
          "university",
          "email",
          "phone",
          "linkedin",
          "website",
          "photo",
        ],
      ],
    );
  } else if (action === "login") {
    const input = await readJson(request, loginSchema);
    if (!(await consumeLimit(`login:${hashToken(input.email)}`, 10, 900, db)))
      throw new HttpError(
        429,
        "Too many sign-in attempts for this account. Please try again in 15 minutes.",
      );
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

async function checkPassword(user: User, password: string) {
  const db = await database();
  if (!(await consumeLimit(`password:${user.id}`, 10, 900, db)))
    throw new HttpError(429, "Too many tries. Please wait 15 minutes.");
  const [record] = await db.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id=$1",
    [user.id],
  );
  if (!(await verifyPassword(password, record?.password_hash)))
    throw new HttpError(400, "Your current password is not correct.");
  return db;
}
export async function changePassword(request: Request, user: User) {
  const input = await readJson(request, passwordChangeSchema);
  const db = await checkPassword(user, input.current);
  await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
    await hashPassword(input.next),
    user.id,
  ]);
  // sign out every other device; this one gets a fresh session
  await db.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
  const token = await createSession(user.id, db);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
}
export async function deleteAccount(request: Request, user: User) {
  const input = await readJson(request, accountDeleteSchema);
  const db = await checkPassword(user, input.password);
  // cards, links, connections, notes and search data are removed with the account
  await db.query("DELETE FROM users WHERE id=$1", [user.id]);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
}
