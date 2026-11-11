import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asUser, migrate, openDatabase } from "../src/lib/db";
import { blankProfile, type Connection, type User } from "../src/lib/types";
import {
  addSamplePeople,
  deleteAlbum,
  getConnection,
  importCard,
  publicCard,
  removeSamplePeople,
  saveAlbum,
  saveCard,
  saveNote,
  setFavorite,
  shareCard,
  swapBack,
} from "../src/server/network";
import { recall } from "../src/server/recall";
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
      // the receiver sends a card back: it lands in the owner's network, marked New
      const back = await saveCard(
        receiver,
        { label: "Club", kind: "team", color: "violet", fields: ["name"] },
        undefined,
        db,
      );
      const swap = {
        token,
        event: "Career Fair",
        place: "Doha",
        met_on: "2026-10-24",
        share_back_card_id: back.id,
      };
      assert.ok(await swapBack(receiver.id, swap, db));
      assert.ok(await swapBack(receiver.id, swap, db));
      const ownerNetwork = await asUser(
        owner.id,
        (tx) => tx.query<Connection>("SELECT * FROM connections"),
        db,
      );
      assert.equal(ownerNetwork.length, 1);
      assert.equal(ownerNetwork[0].origin, "swap");
      assert.equal(ownerNetwork[0].unseen, true);
      assert.equal(ownerNetwork[0].event, "Career Fair");
      const id = ownerNetwork[0].id;
      assert.equal((await setFavorite(owner.id, id, true, db)).favorite, true);
      // album membership is set with a uuid[] parameter through the hosted driver
      await saveAlbum(
        owner.id,
        { name: "Fair friends", connection_ids: [id] },
        db,
      );
      await saveAlbum(
        owner.id,
        { name: "Fair", previous_name: "Fair friends", connection_ids: [id] },
        db,
      );
      assert.deepEqual((await getConnection(owner.id, id, db)).albums, [
        "Fair",
      ]);
      await saveAlbum(owner.id, { name: "Fair", connection_ids: [] }, db);
      assert.deepEqual((await getConnection(owner.id, id, db)).albums, []);
      await deleteAlbum(owner.id, "Fair", db);
      // sample people go in and out together through the hosted driver, and search finds them
      assert.equal(await addSamplePeople(receiver.id, db), 5);
      assert.equal(await addSamplePeople(receiver.id, db), 0);
      const found = await recall(
        receiver.id,
        "who offered to review my CV",
        "keyword",
        db,
      );
      assert.deepEqual(
        found.hits.map((h) => h.connection.profile.name),
        ["Sara Nasser"],
      );
      assert.equal(await removeSamplePeople(receiver.id, db), 5);
    } finally {
      await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [owner.id, receiver.id],
      ]);
      await db.close();
    }
  },
);
