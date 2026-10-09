import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_API_URL = "https://api.rumoro.dev";
type Env = Record<string, string | undefined>;
export interface StoredConfig { apiKey?: string; apiUrl?: string }
export interface Settings { apiKey: string | undefined; apiUrl: string; source: "flag" | "env" | "file" | "none" }

export const configDir = (env: Env = process.env) => env.RUMORO_CONFIG_DIR ?? join(homedir(), ".rumoro");
export const configPath = (env: Env = process.env) => join(configDir(env), "config.json");

export function readConfig(env: Env = process.env): StoredConfig {
  const path = configPath(env);
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    return {
      apiKey: typeof record.apiKey === "string" ? record.apiKey : undefined,
      apiUrl: typeof record.apiUrl === "string" ? record.apiUrl : undefined,
    };
  } catch {
    return {};
  }
}

/** Merges a patch into the stored config (null removes a field). The directory is 700 and the file 600: it holds a key. */
export function writeConfig(patch: { apiKey?: string | null; apiUrl?: string | null }, env: Env = process.env) {
  const next: StoredConfig = { ...readConfig(env) };
  if (patch.apiKey === null) delete next.apiKey;
  else if (patch.apiKey !== undefined) next.apiKey = patch.apiKey;
  if (patch.apiUrl === null) delete next.apiUrl;
  else if (patch.apiUrl !== undefined) next.apiUrl = patch.apiUrl;
  mkdirSync(configDir(env), { recursive: true, mode: 0o700 });
  const path = configPath(env);
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

/** The key and host to use: a flag, then the environment, then the stored config. */
export function resolveSettings(flags: { apiKey?: string; apiUrl?: string }, env: Env = process.env): Settings {
  const file = readConfig(env);
  const apiUrl = (flags.apiUrl ?? env.RUMORO_API_URL ?? file.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
  if (flags.apiKey) return { apiKey: flags.apiKey, apiUrl, source: "flag" };
  if (env.RUMORO_API_KEY) return { apiKey: env.RUMORO_API_KEY, apiUrl, source: "env" };
  if (file.apiKey) return { apiKey: file.apiKey, apiUrl, source: "file" };
  return { apiKey: undefined, apiUrl, source: "none" };
}

/** The part of a key the dashboard shows (ref_ and eight characters), never the secret. */
export function keyPrefix(key: string) {
  return /^(ref_[0-9a-f]{8})/i.exec(key)?.[1] ?? key.slice(0, 12);
}
