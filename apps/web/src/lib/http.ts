import { apiErrorSchema } from "@kitty/shared";
import axios, { type AxiosInstance, isAxiosError } from "axios";

/**
 * Error thrown for API responses that match the shared error shape
 * `{ error: { code, message, details? } }`.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * The single axios instance for the web app (CODE_RULES.md §A).
 *
 * `baseURL` is `/api`, so the browser talks same-origin and the Next rewrite
 * proxy forwards to `apps/api` — auth cookies stay first-party.
 */
export const http: AxiosInstance = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error)) {
      const parsed = apiErrorSchema.safeParse(error.response?.data);
      if (parsed.success) {
        throw new ApiRequestError(
          parsed.data.error.code,
          parsed.data.error.message,
          error.response?.status ?? 0,
          parsed.data.error.details,
        );
      }
    }

    throw error;
  },
);
