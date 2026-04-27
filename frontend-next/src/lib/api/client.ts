import { ZodSchema } from "zod";

const defaultBaseUrl = "http://localhost:8000";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || defaultBaseUrl;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  schema?: ZodSchema;
  body?: BodyInit | null;
};

async function parseResponse<T>(
  response: Response,
  schema?: ZodSchema,
): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload &&
        typeof payload === "object" &&
        ("detail" in payload || "message" in payload) &&
        String((payload as { detail?: string; message?: string }).detail ||
          (payload as { detail?: string; message?: string }).message)) ||
      "Khong the hoan thanh yeu cau toi backend.";

    throw new ApiError(message, response.status);
  }

  if (!schema) {
    return payload as T;
  }

  return schema.parse(payload) as T;
}

export async function apiRequest<T>(
  path: string,
  { schema, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const targetPath = path.startsWith("/") ? path : `/${path}`;
  
  // Get token from zustand store
  // Note: Since this is outside a component, we use the store's getState()
  const { token } = (await import("@/stores/auth-store")).useAuthStore.getState();

  const url = `${apiBaseUrl}${targetPath}`;
  console.log(`[API Request] ${init.method || "GET"} ${url}`);

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });

  return parseResponse<T>(response, schema);
}

export function apiGet<T>(path: string, schema?: ZodSchema) {
  return apiRequest<T>(path, {
    method: "GET",
    schema,
  });
}

export function apiPostForm<T>(
  path: string,
  formData: FormData,
  schema?: ZodSchema,
) {
  return apiRequest<T>(path, {
    method: "POST",
    body: formData,
    schema,
  });
}

export function apiPostJson<T>(
  path: string,
  payload: unknown,
  schema?: ZodSchema,
) {
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    schema,
  });
}

export function apiPutJson<T>(
  path: string,
  payload: unknown,
  schema?: ZodSchema,
) {
  return apiRequest<T>(path, {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    schema,
  });
}
