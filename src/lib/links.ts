// People type links the way they say them: "linkedin.com/in/me", "@handle", "mysite.dev".
// This turns each into the full link, so nobody has to type "https://".
export type LinkField = "linkedin" | "instagram" | "website";
export const linkFields: LinkField[] = ["linkedin", "instagram", "website"];

export function tidyLink(field: LinkField, typed: string): string {
  let v = typed.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  v = v.replace(/^\/+/, "");
  if (field === "instagram") {
    // "@antony.gu" or "antony.gu" is a handle; "instagram.com/antony" is already a link
    if (!/instagram\.com/i.test(v) && !v.includes("/"))
      return `https://instagram.com/${v.replace(/^@/, "")}`;
  }
  if (field === "linkedin") {
    if (/^(in|company|school)\//i.test(v))
      return `https://www.linkedin.com/${v}`;
    // a bare handle such as "antonygu"
    if (!v.includes("/") && !v.includes("."))
      return `https://www.linkedin.com/in/${v.replace(/^@/, "")}`;
  }
  return `https://${v}`;
}

// "antony-gu-1a2b3c" from a LinkedIn link → "Antony Gu", as a first guess the person can fix
export function nameFromLink(link: string): string {
  try {
    const url = new URL(link);
    const slug = /linkedin\.com$/i.test(url.hostname.replace(/^www\./, ""))
      ? url.pathname.match(/^\/in\/([^/]+)/)?.[1]
      : /instagram\.com$/i.test(url.hostname.replace(/^www\./, ""))
        ? url.pathname.match(/^\/([^/]+)/)?.[1]
        : "";
    if (!slug) return "";
    return decodeURIComponent(slug)
      .split(/[-_.]+/)
      .filter((part) => /^\p{L}+$/u.test(part))
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ")
      .slice(0, 100);
  } catch {
    return "";
  }
}
