import { z } from "zod";

/** Error contract of the backend: `{ "error": "<code>", "detail": "<message>" }`. */
const errorBodySchema = z.object({ error: z.string(), detail: z.string() });

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FetchJsonOptions = {
  /** Abort the request after this many milliseconds (default 5 s). */
  timeoutMs?: number;
};

/**
 * GET `url`, never cached (the calendar must be fresh on every request), and validate the
 * body against `schema`. Every failure surfaces as an `ApiError`, so callers handle one type:
 *   status 0     -> network error / timeout (`network_error`)
 *   status 4xx/5xx -> the backend's own `error` code, or `http_error`
 *   status 200   -> `invalid_response` when the payload does not match the schema
 */
export async function fetchJson<S extends z.ZodType>(
  url: string,
  schema: S,
  { timeoutMs = 5_000 }: FetchJsonOptions = {},
): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError(0, "network_error", `Could not reach the API: ${reason}`);
  }

  if (!response.ok) {
    const body = errorBodySchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      body.success ? body.data.error : "http_error",
      body.success ? body.data.detail : `API answered ${response.status}`,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      "invalid_response",
      `Unexpected API response: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
