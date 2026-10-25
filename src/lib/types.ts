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
export type Profile = Record<ProfileField, string>;
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
  kind: "professional" | "social" | "event";
  color: "ocean" | "violet" | "coral" | "ink";
  fields: ProfileField[];
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
