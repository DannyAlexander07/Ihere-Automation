const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").replace(/\/$/, "");

type ErrorPayload = { message?: string | string[]; error?: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const response = await apiRequestRaw(path, init, accessToken);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiRequestRaw(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/${path.replace(/^\//, "")}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("No pudimos conectar con I HERE. Verifica que la API esté encendida.", 0);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(" ")
      : payload?.message ?? payload?.error ?? "La solicitud no pudo completarse.";
    throw new ApiError(message, response.status);
  }
  return response;
}
