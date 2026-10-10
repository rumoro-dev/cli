# Rumoro CLI

[![npm](https://img.shields.io/npm/v/@rumoro-dev/cli?label=npm)](https://www.npmjs.com/package/@rumoro-dev/cli)
[![license](https://img.shields.io/npm/l/@rumoro-dev/cli)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.rumoro.dev%2Fcli-blue)](https://docs.rumoro.dev/cli)

The `rumoro` command puts the [Rumoro API](https://docs.rumoro.dev) in your terminal. Every endpoint is a `noun:verb` command, and there's a live feed of new mentions and a helper that prints MCP settings. Rumoro picks up posts about your product, your competitors and your market on Reddit, X, Hacker News, GitHub, Bluesky, LinkedIn, Stack Overflow, DEV, YouTube, TikTok, Instagram and news, and rates each for relevance, sentiment and intent.

## Install

```bash
npm install -g @rumoro-dev/cli
# or try it without installing
npx @rumoro-dev/cli --help
```

## Try it

```bash
rumoro auth:login                                   # sign in through the browser; the key is saved for you
rumoro keywords:create --term "basil deploy" --kind brand --platforms hackernews,x
rumoro mentions:search --relevant true --intent question --limit 20
rumoro mentions:update mm_7f3a... --status done --note "answered in the thread"
rumoro analytics:summary --range 7d --compare true
rumoro mentions:watch --platform hackernews | jq -r '.post.url'
```

Results print as JSON, compact when piped and indented in a terminal. Add `--table` to show a list as a table.

## Your API key

The CLI looks for a key in this order.

```bash
rumoro keywords:list --api-key ref_...    # for a single command
export RUMORO_API_KEY=ref_...             # for the current shell
rumoro auth:set --key ref_...             # saved on this machine (auth:login does this for you)
```

`rumoro auth:login` sends you to the dashboard in your browser to pick a workspace. The dashboard creates a key labeled with your computer's name and hands it to the CLI over a local port. Only owners can create keys, so other members save an owner's key with `auth:set`. Keys are stored in `~/.rumoro/config.json` with mode 600 (set `RUMORO_CONFIG_DIR` to use another folder). `auth:check` tells you which workspace a key belongs to and where it was found; `auth:logout` deletes it. To use another deployment, pass `--api-url` or set `RUMORO_API_URL`.

## Commands

Each query parameter and body field has a matching flag. To send a whole body, use `--json '{...}'` (or `-` to read it from stdin); flags given alongside override its fields. Export commands write to a file with `--out file.csv`.

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

Run `rumoro <group>:<verb> --help` to see each flag with its description.

## Watching for new mentions

```bash
rumoro mentions:watch --platform hackernews --intent question --interval 30
```

The command polls the API and prints every new mention as a single line of JSON, ready to pipe into `jq`, a file or another program. Add `--from-start` to print the most recent page first.

## MCP

```bash
rumoro mcp:config          # settings for Claude Code, Cursor, VS Code or any MCP client, with your key filled in
```

Claude Code can also connect to the server directly, without the CLI, and signs you in through the browser.

```bash
claude mcp add --transport http rumoro https://mcp.rumoro.dev/mcp
```

## Exit codes

On an API error, the CLI writes the error object (`{ "error": { "code", "message", "requestId" } }`) to stderr and exits with 1. Invalid usage or a missing key exits with 2.

## Requirements

- Node 22 or later
- A Rumoro account. New accounts come with $5.80 of credit and don't need a card.

## Links

- [Documentation](https://docs.rumoro.dev/cli)
- [OpenAPI document](https://api.rumoro.dev/v1/openapi.json)
- [Dashboard](https://app.rumoro.dev)
- [TypeScript SDK](https://www.npmjs.com/package/@rumoro-dev/sdk)

## License

MIT.
