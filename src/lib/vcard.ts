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
  return lines.concat("END:VCARD", "").join("\r\n");
}
