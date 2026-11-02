import { z } from "zod";
import { profileFields } from "./types";
const text = (max = 200) => z.string().trim().max(max);
const url = z.union([
  z.literal(""),
  z
    .url()
    .refine(
      (v) => ["http:", "https:"].includes(new URL(v).protocol),
      "Use an https:// or http:// link",
    ),
]);
export const profileSchema = z.object({
  name: text(100),
  title: text(),
  company: text(),
  university: text(),
  email: z.union([z.literal(""), z.email().max(254)]),
  phone: text(50),
  linkedin: url,
  instagram: url,
  website: url,
  bio: text(1500),
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
  kind: z.enum(["professional", "social", "event"]),
  color: z.enum(["ocean", "violet", "coral", "ink"]),
  fields: z
    .array(z.enum(profileFields))
    .min(1)
    .max(10)
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
});
// the text of a recorded conversation, to be turned into key points
export const summarySchema = z.object({
  transcript: text(20000).min(10),
});
export const searchSchema = z.object({
  query: text(400).min(2),
  mode: z.enum(["keyword", "ai"]).default("keyword"),
});
