import { openDatabase, migrate } from "../src/lib/db";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const db = await openDatabase();
try {
  await migrate(db);
  console.log("Wasl database migrations applied.");
} finally {
  await db.close();
}
