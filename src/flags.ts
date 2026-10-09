import type { Field, FieldType, Operation } from "./types";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function coerceScalar(field: Field, raw: string, type: FieldType): unknown {
  switch (type) {
    case "integer":
    case "number": {
      const n = Number(raw);
      // Instants accept ISO 8601 as well as epoch milliseconds.
      if (!Number.isFinite(n) && /^\d{4}-\d{2}-\d{2}/.test(raw) && Number.isFinite(Date.parse(raw))) return raw;
      if (raw.trim() === "" || !Number.isFinite(n)) throw new UsageError(`--${field.name} expects a number, got "${raw}"`);
      if (type === "integer" && !Number.isInteger(n)) throw new UsageError(`--${field.name} expects a whole number, got "${raw}"`);
      return n;
    }
    case "boolean":
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new UsageError(`--${field.name} expects true or false, got "${raw}"`);
    case "object":
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        return parsed;
      } catch {
        throw new UsageError(`--${field.name} expects a JSON object, got "${raw}"`);
      }
    default:
      return raw;
  }
}

/** A flag's value as the API reads it. Query lists stay comma-separated; body lists become arrays. */
export function coerce(field: Field, raw: string): unknown {
  if (field.nullable && raw === "null") return null;
  if (field.type === "array") {
    if (field.in === "query") return raw;
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        throw new UsageError(`--${field.name} expects a comma-separated list or a JSON array`);
      }
    }
    const items = trimmed === "" ? [] : trimmed.split(",").map((value) => value.trim());
    return items.map((item) => coerceScalar(field, item, field.items ?? "string"));
  }
  return coerceScalar(field, raw, field.type);
}

export function flagHelp(field: Field) {
  const parts: string[] = [];
  if (field.description) parts.push(field.description.replace(/\s+/g, " ").trim());
  const hints: string[] = [];
  if (field.type === "array") hints.push(field.enum ? `comma-separated: ${field.enum.join("|")}` : "comma-separated");
  else if (field.type === "object") hints.push("JSON");
  else if (field.type !== "string" && !field.enum) hints.push(field.type);
  if (field.nullable) hints.push("null clears");
  if (hints.length > 0) parts.push(`(${hints.join(", ")})`);
  return parts.join(" ");
}

/** Path arguments in order, query flags, and the body from --json with flags on top. */
export function buildRequest(op: Operation, positional: string[], flags: Record<string, unknown>, jsonBody?: string) {
  const path: Record<string, string> = {};
  op.params.filter((param) => param.in === "path").forEach((param, index) => {
    const value = positional[index];
    if (value === undefined || value === "") throw new UsageError(`missing <${param.name}>`);
    path[param.name] = value;
  });
  const query: Record<string, unknown> = {};
  for (const param of op.params.filter((item) => item.in === "query")) {
    const raw = flags[param.name];
    if (raw === undefined) continue;
    const value = coerce(param, String(raw));
    if (value === null || typeof value === "object") continue;
    query[param.name] = value;
  }
  let body: Record<string, unknown> | undefined;
  if (op.body) {
    body = {};
    if (jsonBody !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonBody);
      } catch {
        throw new UsageError("--json is not valid JSON");
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new UsageError("--json must be a JSON object");
      body = parsed as Record<string, unknown>;
    }
    for (const field of op.body.fields) {
      const raw = flags[field.name];
      if (raw !== undefined) body[field.name] = coerce(field, String(raw));
    }
    for (const field of op.body.fields) if (field.required && body[field.name] === undefined) throw new UsageError(`--${field.name} is required`);
  }
  return { path, query, body };
}
