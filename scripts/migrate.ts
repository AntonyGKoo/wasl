import { openDatabase, migrate } from "../src/lib/db";
const db = await openDatabase();
try { await migrate(db); console.log("Wasl database migrations applied."); }
finally { await db.close(); }
