import path from "node:path";
import { migrate, openDatabase } from "../src/lib/db";
import { seedPresentation } from "./presentation-data";

// Explicit dataDir prevents a configured DATABASE_URL from being used.
const db = await openDatabase({ dataDir: path.resolve(".wasl-demo/data") });
try {
  await migrate(db);
  await seedPresentation(db);
  console.log(
    "Presentation workspace reset with fictional profiles and three contacts.",
  );
} finally {
  await db.close();
}
