import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";

const BIN = new URL("../dist/index.js", import.meta.url).pathname;

/** A stand-in API that records requests and answers from `routes` ("GET /v1/whoami" → [status, body, type?]). */
async function mockApi(routes) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({ method: request.method, path: url.pathname, query: url.search, auth: request.headers.authorization, body: body ? JSON.parse(body) : undefined });
    const [status, payload, type = "application/json"] = routes[`${request.method} ${url.pathname}`] ?? [404, { error: { code: "not_found", message: "Not found" } }];
    response.writeHead(status, status === 204 ? {} : { "content-type": type });
    response.end(status === 204 ? undefined : type === "application/json" ? JSON.stringify(payload) : payload);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => server.close() };
}

/** Runs the CLI; resolves with its exit code and output. `onStderr` sees stderr as it arrives. */
function run(args, { env = {}, input, onStderr } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: { PATH: process.env.PATH, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; onStderr?.(stderr, child); });
    child.stdin.end(input);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const KEY = `ref_0123abcd-0000-4000-8000-000000000000_${"A".repeat(43)}`;
const configDir = () => mkdtempSync(join(tmpdir(), "rumoro-cli-"));

test("86 commands: one per operation plus auth, watch and MCP", async () => {
  const { stdout, code } = await run(["--help"], { env: { COLUMNS: "200" } });
  assert.equal(code, 0);
  const commands = stdout.split("\n").filter((line) => /^ {2}[a-z-]+:[a-z-]+/.test(line)).map((line) => line.trim().split(" ")[0]);
  assert.equal(commands.length, 86);
  for (const name of ["auth:login", "auth:set", "auth:logout", "auth:check", "auth:whoami", "system:health", "mentions:search", "mentions:export", "mentions:export-json",
    "mentions:watch", "mcp:config", "keywords:create", "keywords:health", "people:activities", "members:invite", "billing:top-up", "api-keys:revoke"])
    assert.ok(commands.includes(name), name);
});

test("requests: key from the environment, path argument, list flags, body flags over --json, stdin", async () => {
  const api = await mockApi({ "GET /v1/keywords": [200, { data: [], total: 0 }], "PATCH /v1/keywords/kw_1": [200, { id: "kw_1" }], "POST /v1/keywords": [201, { id: "kw_2" }] });
  try {
    const env = { RUMORO_API_KEY: KEY, RUMORO_API_URL: `${api.url}/`, RUMORO_CONFIG_DIR: configDir() };
    assert.equal((await run(["keywords:list", "--kind", "brand,topic", "--limit", "5"], { env })).code, 0);
    assert.equal((await run(["keywords:update", "kw_1", "--json", '{"context":"ours","platforms":["x"]}', "--platforms", "x,hackernews"], { env })).code, 0);
    const created = await run(["keywords:create", "--json", "-"], { env, input: '{"term":"acme","kind":"brand"}' });
    assert.deepEqual([created.code, JSON.parse(created.stdout)], [0, { id: "kw_2" }]);
    const [list, update, create] = api.requests;
    assert.deepEqual([list.path, list.query, list.auth], ["/v1/keywords", "?kind=brand%2Ctopic&limit=5", `Bearer ${KEY}`]);
    assert.deepEqual([update.method, update.path, update.body], ["PATCH", "/v1/keywords/kw_1", { context: "ours", platforms: ["x", "hackernews"] }]);
    assert.deepEqual(create.body, { term: "acme", kind: "brand" });
  } finally { api.close(); }
});

test("errors: the API's envelope on stderr with exit 1; usage errors and a missing key exit 2", async () => {
  const api = await mockApi({ "POST /v1/keywords": [409, { error: { code: "duplicate_keyword", message: "Already tracked", requestId: "req_1" } }] });
  try {
    const env = { RUMORO_API_KEY: KEY, RUMORO_API_URL: api.url, RUMORO_CONFIG_DIR: configDir() };
    const duplicate = await run(["keywords:create", "--term", "acme", "--kind", "brand"], { env });
    assert.deepEqual([duplicate.code, JSON.parse(duplicate.stderr).error.code, duplicate.stdout], [1, "duplicate_keyword", ""]);
    const usage = await run(["keywords:list", "--limit", "many"], { env });
    assert.deepEqual([usage.code, JSON.parse(usage.stderr)], [2, { error: { code: "usage", message: '--limit expects a number, got "many"' } }]);
    assert.equal(JSON.parse((await run(["keywords:list", "--limit", "2.5"], { env })).stderr).error.message, '--limit expects a whole number, got "2.5"');
    assert.equal((await run(["keywords:create", "--kind", "brand"], { env })).code, 2, "--term is required");
    const noKey = await run(["keywords:list"], { env: { RUMORO_API_URL: api.url, RUMORO_CONFIG_DIR: configDir() } });
    assert.deepEqual([noKey.code, JSON.parse(noKey.stderr).error.code], [2, "no_api_key"]);
    // The public health check needs no key.
    assert.equal((await run(["system:health"], { env: { RUMORO_API_URL: api.url, RUMORO_CONFIG_DIR: configDir() } })).code, 1, "answered by the API (404 here), not refused for a key");
  } finally { api.close(); }
});

test("output: JSON, --table, CSV to stdout or --out, an empty answer as ok and status", async () => {
  const api = await mockApi({ "GET /v1/alerts": [200, { data: [{ id: "feed_1", name: "Buying", enabled: true, filter: {} }] }],
    "GET /v1/mentions/export.csv": [200, "id,url\nmm_1,https://x.com/a\n", "text/csv"], "DELETE /v1/alerts/feed_1": [204] });
  try {
    const dir = configDir(), env = { RUMORO_API_KEY: KEY, RUMORO_API_URL: api.url, RUMORO_CONFIG_DIR: dir };
    assert.deepEqual(JSON.parse((await run(["alerts:list"], { env })).stdout).data[0].id, "feed_1");
    const table = (await run(["alerts:list", "--table"], { env })).stdout.split("\n");
    assert.deepEqual([table[0].trim().split(/\s+/), table[2].trim().split(/\s+/)], [["id", "name", "enabled"], ["feed_1", "Buying", "true"]]);
    assert.equal((await run(["mentions:export"], { env })).stdout, "id,url\nmm_1,https://x.com/a\n");
    const file = join(dir, "out.csv"), saved = JSON.parse((await run(["mentions:export", "--out", file], { env })).stdout);
    assert.deepEqual([saved, readFileSync(file, "utf8")], [{ ok: true, file, bytes: 28 }, "id,url\nmm_1,https://x.com/a\n"]);
    assert.deepEqual(JSON.parse((await run(["alerts:delete", "feed_1"], { env })).stdout), { ok: true, status: 204 });
  } finally { api.close(); }
});

test("auth:set, auth:check and auth:logout: the key in a 600 file, its source, the workspace from whoami", async () => {
  const api = await mockApi({ "GET /v1/whoami": [200, { workspace: { id: "org_1", name: "Acme" }, auth: { kind: "api_key" } }] });
  try {
    const dir = configDir(), env = { RUMORO_CONFIG_DIR: dir };
    const set = JSON.parse((await run(["auth:set", "--key", KEY, "--url", api.url], { env })).stdout);
    assert.deepEqual(set, { ok: true, file: join(dir, "config.json"), key: "ref_0123abcd" });
    assert.equal(statSync(join(dir, "config.json")).mode & 0o777, 0o600);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.deepEqual(JSON.parse((await run(["auth:check"], { env })).stdout), { ok: true, workspace: "Acme", key: "ref_0123abcd", source: "file", apiUrl: api.url });
    assert.equal(JSON.parse((await run(["auth:check"], { env: { ...env, RUMORO_API_KEY: KEY } })).stdout).source, "env");
    assert.equal(JSON.parse((await run(["--api-key", KEY, "auth:check"], { env })).stdout).source, "flag");
    await run(["auth:logout"], { env });
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")), { apiUrl: api.url });
  } finally { api.close(); }
});

test("auth:login: the browser's callback with the state stores the key; another state is refused; Cancel fails the login", async () => {
  const api = await mockApi({ "GET /v1/whoami": [200, { workspace: { name: "Acme" } }] });
  try {
    const dir = configDir(), env = { RUMORO_CONFIG_DIR: dir, RUMORO_API_URL: api.url };
    let opened;
    const login = await run(["auth:login", "--no-open", "--app-url", "https://app.example.test", "--name", "laptop", "--scope", "read"], { env, onStderr: async (text) => {
      const url = /https:\/\/app\.example\.test\S+/.exec(text)?.[0];
      if (!url || opened) return;
      opened = new URL(url);
      const back = `http://127.0.0.1:${opened.searchParams.get("port")}/callback`;
      assert.equal((await fetch(`${back}?state=wrong-state-0000000&key=${KEY}`)).status, 400);
      assert.equal((await fetch(`${back}?state=${opened.searchParams.get("state")}&key=${KEY}`)).status, 200);
    } });
    assert.deepEqual([opened.pathname, opened.searchParams.get("name"), opened.searchParams.get("scope")], ["/cli/authorize", "laptop", "read"]);
    assert.match(opened.searchParams.get("state"), /^[A-Za-z0-9_-]{32}$/);
    assert.deepEqual([login.code, JSON.parse(login.stdout)], [0, { ok: true, workspace: "Acme", key: "ref_0123abcd", scope: "read", file: join(dir, "config.json") }]);
    assert.equal(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).apiKey, KEY);

    let cancelled = false;
    const denied = await run(["auth:login", "--no-open", "--app-url", "https://app.example.test"], { env: { RUMORO_CONFIG_DIR: configDir() }, onStderr: async (text) => {
      const url = /https:\/\/app\.example\.test\S+/.exec(text)?.[0];
      if (!url || cancelled) return;
      cancelled = true;
      const opened = new URL(url);
      await fetch(`http://127.0.0.1:${opened.searchParams.get("port")}/callback?state=${opened.searchParams.get("state")}&error=denied`);
    } });
    assert.deepEqual([denied.code, JSON.parse(denied.stderr.split("\n").at(-2))], [1, { error: { code: "login_failed", message: "Authorization was declined in the browser." } }]);
  } finally { api.close(); }
});

test("mcp:config prints each client's configuration with the stored key, or a placeholder", async () => {
  const dir = configDir();
  await run(["auth:set", "--key", KEY], { env: { RUMORO_CONFIG_DIR: dir } });
  assert.equal((await run(["mcp:config"], { env: { RUMORO_CONFIG_DIR: dir } })).stdout,
    `claude mcp add --transport http rumoro https://mcp.rumoro.dev/mcp --header "Authorization: Bearer ${KEY}"\n`);
  assert.deepEqual(JSON.parse((await run(["mcp:config", "--client", "cursor"], { env: { RUMORO_CONFIG_DIR: dir } })).stdout),
    { mcpServers: { rumoro: { url: "https://mcp.rumoro.dev/mcp", headers: { Authorization: `Bearer ${KEY}` } } } });
  const empty = await run(["mcp:config", "--client", "vscode"], { env: { RUMORO_CONFIG_DIR: configDir() } });
  assert.match(empty.stderr, /placeholder/);
  assert.equal(JSON.parse(empty.stdout).servers.rumoro.headers.Authorization, "Bearer ref_...");
  assert.ok(!existsSync(join(tmpdir(), "nothing")));
});

test("mentions:watch: --from-start prints the newest page oldest first as JSON lines, with the filters", async () => {
  const api = await mockApi({ "GET /v1/mentions": [200, { data: [{ id: "mm_2" }, { id: "mm_1" }], nextCursor: null }] });
  try {
    const env = { RUMORO_API_KEY: KEY, RUMORO_API_URL: api.url, RUMORO_CONFIG_DIR: configDir() };
    const child = spawn(process.execPath, [BIN, "mentions:watch", "--from-start", "--platform", "x", "--interval", "5"], { env: { PATH: process.env.PATH, ...env } });
    let stdout = "";
    child.stdout.on("data", (data) => { stdout += data; if (stdout.split("\n").length > 2) child.kill("SIGINT"); });
    await once(child, "close");
    assert.deepEqual(stdout.trim().split("\n").map((line) => JSON.parse(line).id), ["mm_1", "mm_2"]);
    assert.equal(new URLSearchParams(api.requests[0].query).toString(), "platform=x&sort=newest&limit=100");
  } finally { api.close(); }
});
