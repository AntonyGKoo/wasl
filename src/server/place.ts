import { consumeLimit } from "../lib/auth";
import { HttpError } from "./responses";

// Turns the phone's location into a place name ("Qatar National Convention Centre, Doha")
// with OpenStreetMap's public lookup. Only rounded coordinates are sent (about 10 m), only
// when the person taps "Use my location" or switched it on, and nothing is stored here.
export async function placeName(userId: string, lat: number, lon: number) {
  if (!(await consumeLimit(`place:${userId}`, 30, 3600)))
    throw new HttpError(429, "Too many place lookups. Type the place instead.");
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lon.toFixed(4));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", "en");
  let data: {
    name?: string;
    address?: Record<string, string>;
  };
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": `Wasl/1.0 (+${process.env.APP_URL || "https://wasl-sable.vercel.app"})`,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(String(response.status));
    data = await response.json();
  } catch {
    throw new HttpError(
      502,
      "Couldn't look up the place right now. Type it instead.",
    );
  }
  const a = data.address || {};
  const spot =
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
  const place = [...new Set([spot, area].filter(Boolean))].join(", ");
  if (!place)
    throw new HttpError(404, "No place name found here. Type it instead.");
  return { place: place.slice(0, 200) };
}
