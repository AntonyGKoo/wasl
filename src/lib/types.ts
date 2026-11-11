export const profileFields = [
  "name",
  "title",
  "company",
  "university",
  "email",
  "phone",
  "linkedin",
  "instagram",
  "website",
  "bio",
] as const;
export type ProfileField = (typeof profileFields)[number];
// a small profile photo (data URL, about 10 KB) travels with the profile but is not a text field:
// it is never searched, sent to AI or read from a card
export type Profile = Record<ProfileField, string> & { photo?: string };
// what a card can share: the text fields plus the photo
export const cardFields = [...profileFields, "photo"] as const;
export type CardField = (typeof cardFields)[number];
export const blankProfile: Profile = Object.fromEntries(
  profileFields.map((f) => [f, ""]),
) as Profile;
export const fieldLabels: Record<ProfileField, string> = {
  name: "Full name",
  title: "Role / job title",
  company: "Company",
  university: "University",
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  website: "Website",
  bio: "A little about you",
};
export const cardFieldLabels: Record<CardField, string> = {
  ...fieldLabels,
  photo: "Profile photo",
};
export const cardKinds = ["professional", "event", "social", "team"] as const;
export const kindLabels: Record<Card["kind"], string> = {
  professional: "Professional",
  event: "Event",
  social: "Social",
  team: "Team",
};
// one tap tags offered when saving someone (your own tags are offered too)
export const suggestedTags = [
  "Hiring",
  "Intro offered",
  "Follow up",
  "Mentor",
  "Investor",
  "Co-founder",
];
export type User = {
  id: string;
  name: string;
  email: string;
  profile: Profile;
  created_at: string;
};
export type Card = {
  id: string;
  owner_id: string;
  label: string;
  kind: (typeof cardKinds)[number];
  color: "ocean" | "violet" | "coral" | "ink";
  fields: CardField[];
  created_at: string;
  token?: string | null;
  profile?: Partial<Profile>;
};
export type Connection = {
  id: string;
  owner_id: string;
  profile: Partial<Profile>;
  tags: string[];
  event: string;
  place: string;
  met_on: string;
  favorite: boolean;
  albums: string[];
  origin: "" | "scan" | "link" | "swap" | "sample";
  unseen: boolean;
  source_share_id: string | null;
  created_at: string;
  updated_at: string;
  notes?: Interaction[];
  note_count?: number;
  version: number;
};
export type Interaction = {
  id: string;
  connection_id: string;
  body: string;
  happened_on: string;
  created_at: string;
};
export type SearchHit = {
  connection: Connection;
  score: number;
  evidence: string[];
  reason: string;
};
export type PublicCard = {
  id: string;
  label: string;
  kind: string;
  color: Card["color"];
  profile: Partial<Profile>;
  token: string;
};
export type Capabilities = {
  presentation?: boolean;
  ai: boolean;
  ocr: boolean;
  database: "postgres" | "local";
};
