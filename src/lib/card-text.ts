import { blankProfile, type Profile } from "./types";

// A line the text reader found, with its box: the name is usually the biggest text on a card.
export type OcrLine = { text: string; bbox?: { y0: number; y1: number } };

const ROLE =
  /\b(engineer|developer|designer|manager|director|founder|co-founder|ceo|cto|cfo|coo|cmo|chief|officer|student|intern|analyst|consultant|scientist|professor|lecturer|partner|lead|head|president|specialist|coordinator|associate|researcher|architect|marketing|sales|product|recruiter|advisor|owner|freelance|photographer|writer|artist|teacher|doctor|nurse|lawyer|accountant|chef|trainer|coach|editor|producer|journalist|executive|assistant|technician)\b/i;
const ORG =
  /\b(inc|llc|ltd|labs?|university|college|school|group|company|co\.|corp|corporation|studio|capital|ventures|technologies|technology|tech|solutions|systems|bank|foundation|institute|analytics|robotics|consulting|agency|partners|holdings|media|qatar|global|international|hub|fintech|center|centre|association|council|ministry|authority|airways|hospital|clinic|hotel|academy|network)\b/i;
const PLACE =
  /^(?:[A-Za-z .'-]+,\s*)?(doha|qatar|dubai|abu dhabi|riyadh|jeddah|kuwait|bahrain|muscat|oman|uae|saudi arabia|lusail|al wakrah|west bay|education city|london|new york|usa|uk)\.?$|\b(street|st\.|road|rd\.|avenue|ave\.|building|bldg|floor|tower|p\.?o\.? ?box|zone)\b/i;
const MAIL_HOSTS = /^(gmail|hotmail|outlook|yahoo|icloud|mail|example|test)$/;

// Turns the text on a business card (typed, pasted or read from a photo) into contact details.
// The person always reviews the result before it is saved.
export function parseCardText(text: string, ocrLines: OcrLine[] = []): Profile {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const heights = new Map(
    ocrLines.map((l) => [key(l.text), l.bbox ? l.bbox.y1 - l.bbox.y0 : 0]),
  );
  const lines = text
    .split(/[\n\r]+/)
    .map((l) =>
      l
        .replace(/[|_~`“”‘’«»]+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.replace(/[^A-Za-z0-9]/g, "").length >= 2);
  // the reader sometimes breaks a phone number over two lines ("+974 3" / "300 1122")
  for (let i = 0; i < lines.length - 1; i++) {
    const tail = lines[i + 1].match(/^\d[\d\s-]{3,}/);
    if (
      /\+?\d[\d\s-]*$/.test(lines[i]) &&
      tail &&
      !lines[i + 1].includes("@")
    ) {
      lines[i] += tail[0];
      lines[i + 1] = lines[i + 1].slice(tail[0].length).trim();
    }
  }
  const f: Record<string, string> = {};
  const used = new Set<number>();
  const take = (re: RegExp, field: string, clean = (x: string) => x) => {
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      // close up spaces the reader adds inside emails ("name @ site. com")
      let line = lines[i].includes("@")
        ? lines[i].replace(/\s*([@.])\s*/g, "$1")
        : lines[i];
      if (field === "web") line = line.replace(/\S+@\S+/g, " ");
      const m = line.match(re);
      if (m) {
        f[field] = clean(m[0]);
        used.add(i);
        return;
      }
    }
  };
  take(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "email", (x) =>
    x.toLowerCase(),
  );
  take(/l?inkedin\.com\/in\/[A-Za-z0-9_-]+/i, "linkedin", (x) =>
    x.toLowerCase().replace(/^inkedin/, "linkedin"),
  );
  take(/\+?\(?\d[\d\s().-]{6,}\d/, "phone", (x) => x.replace(/\s+/g, " "));
  take(
    /\b((https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|co|qa|edu|ai|app|dev|me)(\/\S*)?)\b/i,
    "web",
    (x) => x.toLowerCase(),
  );
  // what's left after contact details and addresses: name, role, company
  const rest = lines
    .map((l, i) => ({
      l: l.replace(
        /^(tel|phone|mobile|mob|email|e-mail|web|www)\s*[:.]?\s*/i,
        "",
      ),
      i,
      h: 0,
      taken: false,
    }))
    .filter(
      ({ l, i }) =>
        !used.has(i) && !/@|\d{4,}|https?:|www\./i.test(l) && !PLACE.test(l),
    );
  for (const r of rest) r.h = heights.get(key(lines[r.i])) || 0;
  const isName = (l: string) =>
    /^[A-Za-z][A-Za-z.'-]+(\s[A-Za-z][A-Za-z.'-]+){1,3}$/.test(l) &&
    !ROLE.test(l) &&
    !ORG.test(l) &&
    !/\b([A-Za-z])\1\b/.test(l);
  // "sara.smith@…" or "linkedin.com/in/sarasmith" says how the name is spelled
  const handle = (
    (f.email || "").split("@")[0] +
    ((f.linkedin || "").match(/\/in\/([a-z0-9-]+)/i)?.[1] || "")
  )
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const fitsHandle = (l: string) => {
    const parts = l
      .toLowerCase()
      .split(/[\s.'-]+/)
      .filter((w) => w.length > 1);
    return parts.length
      ? parts.filter((w) => handle.includes(w)).length / parts.length
      : 0;
  };
  const pick = (test: (l: string) => boolean) => {
    const r = rest.find((x) => !x.taken && test(x.l));
    if (r) r.taken = true;
    return r ? r.l : "";
  };
  const names = rest
    .filter((r) => isName(r.l))
    .sort((a, b) => fitsHandle(b.l) - fitsHandle(a.l) || b.h - a.h);
  if (names[0]) {
    names[0].taken = true;
    f.name = names[0].l;
  }
  f.title = pick((l) => ROLE.test(l));
  // a company often appears twice (logo in capitals, then the full name): keep the fuller one
  const orgs = rest
    .filter((r) => !r.taken && ORG.test(r.l))
    .sort(
      (a, b) =>
        Number(a.l === a.l.toUpperCase()) - Number(b.l === b.l.toUpperCase()) ||
        b.l.length - a.l.length,
    );
  if (orgs[0]) {
    orgs[0].taken = true;
    f.company = orgs[0].l;
  }
  if (!f.company) {
    const domain =
      (f.email || "").split("@")[1] ||
      (f.web || "").replace(/^(https?:\/\/)?(www\.)?/, "");
    const base = domain.split(".")[0] || "";
    if (base && !MAIL_HOSTS.test(base))
      f.company = base.charAt(0).toUpperCase() + base.slice(1);
  }
  // no line fits the email: spell the name from it ("sara.smith" → "Sara Smith")
  const local = (f.email || "").split("@")[0].split(/[._-]+/);
  if (
    local.length >= 2 &&
    local.length <= 3 &&
    local.every((w) => /^[a-z]{2,}$/i.test(w)) &&
    (!f.name || fitsHandle(f.name) === 0)
  )
    f.name = local
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  if (!f.name) f.name = pick(() => true);
  if (f.name && f.name === f.name.toUpperCase())
    f.name = f.name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const website = f.web && !/linkedin\.com/.test(f.web) ? f.web : "";
  return {
    ...blankProfile,
    name: (f.name || "").slice(0, 100),
    title: (f.title || "").slice(0, 120),
    company: (f.company || "").slice(0, 120),
    email: f.email || "",
    phone: f.phone || "",
    linkedin: f.linkedin ? `https://${f.linkedin}` : "",
    website:
      website && !/^https?:\/\//.test(website) ? `https://${website}` : website,
  };
}
