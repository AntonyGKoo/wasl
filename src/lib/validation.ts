import { z } from "zod";
import { cardFields, cardKinds } from "./types";
import { tidyLink, type LinkField } from "./links";
const text = (max = 200) => z.string().trim().max(max);
const validLink = (v: string) => {
  try {
    const parsed = new URL(v);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.hostname.includes(".") &&
      !/\s/.test(v)
    );
  } catch {
    return false;
  }
};
const url = z.union([
  z.literal(""),
  z
    .string()
    .max(300)
    .refine(validLink, "That link doesn't look right. Check it and try again."),
]);
// "linkedin.com/in/me", "@handle" and "mysite.dev" become full links before they are checked
const link = (field: LinkField) =>
  z.preprocess((v) => (typeof v === "string" ? tidyLink(field, v) : v), url);
export const profileSchema = z.object({
  name: text(100),
  title: text(),
  company: text(),
  university: text(),
  email: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.union([
      z.literal(""),
      z
        .email("That email doesn't look right. Check it and try again.")
        .max(254),
    ]),
  ),
  phone: text(50),
  linkedin: link("linkedin"),
  instagram: link("instagram"),
  website: link("website"),
  bio: text(1500),
  // resized on the phone to a small JPEG before upload
  photo: z
    .union([
      z.literal(""),
      z
        .string()
        .max(60000, "Please choose a smaller photo.")
        .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
    ])
    .optional(),
});
export const registrationSchema = z.object({
  name: text(100).min(1),
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
});
export const loginSchema = registrationSchema.omit({ name: true });
export const cardSchema = z.object({
  label: text(60).min(1),
  kind: z.enum(cardKinds),
  color: z.enum(["ocean", "violet", "coral", "ink"]),
  fields: z
    .array(z.enum(cardFields))
    .min(1)
    .max(11)
    .refine((v) => v.includes("name"), "Include your name"),
});
const date = z.iso.date();
export const connectionSchema = z.object({
  profile: profileSchema.refine(
    (p) => p.name.length > 0,
    "Please enter a contact name.",
  ),
  tags: z
    .array(text(40).min(1))
    .max(20)
    .transform((v) => [...new Set(v)]),
  event: text(),
  place: text(),
  met_on: date,
  favorite: z.boolean().default(false),
  // only used when the connection is first saved
  origin: z.enum(["", "scan"]).default(""),
});
export const noteSchema = z.object({
  body: text(5000).min(1),
  happened_on: date,
});
export const uuidSchema = z.uuid();
export const importSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  event: text().default(""),
  place: text().default(""),
  met_on: date,
  // the card to send back, for a two-way swap
  share_back_card_id: z.uuid().optional(),
});
export const favoriteSchema = z.object({ favorite: z.boolean() });
const albumName = text(60).min(1, "Give the album a name.");
export const albumSchema = z.object({
  name: albumName,
  // set when renaming an album
  previous_name: albumName.optional(),
  connection_ids: z.array(z.uuid()).max(1000),
});
export const placeSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});
export const passwordChangeSchema = z.object({
  current: z.string().min(1).max(128),
  next: z.string().min(10, "Use at least 10 characters.").max(128),
});
export const accountDeleteSchema = z.object({
  password: z.string().min(1).max(128),
});
// text read from a business card on the phone, or pasted
export const scanTextSchema = z.object({
  text: text(16000).min(4),
});
// the text of a recorded conversation, to be turned into key points
export const summarySchema = z.object({
  transcript: text(20000).min(10),
});
export const searchSchema = z.object({
  query: text(400).min(2),
  mode: z.enum(["keyword", "ai"]).default("keyword"),
});
