import type { Client } from "@rumoro-dev/sdk";
import { BEARER } from "./run";

const SEEN_LIMIT = 5000;
const PAGE = 100;
type Item = { id: string };
type Seen = { ids: Set<string>; order: string[] };

/** The items not seen before, oldest first; remembers at most the last 5,000 ids. */
export function takeNew(seen: Seen, newestFirst: Item[]) {
  const fresh = newestFirst.filter((item) => !seen.ids.has(item.id));
  for (const item of fresh) {
    seen.ids.add(item.id);
    seen.order.push(item.id);
  }
  while (seen.order.length > SEEN_LIMIT) {
    const oldest = seen.order.shift();
    if (oldest !== undefined) seen.ids.delete(oldest);
  }
  return fresh.reverse();
}

const defaultSleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve();
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); });
});

/** Polls the newest page of mentions and writes each new one as a JSON line until the signal aborts. */
export async function watchMentions(options: {
  client: Client; query: Record<string, unknown>; intervalMs: number; fromStart: boolean; signal: AbortSignal;
  write: (line: string) => void; warn: (line: string) => void; sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  const sleep = options.sleep ?? defaultSleep;
  const seen: Seen = { ids: new Set(), order: [] };
  let first = true;
  while (!options.signal.aborted) {
    const result = await options.client.request({ method: "GET", url: "/v1/mentions", query: { ...options.query, sort: "newest", limit: PAGE }, security: BEARER, throwOnError: false });
    if (result.error !== undefined || !result.response?.ok) {
      options.warn(JSON.stringify({ error: result.error ?? { code: `http_${result.response?.status ?? 0}`, message: "poll failed" } }));
    } else {
      const fresh = takeNew(seen, (result.data as { data?: Item[] } | undefined)?.data ?? []);
      if (!first || options.fromStart) for (const item of fresh) options.write(JSON.stringify(item));
    }
    first = false;
    await sleep(options.intervalMs, options.signal);
  }
}
