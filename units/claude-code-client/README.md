# claude-code-client

The page side of the person's own Claude Code as an app's agent: it pairs with the local bridge, runs a chat turn through it, and relays the tool calls Claude Code makes to the host's platform as the signed-in person.

## What this is

Plain TypeScript, no React, no runtime dependency. `createClaudeCodeClient(config)` returns a client for one signed-in person (the "principal"):

- `probe()` says whether a bridge answers on the person's computer. `pair(code)` trades the short code the bridge printed in the person's terminal for a secret and keeps it; `requestSecret(code)` does the trade without keeping it; `save`, `load`, `readConnected` and `disconnect()` handle the kept secret. `disconnect()` also asks the bridge, best effort, to forget it.
- `sendTurn(messages, opts)` runs one chat turn. First it asks the host's platform to compose the turn (`POST <platformOrigin>/base/ai/claude-code/context`: system prompt and tool list). It hands them to the bridge and streams the answer. When Claude Code calls a tool, the bridge asks this page to run it, and the page sends it to the platform (`POST <platformOrigin>/base/ai/claude-code/tool`) with the host's own sign-in, as the person. A hand-off to another agent comes back as a nested turn on the same bridge.
- `bridgeCommands({ origin, basePath?, bridgeFileUrl?, allowOrigin? })` builds the three lines the person pastes in Terminal (start, install, show the code). `BRIDGE_FILE_NAME` and `BRIDGE_LOCAL_PATH` are the served file name and the place it lives on the person's computer. From 0.1.6 the result also has `windows: { start, install, code }`, the same three lines for PowerShell: `curl.exe -fsSL <url> -o "$HOME\.gilb-claude-code-bridge.mjs"; if ($?) { node "$HOME\.gilb-claude-code-bridge.mjs"[ --install][ --allow-origin <origin>] }` and `node "$HOME\.gilb-claude-code-bridge.mjs" --code`. They run in Windows PowerShell 5.1 (`powershell.exe`: `curl` there is an alias of Invoke-WebRequest, and there is no `&&`) and in PowerShell 7 (`pwsh`). Proof: `.github/workflows/claude-code-windows-commands.yml` runs the exact strings in both on GitHub's `windows-latest` runners, against the Windows bridge; no person has tried them on a Windows PC.
- Errors: `ClaudeCodeBridgeError` (status 0 = no bridge reachable on this computer) and `ClaudeCodePlatformError` (the platform refused).

**It relays vault tool calls that can WRITE, as the signed-in person.** Whatever tools the platform lists for the turn, Claude Code can call them, and the page runs each one with the host's sign-in. Taking this unit means the host accepts that.

**The pairing secret is kept in the `storage` the host gives, by default the browser's `localStorage`** (this origin only; every tab and restart shares it), under the key `<storageNamespace>.claude-code-bridge.<principal>`, with the namespace defaulting to `gilb`. If there is no `localStorage` and no `storage` is given, nothing is kept. The secret is sent only to the bridge. Nothing is written to any vault. No Claude login token is ever seen here.

## What this is not

- Not the bridge. The process on the person's computer and the Vite plugin that serves it are the `claude-code-bridge` unit. This unit only talks to it.
- Not a Connect screen or any other component. Showing the pairing steps is another unit.
- Not a platform. The two routes it calls (`/base/ai/claude-code/context` and `/tool`) must exist on the host's platform.
- Not a way around the host's sign-in: every platform request goes through `getAuthHeaders`.
- Not an Anthropic API client. It cannot run on an API key.

## How to take it

Package: `@kaigilb/gilbplatformcode-claude-code-client`

Take it as a packed copy: from a clone of this repository at a commit, pack the unit and keep the packed file in the app's repository, so every install gets the same bytes with no network fetch.

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <app>/vendor/gilbplatformcode-claude-code-client
cd units/claude-code-client && npm pack --pack-destination <app>/vendor/gilbplatformcode-claude-code-client
echo <commit> > <app>/vendor/gilbplatformcode-claude-code-client/SOURCE
cd <app> && npm install ./vendor/gilbplatformcode-claude-code-client/kaigilb-gilbplatformcode-claude-code-client-0.1.0.tgz
```

The package ships TypeScript source (`src/`); the host's bundler compiles it. The unit's own tests use the `claude-code-bridge` unit as a dev dependency; the host does not need it for this unit.

## Examples

```ts
import { createClaudeCodeClient, bridgeCommands } from "@kaigilb/gilbplatformcode-claude-code-client";

const client = createClaudeCodeClient({
  principal: "https://person.example.test/base",
  platformOrigin: "https://platform.example.test",
  bridgeUrl: "http://127.0.0.1:47821", // the bridge's loopback URL; see the bridge unit's README
  getAuthHeaders: async (method, url) => ({ authorization: "DPoP ...", dpop: await proofFor(method, url) }),
  invalidateAuth: () => dropCachedProof(),
  storageNamespace: "myapp",
});

if (await client.probe()) {
  await client.pair("ABC-123"); // the code the person read in their terminal
  const reply = await client.sendTurn([{ role: "user", content: "List my vaults." }], {
    thread: "main",
    onEvent: (ev) => console.log(ev.event),
  });
  console.log(reply.content);
}

const { start } = bridgeCommands({ origin: window.location.origin, basePath: "/", allowOrigin: window.location.origin });
```

## The relay window (for Safari)

Safari blocks an https page's direct fetch to `http://127.0.0.1:<port>` (mixed content). The bridge (0.1.7 and later) serves a small window at `/relay`; the client can talk to the bridge through it by postMessage.

- `openRelay()` opens the window. Call it from a click: it calls `window.open` first, before any await, because popup blockers only allow that inside the click. It resolves true when the window said ready (within 10 s), false when the popup was blocked, the bridge has no `/relay` (an older bridge), or the window closed first.
- `relayState()` is `"closed"`, `"opening"` or `"open"`; `onRelayChange(cb)` reports changes and returns the unsubscribe function; `closeRelay()` closes the window.
- While the window is open, every bridge call (`probe`, `bridgeInfo`, pairing, the turn stream, tool answers, the unpair in `disconnect`) goes through it, never also direct. While it is closed, every call is a direct fetch. One internal function, `bridgeRequest`, decides.
- If the person closes the window, open requests fail with "The Claude Code bridge window was closed. Open it again to go on." Through the relay the unpair in `disconnect` has no `keepalive`: it is sent and a failure is ignored. A relayed request with no answer head in 15 s fails like "not reachable"; a stream has no total timeout.
- `directBlocked()` is true when a direct hello throws a TypeError within 1.5 s while the relay is not open. It cannot tell "the browser blocks this" from "the bridge is not running"; the Connect UI combines it with what else it knows.
- Nothing about the relay is kept. After a page reload the person opens it again with a click.
- Browser proof (not `npm test`): `units/claude-code-bridge/scripts/check-relay-client-browser.mjs`.

## Code mode

With a bridge started with `--workspace <folder>` (bridge 0.2.0), a turn can be a code turn: Claude Code reads, edits and runs commands inside that one folder.

- `bridgeInfo()` also returns `codeTurns` and `workspace`. Both are false when the bridge's hello does not say (an older bridge).
- `workspaceInfo()` returns `{ name, path }` of the bridge's code folder, or null when it has none (a 404), or when you are not connected. It needs the pairing and goes through the relay when that is open.
- `bridgeInfo()` also returns `codeMode`: `"full"`, `"files-only"` (native Windows: the code turn can read and write files but not run commands) or `null` (no folder, or an older bridge).
- `chooseWorkspace(suggest?)` opens the system's own folder dialog on the computer the bridge runs on and waits for the person (the bridge allows up to 5 minutes; through the relay this client waits 5 minutes 30 seconds, a direct fetch has no timer). It returns `{ chosen: false }` when the person cancels, or `{ chosen: true, name, path }`; the bridge keeps the folder. `suggest` (default `MyJackfruitCode`) is only a name for a later `createWorkspace`. A refusal (409 a code turn is running, 422 the folder is not fit, 501 no dialog on this computer) throws a `ClaudeCodeBridgeError` with the bridge's own sentence.
- `createWorkspace(name)` makes `~/<name>` on the bridge's computer without a dialog and keeps it as the code folder: `{ name, path }`. 409 when the folder already has files, 400 for a bad name.
- `bridgeInfo()` also returns `access` (0.3.0): `"folder"` (the default), `"computer"` (the bridge was started with `--full-access`: the code turn runs like Claude Code in the person's terminal, and every request is asked of the person through `onApproval`) or `null` (no folder, or an older bridge). Only the command line of the bridge sets it; this client cannot. Show it plainly when it is `"computer"`.
- `listProjects()` returns `{ name, modified }[]` (the direct subfolders of the bridge's code folder) and `createProject(name)` makes one (bridge 0.3.0). `sendTurn` takes `project` (code mode): the turn runs inside that subfolder, the kept Claude Code session is per project and thread, and the reply carries `project`. Both go through the relay when it is open.
- The reply of a computer-access code turn has `access: "computer"`; other replies leave it out. `files_changed` still lists only the code folder: changes outside it are not listed. `approval_request` carries any `tool` and a `summary` of up to 300 characters, so show them as they come.
- The reply of a files-only code turn has `codeMode: "files-only"`; other replies leave it out. Show it plainly: this turn could not run commands.
- `sendTurn` takes `mode: "code"` (default `"chat"`) and `approval`: `"session"` (default; the person approved once) or `"each-write"` (the bridge asks before each write and each command). A hand-off's nested turn is always a chat turn and never carries either.
- `onApproval(req)` is called with `{ id, tool, summary, detail? }` when the bridge asks (for a command, `summary` is the command and `detail` the model's description). Resolve true to allow. With no `onApproval`, or one that throws or rejects, the answer is no. The turn keeps reading while the person decides. When the bridge closes a question (answered, timed out, the turn ended), the wait for your handler stops and nothing is posted for it, so a handler that never settles cannot hold the turn.
- New events for `onEvent`, code turns only. A malformed one is dropped:
  - `code_activity` `{ tool, summary }`
  - `code_tool_error` `{ tool, summary, text }`
  - `files_changed` `{ added, changed, removed, addedCount, changedCount, removedCount, truncated }`
  - `approval_request` `{ id, tool, summary }` and `approval_done` `{ id, allow }`
- A code turn and a chat turn of one thread keep separate session ids: a code session lives in the code folder and cannot be resumed into the chat one.

## Slipping a message into a running turn

`sendTurn` takes an optional `takeSlipped`. When a top-level tool answer is about to go back to Claude Code, the client calls it and, if it returns messages, appends them after that tool's own result (`slippedSuffix`) and emits a `slipped` event with their ids. The text rides on the next top-level tool answer only: a hand-off's nested turn never takes it. A turn that makes no more tool calls never calls `takeSlipped`; the host then sends the message after the turn.

## What the host must supply

- `principal`: who is signed in. An empty principal is "nobody": nothing connects.
- `platformOrigin`: the platform the two routes live on.
- `getAuthHeaders(method, url)`: the headers (DPoP proof and authorization) for ONE request. Called per request, so a proof is bound to that method and URL.
- `bridgeUrl`: REQUIRED. The bridge's loopback URL on the person's computer, as the bridge unit's README gives it (the bridge listens on its default port 47821 unless started with `--port`). There is no default; leaving it out is a type error and `createClaudeCodeClient` throws `bridgeUrl is required`.
- `invalidateAuth?`: called on a 401 so the host can drop its cached proof before the one retry.
- `storage?`: where the pairing secret is kept (default `localStorage`).
- `storageNamespace?`: the key prefix (default `gilb`). Pass the namespace your app already uses if people are already connected.
- `startCommand?`: the command told to the person when no bridge answers; a string or a function.
- `errorText?`: turns a failed platform response into a sentence.
- For `bridgeCommands`: the app's origin, where it serves the bridge file from, and `allowOrigin` (REQUIRED in practice: the bridge ships with no allowed origins, so without it the bridge refuses the page).

## Do not

- Do not put a vault host, a person, a store, a key or a bridge address in `src/`. `npm run check:host-agnostic` refuses `gilb.com`, `veda.`, `localhost`, `127.0.0.1` and `w3id.org` there. The bridge address comes in as `bridgeUrl`.
- Do not add a default `bridgeUrl` back.
- Do not send the pairing secret anywhere but the bridge, and do not write it to a vault.
- Do not let the page call the platform without `getAuthHeaders`; the bridge must never hold a platform credential.
- Do not fix or tidy behaviour here while it is an extraction (RuleGpcunitSameBehaviour). A fix is its own change.

## Wrong readings

- "It only reads." No. The tools it relays can write, as the signed-in person.
- "The secret lives on the server." No. It is in the page's `storage` (by default `localStorage`) and, hashed, in the bridge.
- "It works without the bridge unit." It needs a running bridge, but not the bridge unit's code: the unit is a dev dependency for the tests only.
- "`bridgeUrl` falls back to the usual address." It did before this unit; it no longer does.
- "The tests prove it works with the real `claude`." No. The end-to-end test runs the real bridge against the bridge unit's `fake-claude.mjs`. The live CLI is checked by hand.

## Where it came from

Repository `KaiGilb/gilb-claude-code`, tag v0.2.0, commit `3b032c0c6710faa8d24c5fd4848d82e6d5c73c3e`: `src/client.ts`, `src/commands.ts`, `src/client.test.ts`, `src/client.e2e.test.ts`, `src/commands.test.ts` and `test-setup.ts`. `src/index.ts` exports the two source files (v0.2.0 also exported the Connect component and badge, which are other units).

Changed on the way in, and only this: `bridgeUrl` is required and `DEFAULT_BRIDGE_URL` is gone (it was `http://127.0.0.1:47821`), with a runtime error when it is missing; two comments that named the loopback address or the Gilb origin are reworded. Tests: import paths now name the bridge unit; tests that relied on the default pass `bridgeUrl`; the test of the default address became a test that `bridgeUrl` is required; Gilb host names used as inputs are `*.example.test`; one `!` for the stricter frame tsconfig; the setup file no longer calls the React test cleanup (no component here).
