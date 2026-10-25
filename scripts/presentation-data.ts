import { registerAccount } from "../src/lib/auth";
import type { Database } from "../src/lib/db";
import { blankProfile, type Profile, type User } from "../src/lib/types";
import {
  presentationAccount,
  presentationCardToken,
} from "../src/lib/presentation";
import {
  saveCard,
  saveConnection,
  saveNote,
  shareCard,
} from "../src/server/network";

const guestEmail = "mariam@wasl.example.test";
export async function seedPresentation(db: Database) {
  // Only the two named fictional accounts are reset, even inside this isolated DB.
  await db.query("DELETE FROM users WHERE email=ANY($1::text[])", [
    [presentationAccount.email, guestEmail],
  ]);
  await db.query("DELETE FROM usage_buckets WHERE bucket LIKE 'auth:%'");
  async function account(email: string, profile: Profile) {
    const id = await registerAccount(
      {
        email,
        name: profile.name,
        password: presentationAccount.password,
      },
      db,
    );
    const [user] = await db.query<User>(
      "UPDATE users SET profile=$1::jsonb WHERE id=$2 RETURNING id,name,email,profile,created_at",
      [JSON.stringify(profile), id],
    );
    return user;
  }
  const owner = await account(presentationAccount.email, {
    ...blankProfile,
    name: "Antony Gu",
    title: "Computer science student",
    university: "Carnegie Mellon University in Qatar",
    email: "antony@wasl.example.test",
    bio: "Interested in software systems, startups and meeting people at university events.",
  });
  await saveCard(
    owner,
    {
      label: "Professional",
      kind: "professional",
      color: "ocean",
      fields: ["name", "title", "university", "email"],
    },
    undefined,
    db,
  );
  await saveCard(
    owner,
    {
      label: "Event",
      kind: "event",
      color: "violet",
      fields: ["name", "title", "university"],
    },
    undefined,
    db,
  );
  const guest = await account(guestEmail, {
    ...blankProfile,
    name: "Mariam Ali",
    title: "Software engineer",
    company: "Pearl Labs",
    email: guestEmail,
  });
  const card = await saveCard(
    guest,
    {
      label: "Mariam's professional card",
      kind: "professional",
      color: "coral",
      fields: ["name", "title", "company", "email"],
    },
    undefined,
    db,
  );
  await shareCard(guest.id, card.id, db);
  // A stable, deliberately public token keeps the fictional example bookmark usable.
  await db.query("UPDATE shares SET token=$1 WHERE card_id=$2", [
    presentationCardToken,
    card.id,
  ]);
  const examples = [
    {
      name: "Sara Ahmed",
      title: "Software engineer",
      company: "Pearl Labs",
      tags: ["Technology"],
      event: "Campus networking night",
      note: "We talked about payment systems and internship applications.",
    },
    {
      name: "Omar Hassan",
      title: "Product designer",
      company: "Studio Nine",
      tags: ["Design", "Startups"],
      event: "Campus startup fair",
      note: "Suggested a shorter onboarding flow. Interested in testing Wasl.",
    },
    {
      name: "Leila Mansour",
      title: "Student ambassador",
      company: "CMU-Q",
      tags: ["Campus"],
      event: "Student networking evening",
      note: "Can introduce our team to the entrepreneurship club for a student pilot.",
    },
  ];
  for (const example of examples) {
    const contact = await saveConnection(
      owner.id,
      {
        profile: {
          ...blankProfile,
          name: example.name,
          title: example.title,
          company: example.company,
        },
        tags: example.tags,
        event: example.event,
        place: "Doha",
        met_on: "2026-10-20",
        favorite: false,
      },
      undefined,
      db,
    );
    await saveNote(
      owner.id,
      contact.id,
      { body: example.note, happened_on: "2026-10-20" },
      db,
    );
  }
  return { owner, guest, token: presentationCardToken };
}
