# gilb-connector

A stdio MCP server. Claude Code — in a terminal, or inside Obsidian through Claudian — uses it to work as Kai-Zen, Agent Jackfruit, and the other GilbPlatform agents, on GilbPlatform vaults, signed in as this computer.

The file a person runs is `connector/gilb-connector.mjs`: one file, no npm dependencies, Node 18 or newer. stdout is protocol only. Logs go to stderr.

## Install

Put `connector/gilb-connector.mjs` at `~/.gilb-connector.mjs`. Then:

```sh
gilb-computer add
claude mcp add gilb -- node ~/.gilb-connector.mjs --vault <your vault>
```

`gilb-computer add` asks you to approve this computer once in GilbApp. Restart Claude Code after you approve it. Until then, every tool answers that this computer is not connected yet.

Repeat `--vault` for each vault. The id is that vault's address (it starts with `https`). The connector keeps one platform turn for the life of the process and signs each request as this computer. You do not download a token every 30 minutes.

The server name is `gilb`, so Claude Code's slash command is `/mcp__gilb__agent`.

## Terminal

Start `claude` in a terminal. The `gilb` server from `claude mcp add` is already there.

`/mcp__gilb__agent` starts the chat as Kai-Zen and gives Claude the agent's standing instructions. Ask it to work the plan in the vault you named.

- `gilb_agent` switches the agent (any tag the platform lists, for example `Agent.Jackfruit`) and returns that agent's standing, so the model can follow it.
- `gilb_task` sets the person's request. The platform loads standing from that text.

A hand-off to another agent runs as a nested `claude` on your Claude subscription: its own tools, one level only, up to four at a time, each at most 15 minutes.

## Claudian

Claudian runs Claude Code. It reads the same Claude Code MCP configuration, so the `claude mcp add` line above is the Claudian install too. There is nothing else to add inside Obsidian. Open a Claudian chat and use `/mcp__gilb__agent` the same way.

## What it can do

- Work a Kai-Zen Planguage plan, or hand that work to Agent Jackfruit or another listed agent, in the vaults you named.
- Call the tools the platform gives that agent (the list it returns, unchanged — listing vaults, listing and reading records, running a named role, and the rest).
- Run each hand-off as Claude Code on this computer, on your Claude subscription, not on an API key.

## What it cannot do

- It cannot create a vault yet. A platform switch, one per computer, is coming. Until that ships, create the vault in GilbApp and pass its id with `--vault`.
- It cannot sign in if this computer was never approved. Run `gilb-computer add`, approve it in GilbApp, and restart Claude Code.
- It will not run a hand-off on an API key. Those variables are removed from the nested Claude Code process, and a run that is not your Claude subscription is stopped.
- A hand-off cannot hand off again.

## Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--agent` | `Kai-Zen` | Agent tag for this process |
| `--origin` | `https://id.gilb.com` | GilbPlatform door. The computer sign-in is bound to this host. |
| `--vault` | none | Vault id. Repeat the flag for more than one. |
| `--profile` | this computer's profile | Computer profile name |
| `--claude` | `claude` | Claude Code CLI used for a hand-off |

The same settings can be given as `GILB_CONNECTOR_AGENT`, `GILB_CONNECTOR_ORIGIN`, `GILB_CONNECTOR_VAULT` (comma-separated), `GILB_CONNECTOR_PROFILE`, and `GILB_CONNECTOR_CLAUDE`.

## Build

`src/connector.ts` is the source. `npm run build:connector` writes `connector/gilb-connector.mjs`. That built file is committed, because a person runs it as it is. A test fails if the committed file differs from a fresh build.

Package: `@kaigilb/gilbplatformcode-gilb-connector`
