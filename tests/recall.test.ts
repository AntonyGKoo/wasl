import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProfile, type Connection } from "../src/lib/types";
import { groundedMatches, lexicalRecall } from "../src/server/recall";
import { parseCardText } from "../src/server/scan";
const contact: Connection = {
  id: "known",
  owner_id: "owner",
  profile: { ...blankProfile, name: "Yousef Omar", title: "Backend engineer" },
  tags: ["Technology"],
  event: "Web Summit Qatar",
  place: "Doha",
  met_on: "2026-10-24",
  favorite: false,
  albums: [],
  origin: "",
  unseen: false,
  source_share_id: null,
  created_at: "",
  updated_at: "",
  version: 1,
  notes: [
    {
      id: "note",
      connection_id: "known",
      body: "Offered an introduction to his CTO",
      happened_on: "2026-10-24",
      created_at: "",
    },
  ],
};
test("recall searches remembered context and handles no matches", () => {
  assert.equal(
    lexicalRecall("Who was the software engineer I met at Web Summit?", [
      contact,
    ])[0]?.connection.id,
    "known",
  );
  assert.equal(lexicalRecall("marine biology Antarctica", [contact]).length, 0);
});
test("AI output cannot introduce unknown contacts or fabricated evidence", () => {
  const hits = groundedMatches(
    {
      matches: [
        { id: "unknown", evidence: "Web Summit Qatar" },
        { id: "known", evidence: "invented secret" },
        { id: "known", evidence: "Offered an introduction to his CTO" },
        { id: "known", evidence: "Backend engineer" },
      ],
    },
    [contact],
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].evidence[0], "Offered an introduction to his CTO");
});
test("pasted card text remains editable and missing data stays blank", () => {
  const fields = parseCardText("Sara Smith\nsara@example.test\n+974 5555 1234");
  assert.equal(fields.name, "Sara Smith");
  assert.equal(fields.email, "sara@example.test");
  assert.equal(fields.company, "");
  assert.equal(fields.linkedin, "");
});
test("card text finds the role and company, not just name, email and phone", () => {
  const fields = parseCardText(
    "Sara Smith\nProduct Manager\nFalcon Analytics\nsara@falcon.example\n+974 5555 1234",
  );
  assert.equal(fields.name, "Sara Smith");
  assert.equal(fields.title, "Product Manager");
  assert.equal(fields.company, "Falcon Analytics");
  assert.equal(fields.phone, "+974 5555 1234");
});
test("card text read from a photo keeps links valid and the name readable", () => {
  const fields = parseCardText(
    "NOOR AL MANSOURI\nSenior Product Designer\nnoor.almansouri @ sidrastudio. qa\nlinkedin.com/in/nooralmansouri\nwww.sidrastudio.qa\nDoha, Qatar",
  );
  assert.equal(fields.name, "Noor Al Mansouri");
  assert.equal(fields.title, "Senior Product Designer");
  assert.equal(fields.email, "noor.almansouri@sidrastudio.qa");
  assert.equal(fields.linkedin, "https://linkedin.com/in/nooralmansouri");
  assert.equal(fields.website, "https://www.sidrastudio.qa");
  assert.equal(fields.company, "Sidrastudio");
});
test("recall matches different forms of the same word", () => {
  assert.equal(
    lexicalRecall("who said they could introduce me to a CTO", [contact])[0]
      ?.connection.id,
    "known",
  );
  const hiring = {
    ...contact,
    notes: [{ ...contact.notes![0], body: "Her team is hiring interns" }],
  };
  assert.equal(
    lexicalRecall("someone who hires an intern", [hiring])[0]?.connection.id,
    "known",
  );
});
test("search finds people by the start of a word, a typed fragment, and ignores small talk", () => {
  // the beginning of a name or company is enough
  assert.equal(lexicalRecall("you", [contact]).length, 0);
  assert.equal(lexicalRecall("yous", [contact])[0]?.connection.id, "known");
  assert.equal(lexicalRecall("summ", [contact])[0]?.connection.id, "known");
  // a fragment that runs across words
  assert.equal(
    lexicalRecall("introduction to his", [contact])[0]?.connection.id,
    "known",
  );
  // words that say nothing about a person find no one
  assert.equal(lexicalRecall("how r u", [contact]).length, 0);
  assert.equal(lexicalRecall("who did I meet", [contact]).length, 0);
  // example questions built from saved details find the person
  assert.equal(
    lexicalRecall("Who did I meet at Web Summit Qatar?", [contact])[0]
      ?.connection.id,
    "known",
  );
  assert.equal(
    lexicalRecall("People I tagged Technology", [contact])[0]?.connection.id,
    "known",
  );
});
test("AI evidence that is not word for word falls back to the saved line it paraphrases", () => {
  const hits = groundedMatches(
    {
      matches: [{ id: "known", evidence: "offered an intro to the CTO" }],
    },
    [contact],
  );
  assert.equal(hits.length, 1);
  assert.equal(
    hits[0].evidence[0],
    "Note (2026-10-24): Offered an introduction to his CTO",
  );
});
