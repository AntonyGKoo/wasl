import { consumeLimit } from "../lib/auth";
import { HttpError } from "./responses";

// Turns the phone's location into a place name ("Qatar National Convention Centre, Doha")
// with OpenStreetMap's public lookup. Only rounded coordinates are sent (about 10 m), only
// when the person taps "Use my location" or switched it on, and nothing is stored here.
// The same spot is asked about again and again during an event (every new person saved there),
// so answers are kept for half an hour per spot of about 100 m: faster for the person, and it
// follows OpenStreetMap's rules for its free service (keep answers, about one call a second).
const kept = new Map<string, { place: string; until: number }>();
const KEEP_MS = 30 * 60 * 1000;
const spot = (lat: number, lon: number) =>
  `${lat.toFixed(3)},${lon.toFixed(3)}`;
type Found = { name?: string; address?: Record<string, string> };
async function ask(url: URL): Promise<Found> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": `Wasl/1.0 (+${process.env.APP_URL || "https://wasl-sable.vercel.app"})`,
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
export async function placeName(userId: string, lat: number, lon: number) {
  const key = spot(lat, lon);
  const known = kept.get(key);
  if (known && known.until > Date.now()) return { place: known.place };
  if (!(await consumeLimit(`place:${userId}`, 30, 3600)))
    throw new HttpError(429, "Too many place lookups. Type the place instead.");
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lon.toFixed(4));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", "en");
  let data: Found;
  try {
    data = await ask(url);
  } catch {
    // the free service sometimes turns a call away when it is busy: wait a moment, try once more
    try {
      await new Promise((done) =>
        setTimeout(done, Number(process.env.WASL_PLACE_RETRY_MS ?? 900)),
      );
      data = await ask(url);
    } catch {
      throw new HttpError(
        502,
        "Couldn't look up the place right now. Type it instead.",
      );
    }
  }
  const a = data.address || {};
  const named =
    data.name ||
    a.amenity ||
    a.building ||
    a.university ||
    a.tourism ||
    a.leisure ||
    a.shop ||
    a.road ||
    "";
  const area =
    a.city || a.town || a.village || a.suburb || a.state || a.country || "";
  const place = [...new Set([named, area].filter(Boolean))]
    .join(", ")
    .slice(0, 200);
  if (!place)
    throw new HttpError(404, "No place name found here. Type it instead.");
  if (kept.size >= 500) kept.delete(kept.keys().next().value!);
  kept.set(key, { place, until: Date.now() + KEEP_MS });
  return { place };
}
