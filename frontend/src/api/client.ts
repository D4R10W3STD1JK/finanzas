import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Se dispara cuando la sesión caduca, para volver a la pantalla de login. */
export const UNAUTHORIZED_EVENT = "finanzas:unauthorized";

const authMiddleware: Middleware = {
  onResponse({ response, request }) {
    if (response.status === 401 && !request.url.endsWith("/api/auth/login")) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return response;
  },
};

export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });
api.use(authMiddleware);

function messageOf(error: unknown, status: number): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  if (status >= 500) return "Error del servidor. Inténtalo de nuevo en unos segundos.";
  return "No se ha podido completar la operación";
}

/** Devuelve los datos o lanza ApiError con el mensaje del backend (en español). */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result;
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor");
  }
  const { data, error, response } = result;
  if (!response.ok) throw new ApiError(response.status, messageOf(error, response.status));
  return data as T;
}

/** Subida de adjuntos (multipart), fuera de openapi-fetch por simplicidad. */
export async function uploadAttachment(transactionId: number, file: File) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`/api/transactions/${transactionId}/attachments`, {
    method: "POST",
    body,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, messageOf(error, response.status));
  }
  return response.json();
}

export const attachmentUrl = (id: number, download = false) =>
  `/api/attachments/${id}${download ? "?download=true" : ""}`;
