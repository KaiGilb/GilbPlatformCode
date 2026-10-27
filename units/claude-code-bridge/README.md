# claude-code-bridge

A local-only bridge that lets a web app's agent pane talk to the Claude Code installed and logged in on the person's own computer, plus the Vite plugin that serves it from the app.

## What this is

A small Node program, run by the person on their own computer and accepting connections only from that computer, that carries a web app's agent-pane chat to the Claude Code installed there, with the Vite plugin the host app uses to serve it as a download.

**It is LOCAL-ONLY.** Its job is a process on the person's own computer that must accept connections only from that computer (RuleGpcunitHostAgnostic, local-only unit). That is why its source names the loopback address `127.0.0.1` and treats `localhost` as loopback. See "Do not".

- `bridge/bridge.mjs` is one file with zero dependencies, Node 18 or newer. The person downloads it and runs it. For each chat turn it starts the person's own official `claude` CLI as a child process (headless, stream-json).
- It never reads, copies or forwards a Claude login token, and holds no Anthropic API key. Billing is the person's Claude subscription, always: billing variables are removed from every child's environment, `claude auth status` must say "logged in with a Claude subscription" before it starts, and a turn is stopped if the CLI reports an API-key source.
- It listens on `127.0.0.1` only (default port 47821), refuses a request whose `Host` is not loopback, answers only browser origins on its allow-list, and needs a pairing secret that is first handed over by a short code printed in the person's terminal. Pairings are kept as hashes for 30 days, sliding.
- Tools of the host app reach Claude Code as an MCP server the bridge hosts for the length of one turn. A tool call is relayed to the app's page and run from there, so no token of the host reaches this process. Claude Code's built-in tools (shell, files, web) are switched off for these turns.
- A hand-off to another agent runs as a nested turn of the same kind, one level, one at a time, sharing the turn's budget of tool calls.
- Commands the person runs: `--install` (macOS login item), `--uninstall`, `--status`, `--code`, `--unpair-all`, `--allow-origin <origin>` (repeatable), `--port`, `--claude`, `--state-dir`, `--label`.
- `bridge/vite-plugin.mjs` is `claudeCodeBridgeFile({ defaultAllowedOrigins })`: it serves `<base>claude-code-bridge.mjs` in dev and emits it into the build, with the host's origins written into the one `DEFAULT_ALLOWED_ORIGINS` line.

The source is TypeScript in `src/`. The files in `bridge/` are built from it (`npm run build:bridge`) and committed, because a person runs the file as it is. A test fails if the committed files differ from a fresh build.

## What this is not

- Not the page side. The client that pairs with the bridge, runs a turn and relays tool calls, and the Connect component, are other units. This one is the process on the person's computer and the plugin that serves it.
- Not a server. Nothing here runs on a host; no vault, no token and no key of the host is ever held.
- Not an Anthropic API client. It cannot run on an API key.
- Not Windows or Linux service support. `--install` writes a macOS LaunchAgent; running the file in a terminal works wherever Node and `claude` do.
- Not exported from the package root: there is no browser-safe code in it, so the package has no `.` entry. It exports `./bridge.mjs`, `./vite` (with types) and `./fake-claude.mjs`.

## How to take it

Package: `@kaigilb/gilbplatformcode-claude-code-bridge`

Take it as a packed copy: from a clone of this repository at a commit, pack the unit and keep the packed file in the app's repository, so every install gets the same bytes with no network fetch.

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <app>/vendor/gilbplatformcode-claude-code-bridge
cd units/claude-code-bridge && npm pack --pack-destination <app>/vendor/gilbplatformcode-claude-code-bridge
echo <commit> > <app>/vendor/gilbplatformcode-claude-code-bridge/SOURCE
cd <app> && npm install --save-dev ./vendor/gilbplatformcode-claude-code-bridge/kaigilb-gilbplatformcode-claude-code-bridge-0.1.0.tgz
```

The plugin runs in the app's `vite.config.ts` (Node), so a dev dependency is enough. `vite` 5 or newer is a peer of the plugin, which the app already has. To publish the bridge without Vite, serve `node_modules/@kaigilb/gilbplatformcode-claude-code-bridge/bridge/bridge.mjs` yourself, but then it carries no default origins and every person must pass `--allow-origin`.

## Examples

The host's `vite.config.ts` names its own origins:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { claudeCodeBridgeFile } from "@kaigilb/gilbplatformcode-claude-code-bridge/vite";

export default defineConfig({
  plugins: [
    react(),
    claudeCodeBridgeFile({ defaultAllowedOrigins: ["http://localhost:5197", "https://app.example.test"] }),
  ],
});
```

Each origin must be `https://host[:port]`, or `http://` for `localhost`, `127.0.0.1` or `[::1]`, written the plain way (lower case, no default port, no trailing slash, no path, no wildcard). A bad one, or a bridge file without the one `export const DEFAULT_ALLOWED_ORIGINS = [];` line, stops the build or the dev server with an error.

What the person types (the app's Connect step shows these with its own address):

```sh
# download it, then run it in a terminal that stays open
curl -fsSL https://app.example.test/claude-code-bridge.mjs -o ~/.gilb-claude-code-bridge.mjs
node ~/.gilb-claude-code-bridge.mjs

# always on, macOS: a login item, no window (checks the subscription login first)
node ~/.gilb-claude-code-bridge.mjs --install

# show the pairing code again; see whether it is running; remove it
node ~/.gilb-claude-code-bridge.mjs --code
node ~/.gilb-claude-code-bridge.mjs --status
node ~/.gilb-claude-code-bridge.mjs --uninstall

# allow one more app origin, for this run (with --install: kept in the login item)
node ~/.gilb-claude-code-bridge.mjs --allow-origin https://other.example.test
```

The same list can come from the environment: `GILB_BRIDGE_ALLOW_ORIGINS=https://a.example.test,https://b.example.test`.

In tests, `@kaigilb/gilbplatformcode-claude-code-bridge/fake-claude.mjs` is a stand-in for the `claude` CLI (pass it as `claudeBin` / `--claude`).

## What the host must supply

- The origins its pages are served from: `defaultAllowedOrigins`. The bridge ships with none.
- The place the file is served from (the plugin does this under Vite's `base`), and the commands the person types, with the app's own address.
- The page side that pairs with the bridge and relays tool calls. Not in this unit.
- A person with Node 18 or newer and Claude Code logged in with a Claude subscription.

## Do not

- Do not add a vault host, a person, a store, a key or a default origin to `src/`. `npm run check:host-agnostic` refuses `gilb.com`, `veda.` and `w3id.org` in `src/` and in the built `bridge/`. Pass origins through the plugin.
- Do not take the loopback address out. The source names `127.0.0.1` and `localhost` on purpose: the bridge must accept connections only from the person's own computer, it checks the `Host` header against exactly those two names against DNS rebinding, and it tells the MCP server where it listens. That binding is its security property, so the host cannot pass it in. The check script allows exactly these two literals and nothing else.
- Do not add a way to allow "any origin". There is none, and the origin check refuses a wildcard.
- Do not change the names a person can see: `~/.gilb-claude-code-bridge.mjs`, the login item label `com.gilb.claude-code-bridge`, the MCP server name `gilb`, port 47821. Bridges already installed on people's computers use them.
- Do not edit `bridge/bridge.mjs` or `bridge/vite-plugin.mjs` by hand. Edit `src/` and run `npm run build:bridge`.
- Do not fix or tidy behaviour here while it is an extraction (RuleGpcunitSameBehaviour). A fix is its own change.

## Wrong readings

- "The default allow-list is empty, so the bridge allows every origin." No. An empty list allows none. A page is refused until the plugin's `defaultAllowedOrigins` or `--allow-origin` names it. Requests with no `Origin` (curl, tests) are not browsers and are not refused by this check; they still need the pairing secret.
- "The tests prove it works with the real `claude`." No. The tests run the bridge against `fake-claude.mjs`, a stand-in. The live `claude` CLI is checked by hand.
- "`localhost` in the source is a host the unit has hard-coded." It is the loopback name, allowed on purpose. See "Do not".
- "The package root exports the bridge." It does not. Import `./bridge.mjs` or `./vite`.
- "`bridge/allowed-origins.json` still exists." It does not in this unit. The loader still reads that file next to `bridge.mjs` if a person puts one there (behaviour kept from the source), and otherwise uses the built-in list.

## Where it came from

Repository `KaiGilb/gilb-claude-code`, path `bridge/`, tag v0.2.0, commit `3b032c0c6710faa8d24c5fd4848d82e6d5c73c3e`: `bridge.mjs`, `vite-plugin.mjs`, `vite-plugin.d.mts` and `test/` (bridge, service, pairing-persist, vite-plugin, fake-claude). Earlier, GilbApp `tools/claude-code-bridge/`.

Changed on the way in, and only this: the source is TypeScript (type annotations; the build removes them again); the built-in `DEFAULT_ALLOWED_ORIGINS` is `[]` where v0.2.0 listed two Gilb origins, and `bridge/allowed-origins.json` is not carried; `claudeCodeBridgeFile` takes `defaultAllowedOrigins` and writes them into that one line; two comments that named the Gilb defaults. Tests: the two that asserted the default equals the Gilb origins or `allowed-origins.json` now assert the default is empty, one that listed the defaults next to an added origin now expects the added origin alone, and Gilb host names used as inputs are `*.example.test`.
