export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const form = data instanceof FormData;
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: data && !form ? { "content-type": "application/json" } : undefined,
    body: data ? (form ? data : JSON.stringify(data)) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error || "Unable to complete this request.",
      response.status,
    );
  return result as T;
}
// today's date where the person is (not in UTC), as YYYY-MM-DD
export const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
export const shortDate = (date: string) => {
  // a plain date is a local day, not midnight UTC
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date(date);
  return day.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
const store = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },
};
// Where you met carries over to the next person you save the same day, so a whole
// evening of new people needs the event typed once.
export function rememberMeeting(event: string, place: string) {
  if (!event && !place) return;
  store.set(
    "wasl.meeting",
    JSON.stringify({ event, place, day: today(), at: Date.now() }),
  );
}
export function lastMeeting(): { event: string; place: string } | null {
  try {
    const m = JSON.parse(store.get("wasl.meeting") || "null");
    if (m && m.day === today() && Date.now() - m.at < 14 * 3600 * 1000)
      return { event: String(m.event || ""), place: String(m.place || "") };
  } catch {}
  return null;
}
export const autoLocation = {
  get: () => store.get("wasl.autoLocation") === "on",
  set: (on: boolean) => store.set("wasl.autoLocation", on ? "on" : "off"),
};
// the phone's location as a place name, looked up by Wasl's server
export function locatePlace(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error("This browser can't share its location."));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await api<{ place: string }>(
            `place?lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`,
          );
          resolve(result.place);
        } catch (e) {
          reject(e);
        }
      },
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Location is blocked for this site. Allow it in your phone's settings, or type the place."
              : "Couldn't find your location. Type the place instead.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 },
    );
  });
}
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "W";
