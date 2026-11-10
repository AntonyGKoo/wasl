import type { Profile } from "./types";
const escape = (s: string) =>
  s
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
export function makeVcard(profile: Partial<Profile>) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escape(profile.name || "Wasl contact")}`,
  ];
  for (const [key, label] of [
    ["title", "TITLE"],
    ["company", "ORG"],
    ["phone", "TEL"],
    ["email", "EMAIL"],
    ["website", "URL"],
    ["bio", "NOTE"],
  ] as const) {
    if (profile[key]) lines.push(`${label}:${escape(profile[key]!)}`);
  }
  const photo = profile.photo?.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (photo)
    lines.push(`PHOTO;ENCODING=b;TYPE=${photo[1].toUpperCase()}:${photo[2]}`);
  return lines.concat("END:VCARD", "").join("\r\n");
}
