import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asUser, migrate, openDatabase } from "../src/lib/db";
import { blankProfile, type User } from "../src/lib/types";
import {
  getConnection,
  importCard,
  publicCard,
  saveCard,
  saveNote,
  shareCard,
} from "../src/server/network";
test(
  "hosted PostgreSQL driver, vector extension and RLS match local behavior",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.endsWith("_ci"),
      "Use an isolated local CI database.",
    );
    const db = await openDatabase({ url: url.href });
    const owner: User = {
      id: randomUUID(),
      email: `${randomUUID()}@example.test`,
      name: "Owner",
      profile: { ...blankProfile, name: "Owner", email: "hidden@example.test" },
      created_at: "",
    };
    const receiver = {
      ...owner,
      id: randomUUID(),
      email: `${randomUUID()}@example.test`,
    };
    try {
      await migrate(db);
      for (const user of [owner, receiver])
        await db.query(
          "INSERT INTO users(id,email,name,password_hash,profile) VALUES($1,$2,$3,'unused',$4::jsonb)",
          [user.id, user.email, user.name, JSON.stringify(user.profile)],
        );
      const [stored] = await db.query<{ profile: User["profile"] }>(
        "SELECT profile FROM users WHERE id=$1",
        [owner.id],
      );
      assert.deepEqual(stored.profile, owner.profile);
      const card = await saveCard(
        owner,
        {
          label: "Work",
          kind: "professional",
          color: "ocean",
          fields: ["name"],
        },
        undefined,
        db,
      );
      const token = await shareCard(owner.id, card.id, db);
      assert.deepEqual(card.fields, ["name"]);
      assert.deepEqual((await publicCard(token, db)).profile, {
        name: "Owner",
      });
      const contact = await importCard(
        receiver.id,
        { token, event: "Career Fair", place: "Doha", met_on: "2026-10-24" },
        db,
      );
      assert.equal(contact.met_on, "2026-10-24");
      assert.deepEqual(contact.profile, { name: "Owner" });
      await saveNote(
        receiver.id,
        contact.id,
        { body: "A private interaction", happened_on: "2026-10-24" },
        db,
      );
      await assert.rejects(getConnection(owner.id, contact.id, db), {
        status: 404,
      });
      assert.equal(
        (
          await asUser(
            owner.id,
            (tx) => tx.query("SELECT * FROM connections"),
            db,
          )
        ).length,
        0,
      );
    } finally {
      await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [owner.id, receiver.id],
      ]);
      await db.close();
    }
  },
);
