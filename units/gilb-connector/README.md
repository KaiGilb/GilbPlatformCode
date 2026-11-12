# gilb-connector

A stdio MCP server. Claude Code — in a terminal, or inside Obsidian through Claudian — uses it to work as Kai-Zen, Jackfruit, and the other GilbPlatform agents, on GilbPlatform vaults. By default it signs in as its own Connected AI. A person has a user vault. An AI has its own user vault. Permissions are granted to that AI vault.

The file a person runs is `connector/gilb-connector.mjs`: one file, no npm dependencies, Node 18 or newer. stdout is protocol only. Logs go to stderr.

## Install

Download the file from the app that serves it:

```sh
curl -fsSL '<your app>/gilb-connector.mjs' -o ~/.gilb-connector.mjs
```

Or copy `connector/gilb-connector.mjs` to `~/.gilb-connector.mjs`. Then:

```sh
claude mcp add --scope user GilbPlatform -- node ~/.gilb-connector.mjs
```

`--scope user` makes it work in every folder, also in Claudian.

If you added it under the old name, remove that entry. The key and the binding are kept:

```sh
claude mcp remove gilb
```

The first run creates this AI's key under `~/.gilb-connector/` (the directory is private to you, and the key file is readable only by you) and prints its Client ID on stderr. Registration is not access. In GilbApp:

1. Open your vault.
2. Open **Connect AI**.
3. Name and mint an AI vault.
4. Paste this Client ID. **Bind AI**.
5. Grant the AI vault **Read** and **Write** on the vaults it should work in.

Call any tool again after Bind, or after a grant. You do not have to restart Claude Code. Until this AI is bound, every tool except whoami tells you to bind it, and the Client ID is on its own line. After it is bound, a vault it cannot read or write is named, and the answer tells you to grant the AI vault. `gilbplatform_whoami` reports the connector version, the client id, the mode (`ai`), the principal, `state: not bound` or `state: bound`, and `vaults:` (the selected vaults, or `none`). Do not choose 'don't ask again' for gilbplatform_use_vault: every vault switch stays the person's decision. A vault you make with create_vault is selected for the session at once; one made inside a hand-off is selected when the hand-off ends. If this AI can reach exactly one vault besides its own, that vault is selected automatically.

Repeat `--vault` for each vault the AI should start in. The id is that vault's address (it starts with `https`). Once this AI is bound, the connector keeps one platform turn for the life of the process. Until then, each call asks the door again. The AI's sign-in stays in memory and renews itself. It is not written to disk.

The server name is `GilbPlatform`, so Claude Code's slash command is `/mcp__GilbPlatform__agent`.

## Serve it from your app

```ts
import { gilbConnectorFile, connectorInstallCommands } from "@kaigilb/gilbplatformcode-gilb-connector/vite";
```

```ts
plugins: [gilbConnectorFile()]
```

In dev it answers `<base>gilb-connector.mjs`. `<base>` is Vite's base. A build emits `gilb-connector.mjs` next to the other assets. The bytes are the connector file, unchanged.

`connectorInstallCommands(url)` gives the two lines a guide shows: the curl download, and `claude mcp add --scope user GilbPlatform -- node ~/.gilb-connector.mjs`.

## Sign in as this computer

`--as me` is the alternative: this computer's own Gilb sign-in, not an AI vault. It does not create a key under `~/.gilb-connector/` and it does not register an AI client.

```sh
gilb-computer add
claude mcp add --scope user GilbPlatform -- node ~/.gilb-connector.mjs --as me --vault <your vault>
```

`gilb-computer add` asks you to approve this computer once in GilbApp. Restart Claude Code after you approve it. Until then, every tool answers that this computer is not connected yet.

## Terminal

Start `claude` in a terminal. The `GilbPlatform` server from `claude mcp add` is already there. Type `use GilbPlatform`.

`/mcp__GilbPlatform__agent` starts the chat as Kai-Zen and gives Claude the agent's standing instructions. Ask it to work the plan in the vault you named.

- `gilbplatform_whoami` reports the connector version, the Client ID, the mode, the principal, whether this AI is bound, and the selected vaults.
- `gilbplatform_use_vault` selects a vault the person named. Claude Code asks the person to allow that call; their yes is what selects it. A vault you make with create_vault is selected for the session at once; one made inside a hand-off is selected when the hand-off ends.
- `gilbplatform_upload_file` uploads one file from this computer into a selected vault and returns its address, sha256 and size. Inputs: `path` (required), `vault` (needed when more than one vault is selected), `folder`, `name`. The vault must be one the person chose: selected with `gilbplatform_use_vault`, named with `--vault`, or made by `create_vault` in this process. A vault the connector picked only because it was the one vault listed is refused until the person selects it. The vault's host must be the origin's parent domain or below it (for `https://id.gilb.com`: `gilb.com` and its subdomains); any other host is refused before the file is opened. The file must sit inside the folder the connector runs in, or a folder given with `--upload-root`. Hidden files and folders (a name starting with a dot), names that look like keys or secrets (any segment, any case, containing apikey, api-key, api_key, password, passwd, secret, credential, token, private, service-account, serviceaccount, wallet, seed-phrase, mnemonic or aws-key; ending .pem .key .p12 .pfx .keystore .jks .npmrc .netrc .asc or .gpg; or `id_*` with no extension, and `id_rsa*`, `id_ed25519*`), any file or folder named `Confidential` (any case) below the root, and links that lead outside are refused before the file is opened. Allowed: png, jpg, jpeg, webp, gif, svg, pdf, txt, md, csv, json; at most 25 MB. The upload is sent once to the vault's own host (a 401 is retried once; nothing else is, so a file is never stored twice). The AI vault needs Write on the vault. The server gives the uploading AI read access to its own file; whether the person can read it depends on their grants on that vault.
- `gilbplatform_agent` switches the agent (any tag the platform lists, for example `Jackfruit`) and returns that agent's standing, so the model can follow it.
- `gilbplatform_task` sets the person's request. The platform loads standing from that text.

When the person names a vault to work in, call gilbplatform_use_vault with the name they used before any other tool on that vault. Do not choose 'don't ask again' for gilbplatform_use_vault: every vault switch stays the person's decision. A vault you make with create_vault is selected for the session at once; one made inside a hand-off is selected when the hand-off ends. If this AI can reach exactly one vault besides its own, that vault is selected automatically.

A long run does not stop at the server's turn limits. When the server answers that a turn has used all its tool rounds, or has handed over as many times as one turn may, it has refused the call before running it. The connector then starts a fresh platform turn and sends the same call once more, and writes one line to stderr. It does this at most 5 times per process (after that the answer says to start a new chat), never for Agent.Concept (its mint limits are per turn and stay a brake), and never inside a hand-off, and never for a `run_named_role` whose role name contains "concept" (Agent.Concept, or a bare Concept the server may resolve to it) or looks like an address, or whose role cannot be read. A hand-off that is already running keeps its own turn.

Connector 0.5.8: gilbplatform_upload_file sends to the vault's own root exactly as the platform listed it (`/vault` for a user vault, `/base` for a system vault) instead of always `/base`, which the vault door refused with 403 for a user vault.

Connector 0.5.9: rides out a GilbPlatform restart: sign-in and reads retry a 5xx or network error for about 60 s, then say the platform is restarting, never 'could not sign in'; a failed sign-in is no longer remembered.

Connector 0.5.10: a hand-off that runs out of time says its writes so far are saved and the rest can be handed over again in smaller parts, instead of 'do not call this hand-off again'.

Connector 0.5.15: planning hand-offs no longer stop after 5 fresh turns (a long chat may start up to 40); your vault choice survives a reconnect (/mcp) in the same chat, but a new chat starts with no vault and a vault picked automatically is never remembered; the Solution and Stakeholder agents get 30 minutes per hand-off.

Connector 0.5.14: reads now ride out a platform restart (they are tried again, then say it is restarting); a write that gets no answer says it may have run and to read it back before sending it again, and is never sent twice; level agents (VDT, Outcome, Architect, Scaling, ValueDeliveryStep) get 30 minutes per hand-off, others 15, and the time-limit note no longer tells an agent to skip required reads.

Connector 0.5.13: publish puts a built folder on https://<name>.pages.dev.

Connector 0.5.12: a hand-off is told its time limit, and one stopped for time returns the calls it made and its last words.

Connector 0.5.11: whoami reports the connector version; a vault made inside a hand-off is selected when the hand-off ends.

Connector 0.5.7: a hand-off that runs out of tool rounds now says its answer is partial, is closed on its own turn, and the next call starts on a fresh turn. Detail: when the server cuts a hand-off, it is closed on its own turn, and its answer carries a `cut` field saying the answer is partial. The next call then starts on a fresh turn (within the same 5-per-process limit, never for Agent.Concept, never inside a hand-off); nothing is re-sent.

A hand-off to another agent runs as a nested `claude` on your Claude subscription: its own tools, one level only, up to four at a time, each at most 15 minutes. The nested connector gets the same `--as` and `--profile`, so it uses the same AI identity.

## Codex

Codex can run hand-offs too. Install:

```sh
codex mcp add GilbPlatform -- node ~/.gilb-connector.mjs --hop-cli codex --name "Codex on <machine>"
```

A hand-off then runs as `codex exec` on your ChatGPT sign-in. Run `codex login` and choose Sign in with ChatGPT first. Before every hand-off the connector asks `codex doctor`, and it refuses the hand-off if Codex is on an API key or the answer cannot be read. Restart Codex after Bind: Codex does not re-read the tool list by default.

The nested Codex gets no shell, no other agents and no web search. `OPENAI_*`, `AZURE_OPENAI_*`, `CODEX_API_*` and `CODEX_API_KEY` are removed from its environment. The default stays Claude Code.

## Claudian

Claudian runs Claude Code. It reads the same Claude Code MCP configuration, so the `claude mcp add` line above is the Claudian install too. There is nothing else to add inside Obsidian. Open a Claudian chat and use `/mcp__GilbPlatform__agent` the same way.

## What it can do

- Work a Kai-Zen Planguage plan, or hand that work to Jackfruit or another listed agent, in the vaults you named and granted to the AI vault.
- Call the tools the platform gives that agent (the list it returns, unchanged — listing vaults, listing and reading records, running a named role, and the rest).
- Run each hand-off as Claude Code on this computer, on your Claude subscription, not on an API key.

## What it cannot do

- It cannot create a vault unless the person allows it. In GilbApp, open the AI vault, open Connect AI, and turn on **This AI may create vaults**. A vault it then creates sits inside the AI vault, the person gets Read, Write and Control on it, and it is selected for the session at once. Without that switch, create the vault in GilbApp, grant the AI vault Read and Write on it, and select it with `gilbplatform_use_vault` (or pass its id with `--vault`).
- It cannot reach a vault the AI vault was not granted. Grant the AI vault Read and Write on that vault in GilbApp (the vault chip, not the person chip).
- With `--as me`, it cannot sign in if this computer was never approved. Run `gilb-computer add`, approve it in GilbApp, and restart Claude Code.
- It will not run a hand-off on an API key. Those variables are removed from the nested Claude Code process, and a run that is not your Claude subscription is stopped.
- A hand-off cannot hand off again.

## Publish an app

The connector is installed, and this AI has signed in once. Then:

```sh
node gilb-connector.mjs publish --dir <built folder> --name <name>
```

That publishes the built folder. The live address is `https://<name>.pages.dev`. `--dry-run` only lists what would be sent.

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
| `--hop-cli` | `claude` | `claude` or `codex`: which CLI runs a hand-off. `codex` runs only on a ChatGPT sign-in. |
| `--codex` | `codex` | Codex CLI used for a hand-off |
| `--upload-root` | the folder the connector runs in | Another folder `gilbplatform_upload_file` may read from. Repeat the flag for more than one. |
| `--hop-model` | none | Model name for a hand-off's Claude Code, passed as `--model` (for example a faster one). 1 to 64 letters, digits, dots or dashes, starting with a letter or digit; anything else is refused at start. Unset: Claude Code's own default. Also `GILB_CONNECTOR_HOP_MODEL`. |

The same settings can be given as `GILB_CONNECTOR_AS`, `GILB_CONNECTOR_NAME`, `GILB_CONNECTOR_AGENT`, `GILB_CONNECTOR_ORIGIN`, `GILB_CONNECTOR_VAULT` (comma-separated), `GILB_CONNECTOR_PROFILE`, `GILB_CONNECTOR_CLAUDE`, `GILB_CONNECTOR_HOP_CLI`, and `GILB_CONNECTOR_CODEX`.

## Build

`src/connector.ts` is the source. `npm run build:connector` writes `connector/gilb-connector.mjs`. That built file is committed, because a person runs it as it is. A test fails if the committed file differs from a fresh build.

Package: `@kaigilb/gilbplatformcode-gilb-connector`
