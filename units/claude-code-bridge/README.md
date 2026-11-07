# claude-code-bridge

A local-only bridge that lets a web app's agent pane talk to the Claude Code installed and logged in on the person's own computer, plus the Vite plugin that serves it from the app.

## What this is

A small Node program, run by the person on their own computer and accepting connections only from that computer, that carries a web app's agent-pane chat to the Claude Code installed there, with the Vite plugin the host app uses to serve it as a download.

**It is LOCAL-ONLY.** Its job is a process on the person's own computer that must accept connections only from that computer (RuleGpcunitHostAgnostic, local-only unit). That is why its source names the loopback address `127.0.0.1` and treats `localhost` as loopback. See "Do not".

- `bridge/bridge.mjs` is one file with zero dependencies, Node 18 or newer. The person downloads it and runs it. For each chat turn it starts the person's own official `claude` CLI as a child process (headless, stream-json).
- It never reads, copies or forwards a Claude login token, and holds no Anthropic API key. Billing is the person's Claude subscription, always: billing variables are removed from every child's environment, `claude auth status` must say "logged in with a Claude subscription" before it starts, and a turn is stopped if the CLI reports an API-key source.
- It listens on `127.0.0.1` only (default port 47821), refuses a request whose `Host` is not loopback, answers only browser origins on its allow-list, and needs a pairing secret that is first handed over by a short code printed in the person's terminal. Pairings are kept as hashes for 30 days, sliding.
- Tools of the host app reach Claude Code as an MCP server the bridge hosts for the length of one turn. A tool call is relayed to the app's page and run from there, so no token of the host reaches this process. Claude Code's built-in tools (shell, files, web) are switched off for these turns.
- A hand-off to another agent runs as a nested turn of the same kind, one level, up to four at a time, sharing the turn's budget of tool calls. `GET /v1/hello` also reports `build`, the package version of this bridge.
- The first time that budget is spent, the person's turn is sent one `budget_spent` event (`{ type: "budget_spent", maxToolCalls }`) and its final `message` carries `budgetSpent: true`.
- A browser origin never contains a quote mark; `--allow-origin 'https://a"b.example'` is refused.
- Commands the person runs: `--install` (macOS login item), `--uninstall`, `--status`, `--code`, `--unpair-all`, `--allow-origin <origin>` (repeatable), `--port`, `--claude`, `--state-dir`, `--label`.
- `bridge/vite-plugin.mjs` is `claudeCodeBridgeFile({ defaultAllowedOrigins })`: it serves `<base>claude-code-bridge.mjs` in dev and emits it into the build, with the host's origins written into the one `DEFAULT_ALLOWED_ORIGINS` line.

The source is TypeScript in `src/`. The files in `bridge/` are built from it (`npm run build:bridge`) and committed, because a person runs the file as it is. A test fails if the committed files differ from a fresh build.

## What this is not

- Not the page side. The client that pairs with the bridge, runs a turn and relays tool calls, and the Connect component, are other units. This one is the process on the person's computer and the plugin that serves it.
- Not a server. Nothing here runs on a host; no vault, no token and no key of the host is ever held.
- Not an Anthropic API client. It cannot run on an API key.
- Not Linux service support. `--install` writes a macOS LaunchAgent, or on Windows a per-user start-up entry (see "Windows"); running the file in a terminal works wherever Node and `claude` do.
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
cd <app> && npm install --save-dev ./vendor/gilbplatformcode-claude-code-bridge/kaigilb-gilbplatformcode-claude-code-bridge-0.1.1.tgz
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

## Windows

What works (0.1.8): one bridge session in a PowerShell window, and Always On (below).

```powershell
curl.exe -fsSL https://app.example.test/claude-code-bridge.mjs -o "$HOME\.gilb-claude-code-bridge.mjs"
node "$HOME\.gilb-claude-code-bridge.mjs"
# in another PowerShell window, to show the pairing code again:
node "$HOME\.gilb-claude-code-bridge.mjs" --code
```

(`curl.exe`, not `curl`: in Windows PowerShell 5.1 `curl` is an alias of `Invoke-WebRequest`.) Ctrl+C stops the bridge (Node delivers SIGINT on Windows; the bridge also handles SIGBREAK and SIGHUP). `--unpair-all` and `--code` work. State is under `%USERPROFILE%\.gilb-claude-code-bridge` (`os.homedir()`).

How `claude` is found: the bridge looks on PATH (split on `;`, extensions from `PATHEXT`: .com .exe .bat .cmd), then `%USERPROFILE%\.local\bin` (Anthropic's installer puts `claude.exe` there), `%APPDATA%\npm` (an npm global install puts `claude.cmd` there) and `%USERPROFILE%\.claude\local`. It never uses a shell.
- A `claude.exe` is started directly.
- A `claude.cmd` written by npm is not run (Node cannot start a `.cmd` without a shell, and a shell would pass text through cmd.exe). The bridge reads the shim and starts what it runs: `claude.exe` itself, or `node` with the script the shim names. A `.cmd` or `.bat` it cannot read that way is refused at start: "Claude Code was found as <path>, which the bridge cannot start safely. Install Claude Code with Anthropic's Windows installer, then start the bridge again."
- If `claude` is not found, the bridge refuses with "Claude Code was not found on this computer. Install Claude Code with Anthropic's Windows installer ...". It never passes the bare name `claude` on to Windows, which would look in the current folder first (a `claude.exe` in a Downloads folder would run). Relative PATH entries such as `.` are ignored.
- The program a `.cmd` shim names must lie inside the shim's own folder tree (after resolving `..`, case-insensitive; no other drive, no UNC path), otherwise the shim is refused with the message above.
- `--claude` may also name a `.js`/`.mjs` file, which is started with node (this is how the tests use the stand-in).
- Stop (and bridge shutdown) ends the whole process tree with the system `taskkill /PID <pid> /T /F`, because on Windows `kill()` ends only one process and leaves what Claude Code started (such as the `gilb` MCP child). Off Windows it is still SIGTERM to `claude`.

Also not handled: a very long system prompt (Windows allows 32,767 characters on a command line).

### Always On (Windows)

```powershell
node "$HOME\.gilb-claude-code-bridge.mjs" --install     # also: --allow-origin https://your-app.example (repeatable)
node "$HOME\.gilb-claude-code-bridge.mjs" --code        # the pairing code
node "$HOME\.gilb-claude-code-bridge.mjs" --status      # installed / running / build / log
node "$HOME\.gilb-claude-code-bridge.mjs" --uninstall   # stop it and remove everything it made
```

It does what the Mac LaunchAgent does: the bridge starts when you log in, with no window, and starts again if it stops. `--install` starts it at once (no logout), checks your Claude subscription login first, and records `--port`, `--claude`, `--state-dir` and every `--allow-origin` you gave. `--label L` installs a second, fully separate one (own start-up entry, launcher, log, state folder and supervisor; it needs its own `--port`, and `--install` refuses a port or a state folder another label already uses). Installing or removing one label never stops another. A label is 1 to 64 letters, digits, dot, dash or underscore, starting with a letter or digit, and is checked by every command. Close a bridge running in a PowerShell window first: only one can hold port 47821 (a second one gives way and says so in the log).

How it works, and what it needs: no administrator rights, and nothing outside your own user account.
- One value under `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run` (your user only; the machine-wide keys are not touched). It runs `wscript.exe //B //Nologo //E:JScript "%LOCALAPPDATA%\gilb-claude-code-bridge\start-<label>.js"`. That small script (UTF-16, so any user name works) starts `node bridge.mjs --supervise ...` with window style 0, so no window opens or flashes (`wscript.exe` has no console, and the Node console it starts is hidden). Paths with spaces, such as `C:\Users\Anna Maria\`, are quoted. A path with a `%` is refused.
- `--supervise` runs the real bridge as a child and starts it again when it ends, after 1 s, 2 s, 5 s, then 30 s; a bridge that stayed up 5 minutes starts the waits over. If a bridge finds port 47821 taken it exits with code 98 and the supervisor stops (it never runs two bridges and never loops on it). If the supervisor itself is killed, the bridge it started ends within 5 seconds instead of running unwatched.
- Why these choices (Microsoft Learn): `schtasks /create` says "Only Administrators can schedule tasks" for system-account tasks and defaults to prompting for a password, and an ONLOGON task is "whenever a user (any user) logs on", so it was not used. The Run key is per-user and needs no rights. `VBScript` is a Windows feature on demand "before being retired in future Windows releases", so the launcher is JScript (also run by `wscript.exe`), not VBScript; `conhost.exe --headless` is not documented by Microsoft, so it is not used. Run values are a command line of at most 260 characters; `--install` refuses a longer one. Windows may delay Run entries a little after login, and Task Manager > Startup apps can switch the entry off (then it does not start at login).
- Where things are: log `%LOCALAPPDATA%\gilb-claude-code-bridge\bridge.log` (another label: `<label>.log`; over 5 MB it moves to `.log.1`); state (pairing list, control token, `status.json`, `supervisor.json`, `supervisor.stop`, `service-owner.json`) in `%USERPROFILE%\.gilb-claude-code-bridge`, and for another label in `%USERPROFILE%\.gilb-claude-code-bridge-<label>` (on a Mac the labels share one state folder; Windows keeps them apart because the control token and status file are per folder).
- `supervisor.json` is never trusted for its pid alone (Windows reuses pids, and the file stays after a crash or power cut). The supervisor rewrites it every second with a random instance id, the label, its bridge's pid and a beat time. A record counts as a running supervisor only if its pid is alive and its beat is recent (or moves while `--install`/`--status` waits 1.6 s); anything else is stale and is replaced. `--install` never asks you to end a process because of a stale record. After `--install` the answer on the port must come from the bridge this supervisor started (its pid in `status.json` equals the supervisor's child), otherwise the install says another bridge holds the port. The log shows the pairing code. `%LOCALAPPDATA%` is inside your profile folder, whose default access rights (inherited, not changed by the bridge) give it to you, SYSTEM and Administrators only; no `icacls` change is made. Other administrators on the same computer can read it.
- `--uninstall` removes the Run value, the launcher and the log of that label, but only what the bridge made: the Run value must hold the exact command `--install` writes and the launcher must carry the bridge's first-line mark, otherwise it says so and leaves them alone. It asks that label's supervisor to stop through the `supervisor.stop` marker (it ends the bridge and itself), and keeps your pairings. If it does not stop within 20 seconds the command says so and names Task Manager; it never ends a process by number.
- The commands use `reg.exe`, `wscript.exe` and Node only, always with an argument list and never through a shell, and no page or user text goes to any of them.

File modes (`0o600`, `0o700`) do nothing useful on Windows; the state folder is private only through the default access rights of the person's user folder.

Proof: `.github/workflows/claude-code-windows.yml` runs the unit tests, `scripts/windows-service-e2e.mjs` (Always On on a real runner: `--install` then hello within 20 s, `--status`, the registry value, `--code`, pair and one turn, `taskkill` of the bridge and it returns within 15 s, the stored start-up command run as Windows runs it, `--uninstall` leaves nothing; once with a home folder `...\Anna Maria`, once as a new standard user in the Users group) and `scripts/windows-e2e.mjs` (the real built bridge as a process, a stand-in claude behind a `.cmd` shim written the way npm writes it, by name on PATH, and as a `.mjs`; pair, one turn, Stop, and a check with `tasklist` that the stand-in's child is gone) on GitHub's `windows-latest` runners with Node 20 and 22. It has not been tried by a person on a Windows PC, and the real `claude.exe` has not been run there.

## Relay window (for Safari)

Safari blocks an https page's fetch to `http://127.0.0.1:47821` as mixed content. So the page can open a small window served by the bridge, `GET /relay`, and talk to it by postMessage; that window's own fetches are same-origin. The person keeps the window open (it can be minimised). It replies only to the page that opened it, and only to an origin on the bridge's allow-list (built-in plus `--allow-origin`), which is embedded in the page. `/v1/hello` reports `relay: true`, so a page can tell a bridge that has it from an older one.

Messages: the page posts `gilb-bridge-req` (`id`, `path`, `method`, `headers`, `body`) and `gilb-bridge-abort` (`id`). The window answers every request first with `gilb-bridge-head` (`id`, `status`, `contentType`). A `text/event-stream` answer then follows as `gilb-bridge-chunk` messages and one `gilb-bridge-end`; any other answer follows as one `gilb-bridge-res` (`status`, `headers`, `body`). A failure, or an abort, is `gilb-bridge-err` (`message`, `"aborted"` after an abort).

Origin rules for a relayed request:
- The relay window sends `Origin` = the bridge's own origin plus `x-gilb-relay-origin` = the opener page. That header must be on the allow-list, else 403. Pairing secrets are then bound to that opener origin, as if the page had called directly.
- `x-gilb-relay-origin` with any other `Origin` (a website calling directly) is 403. Own origin without the header is 403.
- One exception: a same-origin GET carries no `Origin` in a browser, so `GET /v1/hello` with the header and no `Origin` is answered like any Origin-less call (it needs no pairing).
- Relayed answers carry no CORS headers. `/control/*` and `/mcp/*` are unchanged.
- The window only forwards paths under `/v1/`, methods GET and POST, and the headers `content-type`, `x-bridge-secret`, `accept`.

Measured: working in Safari 26.5 with a spike on 2026-11-07 (open, request, streaming, also with the window minimised). The real bridge relay has not yet been tried by a person. Browser proof in WebKit (not part of `npm test`): `npm i --no-save playwright@1.60`, then `PLAYWRIGHT_BROWSERS_PATH=<browsers folder> node scripts/check-relay-browser.mjs`.

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

## Changes

- 0.1.1: types tightened; no behaviour change (the built `bridge.mjs` is byte-identical to 0.1.0).
- 0.1.7: relay window (`GET /relay`) for Safari; `/v1/hello` reports `relay: true`; relayed requests take the opener page as their origin.
- 0.1.8: runs on Windows, in one session or Always On (see "Windows"): Windows-aware `resolveBin`, no shell for `claude` (npm `.cmd` shim read, not run), process-tree stop with `taskkill`, PowerShell-correct commands in the banner, SIGBREAK/SIGHUP.
