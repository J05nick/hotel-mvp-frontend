import "server-only";

import { z } from "zod";

import { isValidTimeZone } from "@/shared/lib/zoned-time";

/**
 * Runtime configuration (12-Factor III). Server-only and read per request, so a single build
 * can be promoted across environments; nothing here is inlined at build time.
 */
const serverEnvSchema = z.object({
  /** Where the Next.js server reaches the REST API. */
  API_BASE_URL: z.url().default("http://localhost:8000"),
  /** Where the browser opens the WebSocket (public address of the API). */
  WS_URL: z
    .string()
    .regex(/^wss?:\/\/.+/, "must start with ws:// or wss://")
    .default("ws://localhost:8000/ws/events"),
  /** IANA zone that defines the hotel's day. */
  HOTEL_TIMEZONE: z
    .string()
    .default("UTC")
    .refine(isValidTimeZone, "must be a valid IANA time zone"),
});

export type ServerEnv = z.output<typeof serverEnvSchema>;

export function getServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    // Fail loudly with the offending variable names instead of a vague runtime crash.
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return {
    ...parsed.data,
    API_BASE_URL: parsed.data.API_BASE_URL.replace(/\/+$/, ""),
  };
}
