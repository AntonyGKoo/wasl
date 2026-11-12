import { test } from "node:test";
import assert from "node:assert/strict";
import { nameFromLink, tidyLink } from "../src/lib/links";
import { readContactCode } from "../src/lib/contact-code";
import { keepValidFields } from "../src/server/scan";
import { profileSchema } from "../src/lib/validation";
import { blankProfile } from "../src/lib/types";

test("links typed the way people say them become full links", () => {
  assert.equal(
    tidyLink("linkedin", "linkedin.com/in/antonygu"),
    "https://linkedin.com/in/antonygu",
  );
  assert.equal(
    tidyLink("linkedin", "in/antonygu"),
    "https://www.linkedin.com/in/antonygu",
  );
  assert.equal(
    tidyLink("linkedin", "antonygu"),
    "https://www.linkedin.com/in/antonygu",
  );
  assert.equal(
    tidyLink("instagram", "@antony.gu"),
    "https://instagram.com/antony.gu",
  );
  assert.equal(
    tidyLink("instagram", "instagram.com/antony"),
    "https://instagram.com/antony",
  );
  assert.equal(tidyLink("website", "antonygu.dev"), "https://antonygu.dev");
  // already complete, or empty: left alone
  assert.equal(
    tidyLink("website", "http://example.com/a"),
    "http://example.com/a",
  );
  assert.equal(tidyLink("linkedin", "  "), "");
});

test("a saved profile accepts natural links and a padded email, and rejects nonsense plainly", () => {
  const saved = profileSchema.parse({
    ...blankProfile,
    name: "Antony Gu",
    email: "  Antony@Example.com ",
    linkedin: "linkedin.com/in/antonygu",
    instagram: "@antony.gu",
    website: "antonygu.dev",
  });
  assert.equal(saved.email, "antony@example.com");
  assert.equal(saved.linkedin, "https://linkedin.com/in/antonygu");
  assert.equal(saved.instagram, "https://instagram.com/antony.gu");
  assert.equal(saved.website, "https://antonygu.dev");
  const bad = profileSchema.safeParse({
    ...blankProfile,
    name: "A",
    website: "not a link at all",
  });
  assert.equal(bad.success, false);
});

test("the QR code LinkedIn or Instagram shows for a profile starts a new person", () => {
  const origin = "https://wasl-sable.vercel.app";
  const linkedin = readContactCode(
    "https://www.linkedin.com/in/antony-gu-1a2b3c4d?utm_source=share&utm_medium=ios_app",
    origin,
  );
  assert.equal(linkedin.kind, "contact");
  if (linkedin.kind === "contact") {
    assert.equal(
      linkedin.profile.linkedin,
      "https://www.linkedin.com/in/antony-gu-1a2b3c4d",
    );
    assert.equal(linkedin.profile.name, "Antony Gu");
  }
  const instagram = readContactCode(
    "https://instagram.com/sara.nasser/",
    origin,
  );
  assert.equal(instagram.kind, "contact");
  if (instagram.kind === "contact")
    assert.equal(
      instagram.profile.instagram,
      "https://instagram.com/sara.nasser",
    );
  // any other website is still just a link
  assert.equal(
    readContactCode("https://example.com/menu", origin).kind,
    "link",
  );
  assert.equal(nameFromLink("https://example.com/in/someone"), "");
});

test("AI card reading keeps every detail it got right and blanks the ones it got wrong", () => {
  const kept = keepValidFields({
    name: "Noor Al-Mansouri",
    title: "Senior Product Designer",
    company: "Sidra Studio",
    university: "",
    email: "noor at sidra studio", // not an email
    phone: "+974 5566 7788",
    linkedin: "linkedin.com/in/noor", // no https://
    instagram: "@noor.designs",
    website: "www.sidrastudio.qa",
    bio: "",
  });
  assert.ok(kept);
  assert.equal(kept.name, "Noor Al-Mansouri");
  assert.equal(kept.email, "");
  assert.equal(kept.phone, "+974 5566 7788");
  assert.equal(kept.linkedin, "https://linkedin.com/in/noor");
  assert.equal(kept.instagram, "https://instagram.com/noor.designs");
  assert.equal(kept.website, "https://www.sidrastudio.qa");
  // nothing usable at all: fall back to the rules
  assert.equal(keepValidFields({ title: "Designer" }), null);
  assert.equal(keepValidFields("not an object"), null);
});
