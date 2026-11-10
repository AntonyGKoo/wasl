import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import postgres from "postgres";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface Queryable {
  query<T = Record<string, unknown>>(
    text: string,
    args?: unknown[],
  ): Promise<T[]>;
  exec(text: string): Promise<void>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
function localAdapter(client: Pick<PGlite, "query" | "exec">): Queryable {
  return {
    async query<T>(text: string, args: unknown[] = []) {
      return (await client.query<T>(text, args)).rows;
    },
    async exec(text) {
      await client.exec(text);
    },
  };
}
export async function openDatabase(
  options: { memory?: boolean; url?: string; dataDir?: string } = {},
): Promise<Database> {
  const url =
    options.url ??
    (options.memory || options.dataDir ? undefined : process.env.DATABASE_URL);
  if (url) {
    const pool = postgres(url, {
      max: 5,
      prepare: false,
      onnotice: () => {},
      ...(process.env.DATABASE_CA_CERT
        ? {
            ssl: {
              ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n"),
              rejectUnauthorized: true,
            },
          }
        : {}),
      types: {
        // Queryable accepts serialized JSON, as PGlite does. Postgres.js would
        // otherwise JSON.stringify these parameters a second time.
        json: {
          to: 114,
          from: [114, 3802],
          serialize: (value: unknown) =>
            typeof value === "string" ? value : JSON.stringify(value),
          parse: (value: string) => JSON.parse(value),
        },
        // Preserve calendar dates; converting them to Date objects can shift
        // the day in another timezone and breaks form/recall date formatting.
        date: {
          to: 1082,
          from: [1082],
          serialize: (value: string) => value,
          parse: (value: string) => value,
        },
      },
    });
    const adapter = (client: typeof pool): Queryable => ({
      async query<T>(text: string, args: unknown[] = []) {
        return (await client.unsafe(text, args as never[])) as unknown as T[];
      },
      async exec(text) {
        await client.unsafe(text);
      },
    });
    return {
      ...adapter(pool),
      transaction: (fn) =>
        pool.begin(async (tx) =>
          fn(adapter(tx as unknown as typeof pool)),
        ) as Promise<never>,
      close: () => pool.end(),
    };
  }
  if (process.env.VERCEL)
    throw new Error(
      "Set DATABASE_URL before deploying to Vercel. Local files are not durable there.",
    );
  const dir = options.memory
    ? "memory://"
    : path.resolve(
        options.dataDir || process.env.WASL_DATA_DIR || ".wasl-data",
      );
  if (!options.memory) await mkdir(dir, { recursive: true, mode: 0o700 });
  const pg = await PGlite.create(dir, { extensions: { vector } });
  return {
    ...localAdapter(pg),
    transaction: (fn) => pg.transaction((tx) => fn(localAdapter(tx))),
    close: () => pg.close(),
  };
}
export async function migrate(db: Database) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const dir = path.join(process.cwd(), "db");
  // every db/NNN_name.sql file, in order, each applied once
  const files = (await readdir(dir))
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = file.slice(0, 3);
    const rows = await db.query(
      "SELECT version FROM schema_migrations WHERE version=$1",
      [version],
    );
    if (rows.length) continue;
    await db.transaction(async (tx) => {
      await tx.exec(await readFile(path.join(dir, file), "utf8"));
      await tx.query("INSERT INTO schema_migrations(version) VALUES ($1)", [
        version,
      ]);
    });
  }
}
const globalDb = globalThis as unknown as { waslDb?: Promise<Database> };
export function database(): Promise<Database> {
  if (!globalDb.waslDb)
    globalDb.waslDb = (async () => {
      const db = await openDatabase();
      if (!process.env.DATABASE_URL) await migrate(db);
      return db;
    })().catch((error) => {
      globalDb.waslDb = undefined;
      throw error;
    });
  return globalDb.waslDb;
}
export async function asUser<T>(
  ownerId: string,
  fn: (tx: Queryable) => Promise<T>,
  db?: Database,
): Promise<T> {
  return (db ?? (await database())).transaction(async (tx) => {
    await tx.query("SELECT set_config('app.user_id',$1,true)", [ownerId]);
    await tx.exec("SET LOCAL ROLE wasl_member");
    return fn(tx);
  });
}
