import { blankProfile, type Profile } from "./types";
import { nameFromLink } from "./links";

// What a QR code can be when someone points Wasl at it.
export type ContactCode =
  | { kind: "wasl"; path: string }
  | { kind: "contact"; profile: Profile }
  | { kind: "link"; host: string }
  | { kind: "other" };

const WASL_HOSTS = ["wasl-sable.vercel.app"];

// a Wasl card link from this site (or the live site), as a path on this site
export function waslPath(text: string, origin: string): string | null {
  try {
    const url = new URL(text.trim());
    const ours =
      url.origin === origin || WASL_HOSTS.includes(url.hostname.toLowerCase());
    const match = url.pathname.match(/^\/c\/([A-Za-z0-9_-]{43})\/?$/);
    return ours && match ? `/c/${match[1]}` : null;
  } catch {
    return null;
  }
}

const unescape = (s: string) =>
  s
    .replace(/\\n/gi, "\n")
    .replace(/\\([,;:\\])/g, "$1")
    .trim();

function fromLinks(profile: Profile, link: string) {
  const url = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  if (/linkedin\.com/i.test(url)) profile.linkedin ||= url;
  else if (/instagram\.com/i.test(url)) profile.instagram ||= url;
  else profile.website ||= url;
}

// MECARD fields end with ";" unless it is escaped as "\;". Written as a loop because the
// one-line pattern for this ("look-behind") stops the whole app loading on iPhones before iOS 16.4.
function splitFields(text: string) {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) current += text[i] + text[++i];
    else if (text[i] === ";") {
      parts.push(current);
      current = "";
    } else current += text[i];
  }
  parts.push(current);
  return parts;
}
// vCard (BEGIN:VCARD) and MECARD codes printed on many paper business cards
export function parseContactText(text: string): Profile | null {
  const profile: Profile = { ...blankProfile };
  const raw = text.trim();
  if (/^BEGIN:VCARD/i.test(raw)) {
    // unfold continued lines first
    const lines = raw.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    let family = "";
    let given = "";
    for (const line of lines) {
      const at = line.indexOf(":");
      if (at < 0) continue;
      const key = line
        .slice(0, at)
        .split(";")[0]
        .split(".")
        .pop()!
        .toUpperCase();
      const value = unescape(line.slice(at + 1));
      if (!value) continue;
      if (key === "FN") profile.name ||= value;
      else if (key === "N") {
        [family = "", given = ""] = value.split(";");
      } else if (key === "TITLE") profile.title ||= value;
      else if (key === "ORG") profile.company ||= value.split(";")[0].trim();
      else if (key === "EMAIL") profile.email ||= value.toLowerCase();
      else if (key === "TEL") profile.phone ||= value;
      else if (key === "URL") fromLinks(profile, value);
      else if (key === "NOTE") profile.bio ||= value.slice(0, 1500);
    }
    profile.name ||= [given, family].filter(Boolean).join(" ").trim();
  } else if (/^MECARD:/i.test(raw)) {
    for (const part of splitFields(raw.slice(7))) {
      const at = part.indexOf(":");
      if (at < 0) continue;
      const key = part.slice(0, at).toUpperCase();
      const value = unescape(part.slice(at + 1));
      if (!value) continue;
      if (key === "N") {
        const [family, given = ""] = value.split(",");
        profile.name ||= [given.trim(), family.trim()]
          .filter(Boolean)
          .join(" ");
      } else if (key === "ORG") profile.company ||= value;
      else if (key === "TITLE") profile.title ||= value;
      else if (key === "EMAIL") profile.email ||= value.toLowerCase();
      else if (key === "TEL") profile.phone ||= value;
      else if (key === "URL") fromLinks(profile, value);
      else if (key === "NOTE") profile.bio ||= value.slice(0, 1500);
    }
  } else return null;
  return profile.name || profile.email || profile.phone ? profile : null;
}

export function readContactCode(text: string, origin: string): ContactCode {
  const path = waslPath(text, origin);
  if (path) return { kind: "wasl", path };
  const profile = parseContactText(text);
  if (profile) return { kind: "contact", profile };
  try {
    const url = new URL(text.trim());
    if (url.protocol === "http:" || url.protocol === "https:") {
      // The QR code LinkedIn and Instagram show for a profile: start a new person with the
      // link filled in and a first guess at the name, for the person to check.
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const link = `https://${url.hostname}${url.pathname.replace(/\/$/, "")}`;
      if (host === "linkedin.com" && /^\/in\/[^/]+/.test(url.pathname))
        return {
          kind: "contact",
          profile: {
            ...blankProfile,
            linkedin: link,
            name: nameFromLink(link),
          },
        };
      if (
        host === "instagram.com" &&
        /^\/[A-Za-z0-9_.]+\/?$/.test(url.pathname)
      )
        return {
          kind: "contact",
          profile: {
            ...blankProfile,
            instagram: link,
            name: nameFromLink(link),
          },
        };
      return { kind: "link", host: url.hostname };
    }
  } catch {}
  return { kind: "other" };
}
