import { createRumoro, type Client } from "@rumoro-dev/sdk";
import type { Settings } from "./config";
import type { Operation } from "./types";

export const BEARER = [{ scheme: "bearer" as const, type: "http" as const }];
export type Outcome = { ok: boolean; status: number; value: unknown };

export function clientFor(settings: Settings, fetchImpl?: typeof fetch): Client {
  return createRumoro({ apiKey: settings.apiKey ?? "", baseUrl: settings.apiUrl, ...(fetchImpl ? { fetch: fetchImpl } : {}) }).client;
}

export async function runOperation(client: Client, op: Operation, request: { path: Record<string, string>; query: Record<string, unknown>; body?: unknown }): Promise<Outcome> {
  const result = await client.request({
    method: op.method as "GET",
    url: op.path,
    path: request.path,
    query: request.query,
    ...(request.body !== undefined ? { body: request.body } : {}),
    parseAs: op.response === "csv" ? "text" : "auto",
    security: BEARER,
    throwOnError: false,
  });
  const status = result.response?.status ?? 0;
  if (result.error !== undefined) return { ok: false, status, value: result.error };
  if (!result.response) return { ok: false, status, value: undefined };
  return { ok: result.response.ok, status, value: result.data ?? undefined };
}

/** The API's error envelope, or one made from the status when the answer was not one. */
export function errorEnvelope(outcome: Outcome) {
  const value = outcome.value;
  if (value !== null && typeof value === "object" && "error" in value) {
    const inner = (value as { error: unknown }).error;
    if (inner !== null && typeof inner === "object" && "code" in inner && "message" in inner) return value;
  }
  const message = typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 300) : `Request failed with status ${outcome.status}`;
  return { error: { code: `http_${outcome.status}`, message } };
}
