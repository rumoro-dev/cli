import { Command, Option } from "commander";
import { writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { version } from "../package.json";
import { keyPrefix, resolveSettings, writeConfig, type Settings } from "./config";
import { buildRequest, coerce, flagHelp, UsageError } from "./flags";
import { DEFAULT_APP_URL, LoginError, loginUrl, newState, openBrowser, startCallbackServer } from "./login";
import { DEFAULT_MCP_URL, mcpConfig, type McpClient } from "./mcp";
import { commandName } from "./naming";
import { formatOutput } from "./output";
import { BEARER, clientFor, errorEnvelope, runOperation } from "./run";
import { watchMentions } from "./watch";
import { OPERATIONS } from "./generated/operations";
import type { Field, Operation } from "./types";

type Globals = { apiKey?: string; apiUrl?: string; pretty?: boolean; table?: boolean };
const program = new Command();
const globals = () => program.opts<Globals>();

function print(value: unknown, options: Globals) {
  process.stdout.write(`${formatOutput(value, { pretty: options.pretty ?? Boolean(process.stdout.isTTY), table: options.table ?? false })}\n`);
}

/** Errors go to stderr as the API's envelope; exit 2 is a usage error, 1 anything else. */
function fail(envelope: unknown, code = 1): never {
  process.stderr.write(`${JSON.stringify(envelope)}\n`);
  process.exit(code);
}

function settingsOrFail(options: Globals, needsKey: boolean) {
  const settings = resolveSettings({ apiKey: options.apiKey, apiUrl: options.apiUrl });
  if (needsKey && !settings.apiKey)
    fail({ error: { code: "no_api_key", message: "No API key. Run `rumoro auth:login` or `rumoro auth:set --key ref_...`, set RUMORO_API_KEY, or pass --api-key." } }, 2);
  return settings;
}

/** The workspace a key belongs to (whoami), or null when the key does not resolve. */
async function workspaceName(settings: Settings) {
  const result = await clientFor(settings).request({ method: "GET", url: "/v1/whoami", security: BEARER, throwOnError: false });
  return { result, name: result.error === undefined && result.response?.ok ? (result.data as { workspace?: { name?: string } })?.workspace?.name ?? null : null };
}

function addFieldOption(command: Command, field: Field) {
  const option = new Option(`--${field.name} <value>`, flagHelp(field));
  if (field.enum && field.type !== "array") option.choices(field.nullable ? [...field.enum, "null"] : field.enum);
  command.addOption(option);
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function registerOperation(op: Operation) {
  const command = program.command(commandName(op)).description(op.summary).summary(op.summary);
  if (op.description) command.addHelpText("after", `\n${op.description}\n`);
  for (const param of op.params.filter((item) => item.in === "path")) command.argument(`<${param.name}>`, param.description ?? "");
  for (const param of op.params.filter((item) => item.in === "query")) addFieldOption(command, param);
  if (op.body) {
    for (const field of op.body.fields) addFieldOption(command, field);
    command.option("--json <object>", 'The whole body as JSON; flags override its fields. "-" reads stdin.');
  }
  if (op.response === "csv") command.option("--out <file>", "Write the CSV to a file instead of stdout.");
  command.action(async (...args: unknown[]) => {
    const cmd = args[args.length - 1] as Command;
    const positional = args.slice(0, -2) as string[];
    const flags = cmd.opts<Record<string, unknown>>();
    const options = globals();
    try {
      let jsonBody = typeof flags.json === "string" ? flags.json : undefined;
      if (jsonBody === "-") jsonBody = await readStdin();
      const request = buildRequest(op, positional, flags, jsonBody);
      const settings = settingsOrFail(options, op.operationId !== "getHealth");
      const outcome = await runOperation(clientFor(settings), op, request);
      if (!outcome.ok) fail(errorEnvelope(outcome));
      if (op.response === "csv") {
        const csv = typeof outcome.value === "string" ? outcome.value : "";
        if (typeof flags.out === "string") {
          writeFileSync(flags.out, csv);
          print({ ok: true, file: flags.out, bytes: Buffer.byteLength(csv) }, options);
        } else {
          process.stdout.write(csv);
        }
        return;
      }
      print(outcome.value === undefined ? { ok: true, status: outcome.status } : outcome.value, options);
    } catch (error) {
      if (error instanceof UsageError) fail({ error: { code: "usage", message: error.message } }, 2);
      throw error;
    }
  });
}

function registerAuth() {
  program.command("auth:login")
    .description("Sign in through the browser: the dashboard mints an API key and hands it to this terminal")
    .option("--app-url <url>", "Dashboard URL", DEFAULT_APP_URL)
    .option("--name <label>", "Name of the key the dashboard creates", `CLI on ${hostname()}`)
    .addOption(new Option("--scope <scope>", "read: GET only. write: everything.").choices(["read", "write"]).default("write"))
    .option("--timeout <seconds>", "How long to wait for the browser", "300")
    .option("--no-open", "Print the URL instead of opening the browser")
    .action(async (flags: { appUrl: string; name: string; scope: string; timeout: string; open: boolean }) => {
      const options = globals();
      const seconds = Number(flags.timeout);
      if (!Number.isFinite(seconds) || seconds < 10) fail({ error: { code: "usage", message: "--timeout must be at least 10 seconds" } }, 2);
      const state = newState();
      const server = await startCallbackServer(state, seconds * 1000);
      const url = loginUrl(flags.appUrl, { port: server.port, state, name: flags.name, scope: flags.scope });
      const opened = flags.open ? openBrowser(url) : false;
      process.stderr.write(`${opened ? "Opening your browser to authorize the CLI. If it does not open, visit:" : "Open this URL to authorize the CLI:"}\n  ${url}\nWaiting for the browser (${seconds}s)...\n`);
      let key: string;
      try {
        key = await server.key;
      } catch (error) {
        fail({ error: { code: "login_failed", message: error instanceof LoginError ? error.message : String(error) } });
      }
      const file = writeConfig({ apiKey: key, ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}) });
      const { name } = await workspaceName(resolveSettings({ apiKey: key, apiUrl: options.apiUrl }));
      print({ ok: true, workspace: name, key: keyPrefix(key), scope: flags.scope, file }, options);
    });
  program.command("auth:set")
    .description("Store an API key (and optionally the API host) in ~/.rumoro/config.json")
    .requiredOption("--key <key>", "API key from the dashboard or POST /v1/api-keys (ref_...)")
    .option("--url <url>", "API host for another deployment")
    .action((flags: { key: string; url?: string }) => {
      const file = writeConfig({ apiKey: flags.key, ...(flags.url ? { apiUrl: flags.url } : {}) });
      print({ ok: true, file, key: keyPrefix(flags.key) }, globals());
    });
  program.command("auth:logout").description("Remove the stored API key").action(() => {
    print({ ok: true, file: writeConfig({ apiKey: null }) }, globals());
  });
  program.command("auth:check").description("Verify the key: which workspace it belongs to and where it came from").action(async () => {
    const options = globals();
    const settings = settingsOrFail(options, true);
    const { result, name } = await workspaceName(settings);
    if (result.error !== undefined || !result.response?.ok) fail(errorEnvelope({ ok: false, status: result.response?.status ?? 0, value: result.error }));
    print({ ok: true, workspace: name, key: keyPrefix(settings.apiKey ?? ""), source: settings.source, apiUrl: settings.apiUrl }, options);
  });
}

function registerWatch() {
  const search = OPERATIONS.find((op) => op.operationId === "searchMentions");
  if (!search) return;
  const command = program.command("mentions:watch")
    .description("Follow the feed: print each new mention as one JSON line (tail -f for mentions)")
    .option("--interval <seconds>", "Seconds between polls", "30")
    .option("--from-start", "Print the current newest page first instead of only what arrives next");
  const skip = new Set(["cursor", "limit", "sort", "since", "until"]);
  const filters = search.params.filter((param) => param.in === "query" && !skip.has(param.name));
  for (const param of filters) addFieldOption(command, param);
  command.action(async (flags: Record<string, unknown>) => {
    const settings = settingsOrFail(globals(), true);
    const query: Record<string, unknown> = {};
    try {
      for (const param of filters) {
        const raw = flags[param.name];
        if (raw === undefined) continue;
        const value = coerce(param, String(raw));
        if (value !== null && typeof value !== "object") query[param.name] = value;
      }
    } catch (error) {
      if (error instanceof UsageError) fail({ error: { code: "usage", message: error.message } }, 2);
      throw error;
    }
    const seconds = Number(flags.interval);
    if (!Number.isFinite(seconds) || seconds < 5) fail({ error: { code: "usage", message: "--interval must be at least 5 seconds" } }, 2);
    const controller = new AbortController();
    process.on("SIGINT", () => controller.abort());
    process.on("SIGTERM", () => controller.abort());
    await watchMentions({
      client: clientFor(settings), query, intervalMs: seconds * 1000, fromStart: flags.fromStart === true, signal: controller.signal,
      write: (line) => process.stdout.write(`${line}\n`), warn: (line) => process.stderr.write(`${line}\n`),
    });
  });
}

function registerMcp() {
  program.command("mcp:config")
    .description("Print the MCP client configuration for the Rumoro MCP server, key included")
    .addOption(new Option("--client <kind>", "Which client to print for").choices(["claude", "cursor", "vscode", "generic"]).default("claude"))
    .option("--url <url>", "MCP server URL", DEFAULT_MCP_URL)
    .action((flags: { client: McpClient; url: string }) => {
      const options = globals();
      const settings = resolveSettings({ apiKey: options.apiKey, apiUrl: options.apiUrl });
      if (!settings.apiKey) process.stderr.write("No API key configured; printing a placeholder. Run `rumoro auth:login` first.\n");
      process.stdout.write(`${mcpConfig(flags.client, flags.url, settings.apiKey ?? "ref_...")}\n`);
    });
}

program.name("rumoro")
  .description("Command line for the Rumoro API. Commands are noun:verb; every endpoint has one.")
  .version(version, "-V, --version")
  .option("--api-key <key>", "API key (overrides RUMORO_API_KEY and the stored key)")
  .option("--api-url <url>", "API host (overrides RUMORO_API_URL and the stored host)")
  .option("--pretty", "Indent JSON output (the default on a terminal)")
  .option("--table", "Render lists as a table")
  .showHelpAfterError("(run with --help for usage)")
  .configureHelp({ sortSubcommands: true });
registerAuth();
for (const op of OPERATIONS) registerOperation(op);
registerWatch();
registerMcp();
program.parseAsync(process.argv).catch((error: unknown) => {
  fail({ error: { code: "internal_error", message: error instanceof Error ? error.message : String(error) } });
});
