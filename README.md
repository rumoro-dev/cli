# Rumoro CLI

[![npm](https://img.shields.io/npm/v/@rumoro-dev/cli?label=npm)](https://www.npmjs.com/package/@rumoro-dev/cli)
[![license](https://img.shields.io/npm/l/@rumoro-dev/cli)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.rumoro.dev%2Fcli-blue)](https://docs.rumoro.dev/cli)

`rumoro` puts the [Rumoro API](https://docs.rumoro.dev) on the command line. Every endpoint is a `noun:verb` command generated from the OpenAPI document, and there is a live mentions feed and an MCP helper. Rumoro watches Reddit, X, Hacker News, GitHub, Bluesky, LinkedIn, Stack Overflow, DEV, YouTube, TikTok, Instagram and news for your product, your competitors and your topics, and scores every mention for relevance, sentiment and intent. Requires Node 22+.

## Installation

```bash
npm install -g @rumoro-dev/cli
# or run it without installing
npx @rumoro-dev/cli --help
```

## Quick start

```bash
rumoro auth:login                                   # signs in through the browser and stores a key
rumoro keywords:create --term "acme cloud" --kind brand --platforms hackernews,x
rumoro mentions:search --relevant true --intent buy_intent --limit 20
rumoro mentions:update mm_7f3a... --status done --note "replied 2026-10-03"
rumoro analytics:summary --range 7d --compare true
rumoro mentions:watch --platform hackernews | jq -r '.post.url'
```

Output is JSON: compact when piped, indented on a terminal, and `--table` renders lists as a table.

## Authentication

There are three ways to supply a key, in order of precedence:

```bash
rumoro keywords:list --api-key ref_...    # one command
export RUMORO_API_KEY=ref_...             # the shell
rumoro auth:set --key ref_...             # stored for this machine; auth:login does this for you
```

`rumoro auth:login` opens the dashboard. You pick the workspace, and the dashboard mints a key named after your machine and hands it to the CLI on a loopback port (owners create keys; anyone else stores an owner's key with `auth:set`). The key is stored in `~/.rumoro/config.json` (mode 600; `RUMORO_CONFIG_DIR` moves it). `auth:check` shows which workspace the key belongs to and where it came from, and `auth:logout` removes it. `--api-url` or `RUMORO_API_URL` point the CLI at another deployment.

## Commands

Generated commands take every query parameter and body field as a flag. `--json '{...}'` sends a whole body (`-` reads stdin), and flags override its fields. Exports take `--out file.csv`.

| Group | Commands |
| --- | --- |
| `keywords` | `create`, `list`, `get`, `update`, `delete`, `health` |
| `groups` | `create`, `list`, `get`, `update`, `delete` |
| `mentions` | `search`, `get`, `update`, `export`, `export-json`, `watch` |
| `attention` | `list`, `dismiss` |
| `views` | `create`, `list`, `get`, `update`, `delete` |
| `filters` | `get`, `update` |
| `people` | `list`, `get`, `update`, `merge`, `split`, `export`, `activities`, `log-activity`, `delete-activity` |
| `segments` | `create`, `list`, `get`, `update`, `delete` |
| `alerts` | `create`, `list`, `get`, `update`, `delete`, `test`, `run`, `mute`, `unmute` |
| `channels` | `create`, `list`, `get`, `update`, `delete`, `test`, `rotate-secret`, `deliveries` |
| `analytics` | `summary`, `series`, `breakdown`, `share-of-voice`, `reviews` |
| `company` | `get`, `update` |
| `members` | `list`, `remove`, `invitations`, `invite`, `revoke-invitation` |
| `usage` | `get`, `breakdown` |
| `billing` | `wallet`, `ledger`, `top-up`, `invoices`, `invoice-url` |
| `api-keys` | `create`, `list`, `revoke` |
| `system` | `health` |
| `auth` | `login`, `set`, `check`, `logout`, `whoami` |
| `mcp` | `config` |

`rumoro <group>:<verb> --help` prints every flag with the description from the API reference.

## A live feed

```bash
rumoro mentions:watch --platform hackernews --intent question --interval 30
```

This polls the API and prints each new mention as one JSON line, so it pipes into `jq`, a file, or anything that reads stdin. `--from-start` prints the current newest page first.

## MCP helpers

```bash
rumoro mcp:config          # the configuration for Claude Code, Cursor, VS Code or a generic MCP client, with your key
```

Or skip the CLI and add the server directly in Claude Code, which signs you in through the browser:

```bash
claude mcp add --transport http rumoro https://mcp.rumoro.dev/mcp
```

## Errors

A non-2xx response prints the API's error envelope on stderr, `{ "error": { "code", "message", "requestId" } }`, and exits with 1. Usage errors and a missing key exit with 2.

## Requirements

- Node 22+
- A Rumoro account (every account starts with $5.80 of credit, and no card is needed)

## Links

- [Documentation](https://docs.rumoro.dev)
- [OpenAPI document](https://api.rumoro.dev/v1/openapi.json)
- [Dashboard](https://app.rumoro.dev)
- [TypeScript SDK](https://www.npmjs.com/package/@rumoro-dev/sdk)

## License

MIT.
