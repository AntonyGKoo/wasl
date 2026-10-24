import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { database, type Database } from "./db";
import type { User } from "./types";
const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "wasl_session";
const TTL = 60 * 60 * 24 * 14;
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const [, salt, hash] = (
    encoded || "scrypt$00000000000000000000000000000000$" + "0".repeat(128)
  ).split("$");
  if (!salt || !hash || hash.length !== 128) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export async function createSession(userId: string, providedDb?: Database) {
  const db = providedDb ?? (await database());
  const token = randomBytes(32).toString("base64url");
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
    [hashToken(token), userId, new Date(Date.now() + TTL * 1000)],
  );
  return token;
}
export async function sessionUser(
  request: Request,
  providedDb?: Database,
): Promise<User | null> {
  const db = providedDb ?? (await database());
  const token = (request.headers.get("cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [user] = await db.query<User>(
    "SELECT u.id,u.name,u.email,u.profile,u.created_at FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hashToken(token)],
  );
  return user || null;
}
export function sessionCookie(token: string, clear = false) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : TTL}${secure}`;
}
export async function consumeLimit(
  bucket: string,
  limit: number,
  seconds = 86400,
  providedDb?: Database,
) {
  const db = providedDb ?? (await database());
  const [result] = await db.query<{ count: number }>(
    `
    INSERT INTO usage_buckets(bucket,count,reset_at) VALUES ($1,1,now()+$2::int*interval '1 second')
    ON CONFLICT (bucket) DO UPDATE SET
      count=CASE WHEN usage_buckets.reset_at<=now() THEN 1 ELSE usage_buckets.count+1 END,
      reset_at=CASE WHEN usage_buckets.reset_at<=now() THEN excluded.reset_at ELSE usage_buckets.reset_at END
    RETURNING count`,
    [bucket, seconds],
  );
  return result.count <= limit;
}
export function authBucket(request: Request) {
  const ip =
    process.env.TRUST_PROXY === "true"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : "local";
  return `auth:${hashToken(ip || "unknown")}`;
}
export async function registerAccount(
  input: { name: string; email: string; password: string },
  providedDb?: Database,
) {
  const db = providedDb ?? (await database());
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  await db.query(
    "INSERT INTO users(id,email,name,password_hash,profile) VALUES($1,$2,$3,$4,$5::jsonb)",
    [
      id,
      input.email,
      input.name,
      passwordHash,
      JSON.stringify({ name: input.name, email: input.email }),
    ],
  );
  return id;
}
