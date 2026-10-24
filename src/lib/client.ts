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
export const today = () => new Date().toISOString().slice(0, 10);
export const shortDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "W";
