import path from "node:path";
import { migrate, openDatabase } from "../src/lib/db";
import { seedPresentation } from "./presentation-data";

// Explicit dataDir prevents a configured DATABASE_URL from being used.
const demoRoot = path.resolve(".wasl-demo");
const dataDir = path.resolve(
  process.env.WASL_PRESENTATION_DATA_DIR || ".wasl-demo/data",
);
if (!dataDir.startsWith(demoRoot + path.sep))
  throw new Error("Presentation data must stay inside .wasl-demo/.");
const db = await openDatabase({ dataDir });
try {
  await migrate(db);
  await seedPresentation(db);
  console.log(
    "Presentation workspace reset with fictional profiles and three contacts.",
  );
} finally {
  await db.close();
}
