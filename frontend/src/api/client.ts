const TOKEN_KEY = "hackaton.token";

/**
 * Base URL for API calls.
 * - **Dev**: empty string → Vite proxy in `vite.config.ts` redirects `/api/*` to localhost:8000.
 * - **Production**: set `VITE_API_URL` to the public backend URL (e.g.
 *   `https://wakuaipa-backend.up.railway.app`). Then `apiFetch("/api/health")`
 *   becomes `https://wakuaipa-backend.up.railway.app/api/health`.
 */
const API_BASE_URL: string =
  (typeof import.meta !== "undefined" && (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_URL) || "";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

type RequestInitJson = Omit<RequestInit, "body"> & { body?: unknown };

export async function apiFetch<T = unknown>(path: string, init: RequestInitJson = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    if (init.body instanceof FormData || init.body instanceof URLSearchParams) {
      body = init.body;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }
  }

  // Prepend the API base URL (empty string in dev → uses Vite proxy)
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, { ...init, headers, body });
  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const detailMsg =
      (data && typeof data === "object" && "detail" in data && typeof (data as { detail: unknown }).detail === "string"
        ? ((data as { detail: string }).detail)
        : null) ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, data, detailMsg);
  }

  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
