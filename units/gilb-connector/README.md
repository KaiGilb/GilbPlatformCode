# gilb-connector

A stdio MCP server. Claude Code — in a terminal, or inside Obsidian through Claudian — uses it to work as Kai-Zen, Agent Jackfruit, and the other GilbPlatform agents, on GilbPlatform vaults. By default it signs in as its own Connected AI. A person has a user vault. An AI has its own user vault. Permissions are granted to that AI vault.

The file a person runs is `connector/gilb-connector.mjs`: one file, no npm dependencies, Node 18 or newer. stdout is protocol only. Logs go to stderr.

## Install

Download the file from the app that serves it:

```sh
curl -fsSL '<your app>/gilb-connector.mjs' -o ~/.gilb-connector.mjs
```

Or copy `connector/gilb-connector.mjs` to `~/.gilb-connector.mjs`. Then:

```sh
claude mcp add gilb -- node ~/.gilb-connector.mjs
```

The first run creates this AI's key under `~/.gilb-connector/` (the directory is private to you, and the key file is readable only by you) and prints its Agent client id on stderr. Registration is not access. In GilbApp:

1. Open your vault.
2. Open **Connect AI**.
3. **Mint AI vault** (any name).
4. Paste this Agent client id. **Bind AI**.
5. Grant the AI vault **Read** and **Write** on the vaults it should work in.

Call any tool again after that. Until the AI is bound and granted, every tool answers with those steps and the Agent client id. `gilb_whoami` reports the client id, the mode (`ai`), and the principal the door has reported.

Repeat `--vault` for each vault the AI should start in. The id is that vault's address (it starts with `https`). The connector keeps one platform turn for the life of the process. The AI's sign-in stays in memory and renews itself. It is not written to disk.

The server name is `gilb`, so Claude Code's slash command is `/mcp__gilb__agent`.

## Serve it from your app

```ts
import { gilbConnectorFile, connectorInstallCommands } from "@kaigilb/gilbplatformcode-gilb-connector/vite";
```

```ts
plugins: [gilbConnectorFile()]
```

In dev it answers `<base>gilb-connector.mjs`. `<base>` is Vite's base. A build emits `gilb-connector.mjs` next to the other assets. The bytes are the connector file, unchanged.

`connectorInstallCommands(url)` gives the two lines a guide shows: the curl download, and `claude mcp add gilb -- node ~/.gilb-connector.mjs`.

## Sign in as this computer

`--as me` is the alternative: this computer's own Gilb sign-in, not an AI vault. It does not create a key under `~/.gilb-connector/` and it does not register an AI client.

```sh
gilb-computer add
claude mcp add gilb -- node ~/.gilb-connector.mjs --as me --vault <your vault>
```

`gilb-computer add` asks you to approve this computer once in GilbApp. Restart Claude Code after you approve it. Until then, every tool answers that this computer is not connected yet.

## Terminal

Start `claude` in a terminal. The `gilb` server from `claude mcp add` is already there.

`/mcp__gilb__agent` starts the chat as Kai-Zen and gives Claude the agent's standing instructions. Ask it to work the plan in the vault you named.

- `gilb_whoami` reports the Agent client id, the mode, and the principal the door has reported.
- `gilb_agent` switches the agent (any tag the platform lists, for example `Agent.Jackfruit`) and returns that agent's standing, so the model can follow it.
- `gilb_task` sets the person's request. The platform loads standing from that text.

A hand-off to another agent runs as a nested `claude` on your Claude subscription: its own tools, one level only, up to four at a time, each at most 15 minutes. The nested connector gets the same `--as` and `--profile`, so it uses the same AI identity.

## Claudian

Claudian runs Claude Code. It reads the same Claude Code MCP configuration, so the `claude mcp add` line above is the Claudian install too. There is nothing else to add inside Obsidian. Open a Claudian chat and use `/mcp__gilb__agent` the same way.

## What it can do

- Work a Kai-Zen Planguage plan, or hand that work to Agent Jackfruit or another listed agent, in the vaults you named and granted to the AI vault.
- Call the tools the platform gives that agent (the list it returns, unchanged — listing vaults, listing and reading records, running a named role, and the rest).
- Run each hand-off as Claude Code on this computer, on your Claude subscription, not on an API key.

## What it cannot do

- It cannot create a vault yet — a person will be able to grant an AI vault the right to create vaults. Until then, create the vault in GilbApp and pass its id with `--vault`.
- It cannot reach a vault the AI vault was not granted. Grant the AI vault Read and Write on that vault in GilbApp (the vault chip, not the person chip).
- With `--as me`, it cannot sign in if this computer was never approved. Run `gilb-computer add`, approve it in GilbApp, and restart Claude Code.
- It will not run a hand-off on an API key. Those variables are removed from the nested Claude Code process, and a run that is not your Claude subscription is stopped.
- A hand-off cannot hand off again.

## Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--as` | `ai` | `ai` signs in as this Connected AI. `me` signs in as this computer. |
| `--name` | `Claude Code on <this machine's name>` | Display name sent when the AI client is registered. |
| `--agent` | `Kai-Zen` | Agent tag for this process |
| `--origin` | `https://id.gilb.com` | GilbPlatform door. |
| `--vault` | none | Vault id. Repeat the flag for more than one. |
| `--profile` | `default` for an AI; this computer's profile for `--as me` | Which AI key to use, or which computer profile. |
| `--claude` | `claude` | Claude Code CLI used for a hand-off |

The same settings can be given as `GILB_CONNECTOR_AS`, `GILB_CONNECTOR_NAME`, `GILB_CONNECTOR_AGENT`, `GILB_CONNECTOR_ORIGIN`, `GILB_CONNECTOR_VAULT` (comma-separated), `GILB_CONNECTOR_PROFILE`, and `GILB_CONNECTOR_CLAUDE`.

## Build

`src/connector.ts` is the source. `npm run build:connector` writes `connector/gilb-connector.mjs`. That built file is committed, because a person runs it as it is. A test fails if the committed file differs from a fresh build.

Package: `@kaigilb/gilbplatformcode-gilb-connector`
