# claude-code-client

The page side of the person's own Claude Code as an app's agent: it pairs with the local bridge, runs a chat turn through it, and relays the tool calls Claude Code makes to the host's platform as the signed-in person.

## What this is

Plain TypeScript, no React, no runtime dependency. `createClaudeCodeClient(config)` returns a client for one signed-in person (the "principal"):

- `probe()` says whether a bridge answers on the person's computer. `pair(code)` trades the short code the bridge printed in the person's terminal for a secret and keeps it; `requestSecret(code)` does the trade without keeping it; `save`, `load`, `readConnected` and `disconnect()` handle the kept secret. `disconnect()` also asks the bridge, best effort, to forget it.
- `sendTurn(messages, opts)` runs one chat turn. First it asks the host's platform to compose the turn (`POST <platformOrigin>/base/ai/claude-code/context`: system prompt and tool list). It hands them to the bridge and streams the answer. When Claude Code calls a tool, the bridge asks this page to run it, and the page sends it to the platform (`POST <platformOrigin>/base/ai/claude-code/tool`) with the host's own sign-in, as the person. A hand-off to another agent comes back as a nested turn on the same bridge.
- `bridgeCommands({ origin, basePath?, bridgeFileUrl?, allowOrigin? })` builds the three lines the person pastes in Terminal (start, install, show the code). `BRIDGE_FILE_NAME` and `BRIDGE_LOCAL_PATH` are the served file name and the place it lives on the person's computer.
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
