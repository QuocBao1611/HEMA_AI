import { ZodSchema } from "zod";

// QUAN TRỌNG: Dùng relative URL /api/v1 để Next.js rewrites proxy sang backend
// Khi deploy lên Render, browser sẽ gọi /api/v1/* trên cùng domain frontend
// Next.js server sẽ rewrite các request này sang backend URL thật
const defaultBaseUrl = "/api/v1";

let base = "";
if (typeof window === "undefined") {
  // Server-side: dùng INTERNAL_API_URL để gọi trực tiếp backend
  base = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || defaultBaseUrl;
} else {
  // Client-side: dùng NEXT_PUBLIC_API_URL (nên là relative /api/v1)
  base = process.env.NEXT_PUBLIC_API_URL || defaultBaseUrl;
}

base = base.replace(/\/+$/, "");
// Đảm bảo base kết thúc bằng /api/v1
if (!base.endsWith("/api/v1")) {
  // Nếu base là URL đầy đủ (https://...), thêm /api/v1 vào cuối
  if (base.startsWith("http")) {
    base = `${base}/api/v1`;
  }
  // Nếu là relative path, giữ nguyên
}
export const apiBaseUrl = base;

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

/**
 * Kiểm tra xem lỗi có phải do backend Render Free Tier đang "ngủ" không
 * (ECONNRESET, socket hang up, hoặc fetch timeout)
 */
function _isConnectionResetError(error: unknown): boolean {
  if (error instanceof TypeError && error.message?.includes("fetch")) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message?.toLowerCase() || "";
    return (
      msg.includes("econnreset") ||
      msg.includes("socket hang up") ||
      msg.includes("network error") ||
      msg.includes("failed to fetch") ||
      msg.includes("fetch failed") ||
      msg.includes("abort") ||
      msg.includes("timeout")
    );
  }
  return false;
}

/**
 * Đánh thức backend Render Free Tier trước khi gọi API thật.
 * Render Free Tier sẽ spin down sau 15 phút không hoạt động.
 * Request đầu tiên sau giấc ngủ thường mất 30-60 giây để wake up.
 */
let _isWakingUp = false;
let _lastWakeUpTime = 0;
const WAKEUP_COOLDOWN_MS = 60_000; // Chỉ wake up 1 lần mỗi phút

async function _wakeUpBackend(): Promise<boolean> {
  const now = Date.now();
  if (_isWakingUp || (now - _lastWakeUpTime < WAKEUP_COOLDOWN_MS)) {
    return true; // Đã wake up gần đây hoặc đang wake up
  }

  _isWakingUp = true;
  try {
    console.log("[WakeUp] Đánh thức backend Render Free Tier...");
    // Gọi /health với timeout 60 giây (đủ cho Render wake up)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    const wakeUrl = base.replace(/\/api\/v1\/?$/, "/health");
    const response = await fetch(wakeUrl, {
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    _lastWakeUpTime = Date.now();
    console.log(`[WakeUp] Backend đã thức dậy: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.warn("[WakeUp] Lỗi khi đánh thức backend:", error);
    // Vẫn đánh dấu là đã wake up để tránh gọi liên tục
    _lastWakeUpTime = Date.now();
    return false;
  } finally {
    _isWakingUp = false;
  }
}

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

  // ── Retry logic cho Render Free Tier ──────────────────────────────
  // Render Free Tier spin down sau 15 phút, request đầu tiên có thể bị
  // ECONNRESET / socket hang up. Chúng ta sẽ retry tối đa 3 lần.
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Ở lần retry đầu tiên (sau lần fail), đánh thức backend trước
      if (attempt > 1) {
        console.log(`[Retry ${attempt}/${MAX_RETRIES}] Đánh thức backend trước khi retry...`);
        await _wakeUpBackend();
        // Đợi thêm 2 giây để backend kịp khởi động
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Tăng timeout cho mỗi lần retry
      const controller = new AbortController();
      const timeoutMs = attempt === 1 ? 30_000 : 60_000; // 30s lần đầu, 60s các lần retry
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      if (response.status === 401 && typeof window !== "undefined") {
        // Clear auth state and redirect to login if not already there
        const authStore = (await import("@/stores/auth-store")).useAuthStore;
        authStore.getState().logout();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }

      return parseResponse<T>(response, schema);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Chỉ retry nếu là lỗi kết nối (ECONNRESET, timeout, etc.)
      if (!_isConnectionResetError(error)) {
        // Lỗi không phải do kết nối (VD: 4xx, 5xx) - không retry
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000; // 3s, 6s
        console.warn(
          `[Retry ${attempt}/${MAX_RETRIES}] Lỗi kết nối: ${lastError.message}. ` +
          `Thử lại sau ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Nếu đã retry hết mà vẫn lỗi
  throw lastError || new Error("Không thể kết nối đến backend sau nhiều lần thử.");
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
