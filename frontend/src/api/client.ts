import type { APIEnvelope } from "./types";
import { ApiError } from "./errors";
import { activateOffline, isOfflineActive, offlineRequest, shouldSkipLiveApi } from "./offline";

export { ApiError };

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8100";

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details: Record<string, string> };
}

async function fromOffline<T>(method: string, path: string, body?: unknown): Promise<T> {
  activateOffline();
  return offlineRequest<T>(method, path, body);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (isOfflineActive() || shouldSkipLiveApi(BASE_URL)) {
    return fromOffline<T>(method, path, body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Unreachable backend (offline, blocked loopback, CORS) -> bundled demo data
    return fromOffline<T>(method, path, body);
  }

  let payload: APIEnvelope<T> | ErrorBody | null = null;
  try {
    payload = (await response.json()) as APIEnvelope<T> | ErrorBody;
  } catch {
    if (response.status >= 500) return fromOffline<T>(method, path, body);
    throw new ApiError(`HTTP ${response.status}: invalid response`, "NETWORK_ERROR", response.status);
  }

  if (!response.ok || !payload.success) {
    const err = payload as ErrorBody;
    if (response.status >= 500) return fromOffline<T>(method, path, body);
    throw new ApiError(
      err.error?.message || `Request failed with ${response.status}`,
      err.error?.code || "UNKNOWN",
      response.status,
    );
  }
  return (payload as APIEnvelope<T>).data;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
};

export const PROJECT_ID = "3f2a9c1e-5b7d-4a3f-9c2e-1d4b6a8c0e12";
