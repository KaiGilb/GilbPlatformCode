# claude-code-connect

The Connect-Claude-Code view for an app: a button that walks the person through starting the local bridge, typing the short code, and pairing, plus a small badge that shows "connected" with Disconnect.

## What this is

React components and one stylesheet. View only: it shows the steps and calls a client the host built; it writes nothing itself.

- `ClaudeCodeConnect` takes `client`, `commands`, `onConnected`, and optionally `onError` and `Button`. It opens on the instruction step with the commands to paste in Terminal and a Copy button for each, checks for a bridge on the person's computer, asks for the code, and calls `onConnected(readback)` once after the right code is typed and the secret is kept. The code field and Pair are always shown, whatever the bridge check said; when the check finds no bridge it also shows the start command and a Check again button that looks again without clearing what was typed.
- On the Mac tab, section 1 starts with the supported browsers (`SUPPORTED_BROWSERS`: Chrome, Edge, Safari) and the ones that cannot connect yet (`NOT_YET_BROWSERS`: Brave). Chrome and Edge pass directly (measured on a Mac, 2026-11-05); Safari works through the bridge window (below); Linux and Windows show no browser item. The Mac item also says the browser may ask to let the page use apps and devices on the network, and to choose Allow; the not-reachable hint in step 3 (Mac and Linux) repeats it and says what to do after Block.
- Step 3, when the bridge check fails (Mac and Linux): in Safari only (see `isRelayBrowser`), a block (`claude-code-relay`) says Safari only reaches the bridge through a small window, with an Open bridge window button (`claude-code-relay-open`). The click calls `client.openRelay()` as its first statement, because the browser only allows the pop-up inside the click. True runs the same check as Check again and the block goes; false shows `claude-code-relay-failed` (allow pop-ups, or update an older bridge). While the window is opening the button is disabled and reads "Opening…". In a relay browser the generic not-reachable hint and its Allow sentence are not shown, only this block, which also tells the person to paste the Option Always On command from step 2 again if the window cannot connect (0.1.9).
- `ClaudeCodeRelayButton` takes `client`, and optionally `Button`, `onOpened()`, `onFailed(message)` and `relayBrowser`. For the chat header, after pairing. In any browser that is not Safari-family WebKit it renders nothing and never calls `client.directBlocked()` (a stopped bridge looks the same as a blocked one, so only Safari may use it). It renders nothing while `client.relayState()` is `"open"`, and nothing unless `client.directBlocked()` (checked once on mount) is true. Then it shows "Safari needs the bridge window for Claude Code." with an Open bridge window button (`claude-code-relay-bar`, `claude-code-relay-bar-open`). When the person closes the window it checks `directBlocked()` again and comes back if needed. Without `onFailed` the failure text shows inline.
- `isRelayBrowser(userAgent)` is true only for Safari-family WebKit (AppleWebKit without Chrome, Chromium, CriOS, Edg, EdgiOS, Firefox, FxiOS, OPR, Opera, Brave, Vivaldi or Arc). It is a display hint, not security. `ClaudeCodeConnect` and `ClaudeCodeRelayButton` read `navigator.userAgent` at render; the optional `relayBrowser` prop overrides it (tests, hosts).
- Measured: the relay in the person's real Safari 26.5 with a spike (2026-11-07), and the real client and bridge relay in Playwright WebKit (pair, a full turn, Stop). A person has not yet paired through the real relay.
- `ClaudeCodeBadge` takes `onDisconnect`, and optionally `label` and `disconnectTestId`. It shows the provider name and a Disconnect button.
- `claude-code.css` styles both through `--gcc-*` variables with plain fallbacks.
- Exports: `ClaudeCodeConnect`, `SUPPORTED_BROWSERS`, `NOT_YET_BROWSERS`, `ClaudeCodeConnectProps`, `ClaudeCodeButtonProps`, `ClaudeCodeBadge`, `ClaudeCodeBadgeProps`, `ClaudeCodeRelayButton`, `ClaudeCodeRelayButtonProps`, `isRelayBrowser`.

It needs the `claude-code-client` unit (0.1.5 or newer, for `openRelay`) as a peer: it uses that unit's `ClaudeCodeClient` type, `BridgeCommands` type and `ClaudeCodeBridgeError` class, and the client it is handed must come from the same copy.

## What this is not

- Not the client. Pairing, the secret, probing and chat turns are the `claude-code-client` unit.
- Not the bridge. The local process is the `claude-code-bridge` unit.
- Not a sign-in or a chat screen. It only connects.
- Not a store. It keeps nothing; the client keeps the pairing secret.

## How to take it

Package: `@kaigilb/gilbplatformcode-claude-code-connect`

Take it as a packed copy, together with the client unit it needs as a peer. From a clone of this repository at a commit, pack both and keep the packed files in the app's repository.

```sh
git clone https://github.com/KaiGilb/GilbPlatformCode.git
cd GilbPlatformCode && git checkout <commit>
mkdir -p <app>/vendor/gilbplatformcode-claude-code-client <app>/vendor/gilbplatformcode-claude-code-connect
(cd units/claude-code-client && npm pack --pack-destination <app>/vendor/gilbplatformcode-claude-code-client)
(cd units/claude-code-connect && npm pack --pack-destination <app>/vendor/gilbplatformcode-claude-code-connect)
echo <commit> > <app>/vendor/gilbplatformcode-claude-code-connect/SOURCE
cd <app> && npm install ./vendor/gilbplatformcode-claude-code-client/kaigilb-gilbplatformcode-claude-code-client-0.1.0.tgz ./vendor/gilbplatformcode-claude-code-connect/kaigilb-gilbplatformcode-claude-code-connect-0.1.0.tgz
```

The client is a peer dependency, not a dependency, on purpose: `instanceof ClaudeCodeBridgeError` only works when the app and this unit share one copy. Install both in the same command. The package ships TypeScript source and the stylesheet (`src/`); the host's bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { createClaudeCodeClient, bridgeCommands } from "@kaigilb/gilbplatformcode-claude-code-client";
import { ClaudeCodeConnect, ClaudeCodeBadge } from "@kaigilb/gilbplatformcode-claude-code-connect";
import "@kaigilb/gilbplatformcode-claude-code-connect/claude-code.css";

const client = createClaudeCodeClient({ principal, platformOrigin, bridgeUrl, getAuthHeaders });
const commands = bridgeCommands({ origin: location.origin, basePath: "/", allowOrigin: location.origin });

<ClaudeCodeConnect client={client} commands={commands} onConnected={(r) => setConnected(r.connected)} />;
<ClaudeCodeBadge onDisconnect={() => client.disconnect()} />;
```

## What the host must supply

- `client`: a client from the `claude-code-client` unit, created with the host's own auth (`getAuthHeaders`), `platformOrigin`, `principal` and `bridgeUrl`.
- `commands`: the result of `bridgeCommands(...)` from the same unit.
- `onConnected`: what the app does once paired.
- Optionally `supportedBrowsers` and `notYetBrowsers` (lists of browser names; default to the exported constants; an empty `notYetBrowsers` drops the "cannot connect" sentence), `onError` (to show errors elsewhere) and `Button` (the app's own button, same props as a `<button>` plus `variant: "primary" | "ghost"`).
- The CSS variables, if the defaults do not suit (each has a fallback): `--gcc-accent`, `--gcc-accent-ink`, `--gcc-error`, `--gcc-focus`, `--gcc-ink`, `--gcc-ink-faint`, `--gcc-ink-soft`, `--gcc-line`, `--gcc-radius`, `--gcc-surface`. Import `claude-code.css` once.
- React 19, and the `claude-code-client` unit installed beside this one.

## Do not

- Do not list the client under this unit's `dependencies` or give the app a second copy of the client: the error class would no longer match.
- Do not name a vault host, store, person or key in the unit's source; the host passes them in.
- Do not fix or restyle in the unit as a side effect of taking it; a fix is its own change.

## Wrong readings

- "It pairs by itself." The client pairs; this only asks for the code and calls it.
- "It is the bridge's UI." It runs in the app's page, not on the person's computer.
- "Installing it alone works." Without the client unit installed the package manager warns of a missing peer and the import fails.

## Where it came from

`KaiGilb/gilb-claude-code` at commit 3b032c0c (v0.2.0): `src/react/ClaudeCodeConnect.tsx`, `src/react/ClaudeCodeBadge.tsx`, `src/claude-code.css`, `src/react/ClaudeCodeConnect.test.tsx` and `test-setup.ts`. Only the import paths changed (the client now comes from its package); one test line passes `bridgeUrl`, which the client unit now requires of the host.
