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
- Self-update (optional): `updateOrigin` (an https origin, no path) and `updateKeys` (`[{ id, key }]`, `id` of a-z, 0-9, dash; `key` 32 raw bytes as base64). The plugin writes them into the `UPDATE_ORIGIN` and `UPDATE_KEYS` lines with `injectBridge(source, { allowedOrigins, updateOrigin, updateKeys })`, the one function that decides the served bytes (a signing script can call it too). Leave them out and that build cannot update itself.
- The place the file is served from (the plugin does this under Vite's `base`), and the commands the person types, with the app's own address.
- The page side that pairs with the bridge and relays tool calls. Not in this unit.
- A person with Node 18 or newer and Claude Code logged in with a Claude subscription.

## Windows

What works (0.1.9): one bridge session in a PowerShell window, and Always On (below).

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
- If `claude` is not found, the bridge refuses with "Claude Code is not installed on this computer (the `claude` command was not found). Install Claude Code with Anthropic's Windows installer ...". It never passes the bare name `claude` on to Windows, which would look in the current folder first (a `claude.exe` in a Downloads folder would run). Relative PATH entries such as `.` are ignored.
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

## Code folder (0.2.0; GitHub archives 0.2.1)

Until now every turn ran with Claude Code's own tools off. A **code turn** turns them on, for one folder you choose.

Start the bridge with the folder: `node bridge.mjs --workspace ~/MyJackfruitCode` (with `--install` the folder is kept in the login item), or choose it from chat (see "Choosing the folder from chat"). With no folder there is no code mode and nothing changes.

### Choosing the folder from chat

The folder is kept in the state folder as `workspace.json` `{ "version": 1, "path": "<real path>" }` (mode 0600, written to a temp file and renamed, like the pairings). At start, `--workspace` wins and is stored; otherwise a stored folder is checked with the same rules and used. A stored folder that is no longer fit (deleted, now the home folder) is ignored with a log line: no code mode, and the bridge still runs.

Two paired routes:
- `POST /v1/workspace/choose` `{ suggest? }` opens the system's own folder dialog on this computer and waits up to 5 minutes. macOS: `osascript` (`choose folder`, starting in your home folder). Windows: `powershell.exe` with a fixed script using `FolderBrowserDialog`. Linux: `zenity --file-selection --directory`; without `zenity` the answer is 501 `No folder dialog on this computer. Start the bridge with --workspace <folder>.` The commands are fixed text; no page text goes into them. The person can make a new folder inside the dialog. Cancel: 200 `{ chosen: false }`. A folder that fails the checks above: 422 `{ error }`, nothing stored. Otherwise the bridge stores it, switches to it and answers `{ chosen: true, name, path }`. One dialog at a time (409). Refused while a code turn runs (409 `A code turn is running. Wait for it to finish.`), and a code turn is refused while the dialog is open. `suggest` (1 to 64 letters, digits, spaces, dots, dashes, underscores; default `MyJackfruitCode`) is only checked here; it names the folder the page offers to make with the next route.
- `POST /v1/workspace/create` `{ name }` (same character rule; no space at either end; names of only spaces and dots refused) makes `~/<name>` (mode 0700), checks, stores and switches, and answers `{ name, path }`. An existing empty folder is taken; one with files is 409 `The folder ~/<name> already has files. Choose it with the folder dialog instead.`

`GET /v1/hello` shows the switched folder (`workspace: true|false`) and `codeMode`: `"full"`, `"files-only"` or `null` (no folder).

The folder is checked again at the start of every code turn: its real path must still be the stored one and pass the checks. If not (a symlink swapped in, the folder deleted), the turn is refused with 409 `The code folder changed on disk. Choose it again.`, code mode is off (`hello` says `workspace: false`) and `workspace.json` is left as it is. The child's working folder is that fresh real path.

### Windows: files only

Native Windows has no sandbox for commands, so a code turn there runs a reduced mode: files only. Claude Code gets only `Read, Edit, Write, Glob, Grep` (no Bash, no NotebookEdit), `--restricted`, the same permission flags as the approval chosen, settings with the permission rules but no `sandbox` block, and no npm cache. The init check allows only those five tools. The added system prompt says: "You cannot run commands on this computer: you can only read and write files in this folder. If a step needs a command (install, build, run), tell the person the exact command to run themselves." The `message` event of such a turn has `codeMode: "files-only"`. macOS, Linux and WSL2 run the full mode.

### A sandbox that cannot start

In full mode the sandbox is required (`failIfUnavailable`). Where it cannot start (Linux without bubblewrap, for example) Claude Code exits before it starts; the turn then ends with `Claude Code could not start its sandbox on this computer, so the code turn was stopped.` followed by the last line the CLI wrote to stderr.

The bridge refuses a folder that does not exist (it never makes one), a folder that is not inside your home folder (`The code folder must be inside your home folder, for example ~/MyJackfruitCode.`; system and temp folders fall under this), the root of the disk, your home folder, any folder that holds your home folder, a folder inside `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config`, `~/.claude`, `~/Library` (macOS) or `AppData` (Windows) or inside a bridge state folder (`~/.gilb-claude-code-bridge*`), a folder that holds a bridge state folder, and a folder that directly holds `.ssh`, `.aws` or `.gnupg`. A symlink is followed first, so a link to your home folder is refused too. It prints the reason and exits with code 2.

A page asks for a code turn with `"mode": "code"` in the turn body (`"chat"` or no mode is the old turn; any other value is a 400). `"approval"` is `"session"` (the default) or `"each-write"`, see below. A code turn cannot be a hand-off (400), needs a `--workspace` (409), and only one runs at a time (429, with `code: "CodeTurnRunning"`; see "Running turns").

What a code turn may do:
- Read, edit and write files, and run shell commands, inside the folder. The shell runs in Claude Code's sandbox; the file tools are limited to the folder.
- Reach the network only for the package registries: `registry.npmjs.org`, `registry.yarnpkg.com`, `pypi.org`, `files.pythonhosted.org`; and, since 0.2.1, two GitHub download hosts: `codeload.github.com` (archives of a commit of a public repo) and `raw.githubusercontent.com` (raw files). They are read-only downloads. Still refused: `github.com`, `api.github.com`, git clone/pull/push, private repos (no login is passed). To take a GilbPlatformCode unit at a pinned commit: `curl -fsSL https://codeload.github.com/KaiGilb/GilbPlatformCode/tar.gz/<commit> | tar -xz`, then `cd GilbPlatformCode-<commit>/units/<unit> && npm pack --pack-destination <app>/vendor/<unit>`. The shell's network stays this narrow; the web tools below are Claude Code's own and do not go through the shell.
- Since 0.3.12, use the internet through Claude Code's two web tools. WebSearch runs with no question (it returns search results only). WebFetch is always asked of the person through `bridge_approve`, in both approval settings: the question shows the URL (non-ASCII as `<U+XXXX>`) with a `Host: <punycode>` notice, and `approval_request` carries `scopes: ["once","turn"]`. `POST /v1/approval` takes an optional `scope`: `"once"` (default: this page only) or `"turn"` (every WebFetch for the rest of THIS code turn, any host; ends with the turn and is never carried to a later turn, a hand-off or another pairing). `allow: false` ignores scope; any other scope value is a 400. After a turn grant the display denials still apply (not http or https, user@host form, too long, hidden characters). `approval_done` echoes `{id, allow, scope}` for a WebFetch question. `GET /v1/hello` has `options.web: { search: true, fetch: "ask" }` in folder mode and in computer mode (where every tool is asked); Windows files-only mode has no web tools (`{ search: false, fetch: "off" }`). A WebFetch to this computer or the local network (loopback, link-local, private ranges, `0.0.0.0`, an IP written as a bare decimal, octal or hex number, a one-word host, `.local`, `.internal`) is always asked, once only (`scopes: ["once"]`, notice `Host: <host> \u2014 this computer or your local network`), even after a turn grant. Every WebFetch that runs and every WebSearch sends an `activity` event with the URL (shown with `<U+XXXX>`, the host kept whole when cut) or the query, and counts against the turn's tool budget.
- Read none of the listed secret places: the folders `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config` (this covers `~/.config/gcloud`), `~/.claude`, `~/.docker`, `~/.kube`, `~/.azure`, the bridge state folder, and on macOS the Keychains and the Chrome, Firefox and Safari data; and the files `~/.npmrc`, `~/.yarnrc`, `~/.yarnrc.yml`, `~/.pypirc`, `~/.netrc` and `~/.git-credentials`. Installs from a private npm registry that needs your login do not work in a code turn (your `~/.npmrc` is not readable there).
- A code turn's Claude Code gets only a short list of ordinary environment variables (paths, language, proxy); tokens and keys in your environment are not passed to it.
- npm uses a cache in the folder (`.npm-cache`), because the sandbox does not let it write `~/.npm` or the temp folder.
- Nothing else is allowed to prompt: what would ask is denied (since 0.3.12 a session turn's Claude Code asks the bridge's `bridge_approve`, which refuses everything but a WebFetch). Settings files of the person and of the folder are ignored.
- If Claude Code does not start with exactly these tools and the `acceptEdits` mode, the bridge stops the turn.

Approval. With `"approval": "session"` the person approves once, when they start the code turn, and Claude Code may then edit freely inside the folder. With `"approval": "each-write"` Claude Code asks first: every write (Edit, Write, NotebookEdit) inside the folder and every shell command. The bridge starts Claude Code in its asking mode (`--permission-mode manual`) with `--permission-prompt-tool mcp__gilb__bridge_approve`, and turns off the sandbox's automatic Bash approval. `bridge_approve` is a tool of the bridge's own per-turn MCP server, listed only in these turns; it is never sent to the page and never counts against the tool budget. It answers at once, without asking: Read, Glob and Grep are allowed only inside the folder (Read: `file_path`; Glob and Grep: `path`, absent meaning the folder itself; a Glob pattern that is itself an outside path is refused too); a write, or a read, outside the folder is denied with `Outside the code folder.`. A symlink is followed first, and a symlink that points nowhere counts as outside. Any other tool is denied. For a write inside the folder and for Bash it sends the page an `approval_request` `{ id, tool, summary, detail? }` and waits. For Bash `summary` is the whole command: every line break (LF, CRLF, CR, U+2028, U+2029) is shown as one ` ⏎ ` marker and runs of spaces, tabs and other space separators are one space, and `detail` is the model's own description (at most 200); `activity` events keep the description-first summary and their 300-character cap. An approval question is never cut: the limits count the shown text. The app shows a long request folded; the person can open the whole text, and approving approves all of it. A command over 200000 characters, the relay's practical size, is denied at once ("The command is too long to show for approval; ask for it in smaller steps.") and a path over 1000 likewise ("The path is too long to show for approval."), with no question sent. Any approval text (summary or detail) that contains a hidden or control character is denied at once with no question, with "The request contains hidden or control characters, so it cannot be shown for approval; ask for it without them.": a C0/C1 control other than tab, line feed and carriage return, a Unicode format character (category Cf: bidi controls, zero-width characters, word joiner, BOM, soft hyphen ...) or a blank filler (U+115F, U+1160, U+3164, U+FFA0, U+2800, U+180E). A path with a line break is denied the same way. A combining mark that stays after Unicode NFC normalisation (strike-through, stacked marks) is refused the same way (ordinary accented letters compose and pass; the original text is shown). In a Bash command, a WebFetch URL and a WebSearch query every non-ASCII character is shown as `<U+XXXX>` (so a look-alike letter or a typed `⏎` cannot pass for another character or a line break marker); paths keep their characters. `detail` is only the model's description (capped at 200). The bridge's own lines go in a separate field, `notice` (400 characters at most, never cut), so a description cannot imitate them. For every tool except Bash, WebFetch and WebSearch (Read, Write, Edit, MultiEdit, NotebookEdit, Glob, Grep, MCP tools ...), when a `file_path`, `notebook_path` or `path` field contains any non-ASCII character, `notice` is `Path contains non-ASCII characters: U+0440 U+212A` (each distinct code point once, in order, 20 at most and then ` …`; the path itself is still shown as given). A path-named field on Bash, WebFetch or WebSearch (a stray `file_path` on a Bash input) gets no path note. For a tool the bridge does not know by name (MCP tools, and Glob/Grep in computer mode) the summary is the tool name and its input as JSON with every non-ASCII character in the values shown as `<U+XXXX>` (only `file_path`, `notebook_path` and `path` values keep their characters, and get the path note), checked against the 200000-character limit after escaping (over it: denied, never cut). A WebFetch whose address does not parse, is not http or https, or has no host, is denied at once with no question ("Only http and https addresses can be fetched."). The shown text is escaped from the raw string (no Unicode normalisation for display, so U+212A shows as `<U+212A>`, never as "K"); the combining-mark denial still looks at the normalised form. A tool name that is not 1 to 128 of `A-Za-z0-9_-` is denied before anything is asked, in both modes ("The tool name is not valid."). An input holding a key `__proto__`, `constructor` or `prototype` at any depth is denied ("The request holds a reserved key (__proto__, constructor or prototype); ask for it without that."), and so is an object with two keys that show as the same text ("Two fields in the request look the same; ask for it without that."); the display copy of the input has no prototype, so every own key is shown. Texts cut to a cap (descriptions, activity summaries) are cut by code point, never inside a surrogate pair. For a WebFetch, `notice` is always `Host: <hostname as punycode>`; a URL with `user@` or `user:pass@` is denied at once ("The address hides its real host (user@host form); ask for it without that."), and so is one whose Host line would be over 300 characters or whose notice would be over 400 ("The address is too long to show for approval; ask for it without that."). The page answers with `POST /v1/approval` `{ turnId, id, allow }` (paired; 404 for an unknown turn or question, or for a pairing other than the one that started the turn; 409 if it was already answered). The bridge then sends `approval_done` `{ id, allow }`. A denial reaches Claude Code as "The person declined."; no answer in 10 minutes, or the page leaving the turn, is a denial too ("The person did not answer.").

Every code turn also gets one short added system prompt that names the folder and tells Claude Code to stay inside it, to say in one line what is refused, and to list the files it changed.

Discovery: `GET /v1/hello` has `codeTurns: true`, `workspace: true|false` (never the path) and `codeMode`. `POST /v1/workspace` (paired) returns `{ name, path }`, or 404 when there is no folder.

Extra events in a code turn (a chat turn sends none of them):
- `activity` `{ tool, summary }` for each tool call (not the GilbPlatform tools).
- `tool_error` `{ tool, summary, text }` when such a call failed.
- `files_changed` `{ added, changed, removed, addedCount, changedCount, removedCount, truncated }`, once, before `message` or `error`. It compares the folder before and after the turn (size and time; `.git`, `node_modules` and `.npm-cache` skipped; up to 20000 files; up to 200 names per list).
- `message` has `mode: "code"` (and `codeMode: "files-only"` on Windows).

`scripts/code-mode-probe.mjs` runs one code turn with the real `claude` against throwaway folders and checks that the limits hold; run it by hand after a Claude Code update.

## Projects (0.3.0)

The code folder stays the bridge's folder. A **project** is a direct subfolder of it (for example `~/MyJackfruitCode/hello-gilbapp`), and a code turn may run inside one, in folder mode and in computer mode.

- **Name rule** (`validProjectName`): 1 to 64 characters, letters, digits, dot, dash, underscore, starting with a letter or digit (so never `.` or `..`). Names are unique without regard to case on macOS and Windows. `node_modules` is not a project name, nor are the Windows device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, in any case, with or without an extension such as `nul.txt`), nor a name that ends in a dot or a space: they are refused on every platform.
- `POST /v1/projects` (paired) answers `{ projects: [{ name, modified }] }` (`modified` is an ISO time): the direct subfolders of the code folder that are real directories (a symlink is left out), whose names pass the rule and do not start with `.`, sorted by name, at most 500. 404 `This bridge has no code folder. Start it with --workspace <folder>.` without a code folder.
- `POST /v1/projects/create` (paired) `{ name }` makes `<code folder>/<name>` (mode 0700) and answers `{ name }`. 400 for a bad name, 409 `A project with this name already exists.`, 409 while the folder dialog is open.
- A turn body may carry `project` (a name). It must pass the rule and be a real direct subfolder (not a link), else 400 `No such project.`. Like the code folder, the project is checked after the snapshot and again right before the child starts, by real path and device and inode: if it changed, 409 `The project folder changed on disk.`; and the child's own working folder (its init `cwd`) must be the project's real path and identity. Without `project` a turn runs in the code folder itself, as before. A chat turn ignores `project`.
- **Confinement.** The child starts in the project folder. In folder mode the file and command limits, the `bridge_approve` checks (`Outside the code folder.` also for the code folder's other files and for other projects), the `files_changed` snapshot and the npm cache (`<project>/.npm-cache`) all use the project folder, not the whole code folder. In computer mode the project folder is the start folder (the same access as in your terminal otherwise). The system prompt names the project and leaves out the "make each new app in its own subfolder" sentences, because the project is the app's folder.
- **Concurrency.** One code turn at a time per project, and one for the code folder itself (no project): a second one is 429 `A code turn is already running in <project>.` Different projects may run at once, within the bridge's turn limit.
- The turn's `message` carries `project` (the project's name).

## Computer mode (0.3.0)

Folder mode (above) is the default and is unchanged. **Computer mode** is for the person who wants a chat code turn to work like Claude Code in their own terminal. It is switched on **on the computer only**, with `--full-access` on the bridge's command line: `node bridge.mjs --workspace ~/MyCode --full-access`, or `--install --workspace ~/MyCode --full-access` (carried into the macOS LaunchAgent and the Windows launcher exactly like `--workspace`). `--install` without it installs folder mode again, so re-running the plain install line turns it off. No HTTP route, body field, header, environment variable or stored file can turn it on. A code turn still needs a code folder: it is the folder Claude Code starts in.

A start and `--install --full-access` print (0.3.13): "Full access: commands run without asking inside a sandbox; they can write only in your code folder, ~/Developer and temp, and your keys and the bridge's files are locked. Turn it off: run the install line again without --full-access." On Windows, which has no sandbox here, they print the older text instead (full access, every call asked in the chat).

`GET /v1/hello` has `access`: `"folder"`, `"computer"`, or `null` (no code folder). In computer mode `codeMode` is `"full"` on every platform (Windows too: no sandbox is used, so there is no files-only). The turn's `message` carries `access: "computer"`. On macOS and Linux `options.approvals` is `{ "mode": "sandboxed" }` (0.3.13); on Windows computer mode it is absent.

What a computer-mode code turn runs: the person's own Claude Code, started in the code folder, with `-p --output-format stream-json --verbose --mcp-config <the bridge's gilb server> --allowedTools mcp__gilb --permission-mode acceptEdits` (approval `session`) or the asking mode `manual` (approval `each-write`; the CLI reports it as `default`), `--permission-prompts host --permission-prompt-tool mcp__gilb__bridge_approve`, `--settings {"permissions":{"disableBypassPermissionsMode":"disable"}}`, `--append-system-prompt <the turn's system text + a paragraph naming the folder>` and `--system-prompt-snapshot off`. There is no `--restricted`, `--tools`, `--disable-slash-commands`, `--strict-mcp-config` or sandbox: Claude Code keeps its own prompt, and the person's CLAUDE.md, skills, memory, hooks and MCP servers work as in the terminal. The child gets the person's environment (tokens and logins included) with only the billing variables removed (`ANTHROPIC_API_KEY` and the like), and its init event must still say `apiKeySource: "none"` and the permission mode that was asked for; it is not checked for a tool list. The folder checks (the child's own working folder is the checked code folder) stay.

### Full access inside the OS sandbox (0.3.13)

Reading a command's text can never be made safe (quoting, wrappers, links and globs all hide a name), so on **macOS and Linux** a computer-mode turn with approval `session` no longer judges commands. It runs Claude Code WITH its own OS sandbox (Seatbelt on macOS, bubblewrap on Linux), configured wide open except the protected places, so commands run with no question and the operating system refuses the protected places however a command is written. The `--settings` of such a turn are exactly:

```
sandbox.enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, autoAllowBashIfSandboxed: true
sandbox.network.allowedDomains: ["*"]                      (every host)
sandbox.filesystem.allowWrite: ONLY the code folder (the workspace root, which holds every project), ~/Developer, /tmp and the temp folder ($TMPDIR, os.tmpdir()). Nothing else in the home folder is writable.
sandbox.filesystem.denyRead and denyWrite: the protected places (below)
sandbox.filesystem.denyWrite also: ~/Developer/GilbServerOps (write-only), every existing .claude folder under the code folder and ~/Developer, and the globs <code folder>/**/.claude, <code folder>/**/.claude/**, ~/Developer/**/.claude, ~/Developer/**/.claude/**
permissions.deny: Read(//<place>), Read(//<place>/**), Edit(//<place>), Edit(//<place>/**) for each protected place
permissions.ask: Bash(sudo), Bash(sudo *), Bash(*sudo *) and the same for security, launchctl, osascript; Bash(*GilbServerOps*)
permissions.disableBypassPermissionsMode: "disable"
```

The home folder is not writable on purpose: a command that could write `~/.local/bin`, the node or `claude` binary (`~/.local/share/fnm/...`, `~/.local/bin/claude`), `~/.claude/`, shell start files, `~/.npm` or the global npm prefix would change what later runs OUTSIDE the sandbox. npm's cache is set to `<code folder>/.npm-cache` for a sandboxed turn (unless the person set `npm_config_cache`). Every path is absolute (and its real-path spelling too). Protected places: `~/.ssh`, `~/Developer/.base-deploy`, `~/.gilb-claude-code-bridge` and every `~/.gilb-claude-code-bridge*` that exists when the turn starts (the bridge file and other installs' state folders), `~/Library/LaunchAgents`, `~/.aws`, `~/.gnupg`, `~/.netrc`, `~/.config/gh` `~/Library/Keychains`, `~/.claude.json` and `~/.gilb-connector*` (the connector's keys and script). A write the sandbox allows stays out of them because `denyWrite` and `denyRead` win over `allowWrite` for a path inside it (proved live, see below).

`bridge_approve` answers the rest, in this order, without asking the person unless said so:

- Edit, Write, MultiEdit, NotebookEdit may write only inside the code folder, ~/Developer and temp, and are denied (links followed) with "Writes are allowed only in the code folder, ~/Developer and the temp folder." elsewhere; any path with a `.claude` segment, `.claude.json` or `.mcp.json` is denied ("Claude Code settings and hooks cannot be written here ..."); ~/Developer/GilbServerOps is protected from writes.
- Read, Edit, Write, MultiEdit, NotebookEdit, Glob, Grep: allowed, except that a `file_path`, `notebook_path` or `path` that reaches a protected place is **denied outright** with `This place is protected: <path>.` The path is followed the way the system follows it: `~`, `$HOME`, `..` (applied after links), a link in the code folder (with or without a slash), a link whose target does not exist yet (its target is where it would be created), the other case on a case-insensitive disk. A Glob pattern that names a protected place before any `**` (also with `*`, `?`, `[ ]`, `{ }` in a segment) is denied too. A search that starts above a protected place (Grep with `path` = home) is left to the `permissions.deny` rules.
- Bash: allowed (the sandbox, not this text, protects the places), except the short list `sudo`, `security`, `launchctl`, `osascript` in command position, and anything naming `GilbServerOps` with `ship` or `server`, which is asked of the person like each-write asks. That list is a second line only. A Bash input with `dangerouslyDisableSandbox: true` is denied.
- WebSearch runs; WebFetch keeps the 0.3.12 rules (asked once or for the turn, a local host always asked once).
- TodoWrite, subagent and skill tools run; any other tool (the person's own MCP tools, for example) is asked.

`each-write` keeps asking everything (no sandbox block, as in 0.3.0 to 0.3.12). Folder mode is unchanged. If the sandbox cannot start (Linux without bubblewrap), Claude Code exits before it starts and the turn ends with the sandbox error above; the bridge never falls back to a silent unsandboxed run. Native **Windows** has no sandbox here, so computer mode there keeps asking about every call.

Gaps, stated plainly. (1) The sandbox covers what a command does. Claude Code's own file tools run in its own process; they are held by `bridge_approve`'s path check and the deny rules, not by the OS. (2) A Grep or Glob that starts above a protected place relies on the `permissions.deny` rules to leave it out. (3) The person's own settings, and a project's `.claude/settings.json` in the code folder, are merged with these (arrays add up): a project that lists `sandbox.excludedCommands` makes those commands run outside the sandbox; the bridge cannot remove an entry. (4) `~/.gilb-claude-code-bridge*` and `~/.gilb-connector*` names that do not exist when a turn starts are not on the list. (5) A command may READ the whole home folder except the protected places (`~/.claude`, other config folders and shell files are readable); it can WRITE only the areas above. (6) `.claude` folders: checked live on macOS, the globs in `denyWrite` work, including for a `.claude` folder a command tries to create DURING the turn (the sandbox refused `mkdir -p <project>/.claude` and the settings file in other projects and in ~/Developer). On Linux (bubblewrap) glob entries are not verified; there the existing `.claude` folders are denied by name, and a `.claude` folder created by a shell command during the turn is the gap (the file tools are still held by `bridge_approve`). Whether Claude Code reads a project settings file created mid-session was not tested, because the sandbox refuses the write on macOS. Git hooks and `.mcp.json` in a project are covered by Claude Code's own sandbox defaults for the working folder only, not other projects. (7) Git: `.git/hooks`, `.git/config` and `.git/info/attributes` of every repo that exists when the turn starts are denied for write, and `bridge_approve` denies the file tools on any `.git/hooks`, `.git/config` or `.git/info/attributes`, because git runs code from them (hooks, `core.hooksPath`, `core.fsmonitor`, `core.sshCommand`, `core.pager`, `!` aliases, filter and textconv drivers) outside the sandbox on the person's next git. `.gitattributes`, the index, objects, refs and `COMMIT_EDITMSG` stay writable: `git add`, `git commit`, `git status` and `git log` work (checked live). No glob is used for this: a new repo cannot be made inside the sandbox anyway. Checked live on macOS, `git init` fails on `.git/hooks` and `.git/config` because Claude Code's own sandbox keeps those paths read-only everywhere, with or without this bridge's rules, and the bridge cannot narrow that; so the person runs `git init`, `git clone`, `git config` and `git remote add` in a terminal. Gap: a repo made by some other means during the turn (for example copied in) has unlocked hooks and config until the next turn. `~/.gitconfig` and `~/.config/git` are outside the writable areas (checked live). (8) A command may write ANY project under the code folder and ~/Developer (that is the point); code it writes there runs later outside the sandbox when the person runs it. (9) The sandbox does not stop a command from using a login that is not a file (an agent socket, for example `ssh-agent`, or the network with a token from the environment): the protected places hold the keys, not every credential.

In each-write turns, and in every computer-mode turn on Windows, every request Claude Code would ask about goes to the person through `bridge_approve`, with nothing allowed or denied automatically by path. The question shows: Bash the command (the whole command: every line break is shown as one ` ⏎ ` marker, runs of spaces, tabs and other space separators as one space; over 200000 characters, the relay's practical size, it is not asked and is denied with "The command is too long to show for approval; ask for it in smaller steps."; the app shows a long request folded, the person can open the whole text, and approving approves all of it; the model's description as `detail`, 200 at most); Read, Edit, Write, NotebookEdit the path (a path starting with `~` or `$` exactly as given, an absolute one as given, any other relative one resolved against the start folder; always shown exactly, with no whitespace collapsing; over 1000 characters it is denied with "The path is too long to show for approval."); WebFetch the URL; WebSearch the query; any other tool its name and its input as compact JSON (all whitespace-collapsed, and over 200000 characters denied with "The request is too long to show for approval; ask for it in smaller steps."). The answer shapes and `POST /v1/approval` are as in folder mode.

`files_changed` is still the snapshot of the code folder only: changes Claude Code makes outside the folder are not listed. Hand-offs (nested turns) are unchanged: chat turns.

## Running turns (0.3.2)

So a page that lost track of a turn (a reload, a remounted component) can find it again, and a message sent meanwhile can be queued instead of refused.

- **`turn_started`** `{ turnId, startedAt, mode, project }` is the first event of every turn stream (`mode` is `"code"` or `"chat"`; `project` is the project name or `null`). `start` follows it. The `: keepalive` comment every 10 seconds stays.
- **`POST /v1/turns`** (paired, like `/v1/turn`) answers `{ "turns": [ { turnId, mode, project, startedAt, lastActivityAt, lastActivity, toolCalls, handoffs } ] }`: only the turns started by the caller's own pairing, top-level turns only (hand-offs are counted in `handoffs`, the number started so far). `startedAt` and `lastActivityAt` are ISO times. `lastActivity` is a short line in the wording of the code `activity` summary (a file path, a command, a tool name), `""` before the first call. `toolCalls` counts the built-in tools of a code turn and the GilbPlatform (MCP) tool calls of every turn, hand-offs included.
- **`POST /v1/update`** (0.3.16, paired like `/v1/turn`) updates the bridge from the signed file its build points at. Body `{ check: true }` only looks: `{ current, latest, available }`. Otherwise it downloads, checks the ed25519 signature (a key pinned in the file), the size and the hash, runs the new file's `--selftest`, keeps the old file as `<file>.prev`, replaces the file, and answers `{ updated: true, from, to, restart: "automatic"|"manual" }`. `automatic` (launchd or the Windows supervisor runs it): the bridge exits with code 75 right after the answer and is started again with the same flags; `manual`: stop the window and start it again. Errors: `409 TurnRunning`, `UpdateRunning`, `UpdateCannotWrite`; `501 UpdateOff`; `502 UpdateNetwork`, `UpdateBad`; `422 UpdateSignature`, `UpdateMismatch`, `UpdateTooOld`, `UpdateSelfTest`; `500 UpdateDisk`. Already newest: `200 { updated: false, reason: "current" }`. `hello.update` is `{ supported, supervised, canWrite, busy }`. `node bridge.mjs --selftest` prints `build <n>`; `node bridge.mjs --rollback` puts `<file>.prev` back.
- **`POST /v1/turn/cancel`** `{ turnId }` answers `{ "cancelled": true|false }`. Only the pairing that started the turn can cancel it; a turn of another pairing, an unknown id, a hand-off id and a turn that has ended all answer `{ "cancelled": false }`, so nothing about another pairing is revealed. It stops Claude Code the same way a closed stream does; the turn's stream then ends with an `error` event, "The turn was cancelled.".
- **429 for a refused turn** has a body the page can read. A code turn already running is, for the pairing that started that turn, `{ error: "A code turn is already running in <project>.", code: "CodeTurnRunning", project, ownTurn: true, turnId, startedAt }`, and for any other pairing `{ error, code: "CodeTurnRunning", project, ownTurn: false }` with no `turnId` and no `startedAt` (0.3.4; 0.3.2 and 0.3.3 gave them to anyone). `project` is `null` for the code folder itself. The turn limit is `{ error: "Too many turns at once.", code: "TooManyTurns" }`. The error texts are unchanged.
- **A turn belongs to its pairing (0.3.4).** A hand-off (`parentTurnId`) is accepted only under a turn of the caller's own pairing; under another pairing's turn it is answered exactly as an unknown turn (404, "The turn that asked for this hand-off is not running."), so nothing says the turn exists.
- **Ids must be strings (0.3.4).** `turnId`, `id` (`/v1/approval`, `/v1/tool-result`), `parentTurnId` and the pairing `code` must be strings; any other shape (object, array, number, null, a missing `turnId`) is `400 { error: "Bad request." }`, never a 500. A string that names nothing is answered as before (`{ cancelled: false }`, 404).
- **The relay window** now stops what its page started when that page goes away: the page posts `gilb-bridge-bye` on `pagehide`, or the window sees that its opener closed, and every request the window still has open is aborted, so the bridge stops those turns.

## Model, effort and coding hand-offs (0.3.5)

The person chooses, in the chat, which model answers and how hard it thinks, and can tell the model to hand coding jobs to a cheaper one. All of it is on the turn body (`POST /v1/turn`); every field is optional.

- **`model`** (chat and code turns): one of `opus`, `sonnet`, `haiku`, `fable`, or a full name matching `/^claude-[a-z0-9][a-z0-9.-]{0,62}$/`. Anything else is `400 { error: "That model is not allowed." }` and no child starts (before 0.3.5 an odd value was silently ignored). It is passed to Claude Code as `--model <m>`.
- **`effort`** (chat and code turns): `low`, `medium`, `high`, `xhigh` or `max`; anything else is `400 { error: "That effort is not allowed." }`. Passed as `--effort <e>`.
- **A hand-off** (`parentTurnId`) inherits its parent turn's `model` and `effort`, unless it carries its own (checked the same way). Before 0.3.5 a hand-off always took its parent's model.
- **`delegateCoding: true`** (code turns only; on a chat turn or a hand-off it is `400 { error: "delegateCoding is only for code turns." }`, and a non-boolean is `400 Bad request.`): the turn is started with one custom subagent, `sonnet-coder` (`--agents`), whose model is `sonnet`. In folder mode its tools are exactly the code tools of the turn (`Bash, Read, Edit, Write, Glob, Grep, NotebookEdit`; on Windows `Read, Edit, Write, Glob, Grep`); in computer mode it has no `tools` entry and inherits. The turn's system prompt gains: "Hand each coding job to the sonnet-coder agent with a detailed brief (files, exact change, checks to run). Then check its work yourself: read the diff and run the checks. Do the planning, reviewing and talking to the person yourself."
  - In folder mode Claude Code's subagent tool is added to `--tools` (named `Agent`; the CLI lists it as `Task` in the init event), and the init check allows `Agent`/`Task` only on a turn with `delegateCoding`. A turn without it still fails closed on any other tool.
  - The subagent runs inside the same session: the same `--settings` (sandbox, denied reads, network list), the same permission mode and, in each-write mode, the same permission prompt tool. Every write and command it makes is asked of the person like any other. The bridge answers the request to start the subagent itself (allow) on a delegating turn only; everywhere else that request stays refused.
- **`GET /v1/hello`** has `options: { web, models, efforts, delegateCoding: true, images }` (and `approvals: { mode: "sandboxed" }` in computer mode on macOS and Linux) so a page can feature-detect (`web` is `{ search: true, fetch: "ask" }` in folder and computer mode, `{ search: false, fetch: "off" }` in Windows files-only mode, and absent without a code folder).
- **The final `message`** carries `model` (from the CLI), `effort` when one was used, and `delegateCoding` (true or false) on a code turn.
- **`POST /v1/tool-result`** (0.3.5) now checks the turn's owner like `/v1/approval`: another pairing gets the same 404 as for an unknown turn. A hand-off asked for under a turn whose cancel was requested (even before it has closed) is `404`, like a closed parent.
- **Only the `sonnet-coder` subagent may be started** (`bridge_approve`): `Agent` or `Task` is allowed only with `subagent_type` exactly `"sonnet-coder"`, otherwise denied with "Only the sonnet-coder agent may be started in a code turn." A delegating folder code turn also puts `Agent(<type>)` and `Task(<type>)` deny rules for the 7 built-in types (`BUILTIN_AGENT_TYPES`) in its `--settings`, for session mode, which never asks.
- **Init `tools` that is not an array is refused** (the folder limits check fails closed; before, a string passed).

## Relay window (for Safari)

Safari blocks an https page's fetch to `http://127.0.0.1:47821` as mixed content. So the page can open a small window served by the bridge, `GET /relay`, and talk to it by postMessage; that window's own fetches are same-origin. The person keeps the window open (it can be minimised). It replies only to the page that opened it, and only to an origin on the bridge's allow-list (built-in plus `--allow-origin`), which is embedded in the page. `/v1/hello` reports `relay: true`, so a page can tell a bridge that has it from an older one.

Messages: the page posts `gilb-bridge-req` (`id`, `path`, `method`, `headers`, `body`) and `gilb-bridge-abort` (`id`) and `gilb-bridge-bye` (no `id`: the page is going away, so abort every open request). The window answers every request first with `gilb-bridge-head` (`id`, `status`, `contentType`). A `text/event-stream` answer then follows as `gilb-bridge-chunk` messages and one `gilb-bridge-end`; any other answer follows as one `gilb-bridge-res` (`status`, `headers`, `body`). A failure, or an abort, is `gilb-bridge-err` (`message`, `"aborted"` after an abort).

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
- 0.1.9: a hand-off may run 30 minutes (the connector now gives level agents that long), so the bridge waits for a tool call 30 minutes.
- 0.2.0: code mode: `--workspace`, `mode: "code"` turns, `/v1/workspace`, the `activity`, `tool_error` and `files_changed` events (see "Code folder").
- 0.2.1: full-mode code turns may download from `codeload.github.com` and `raw.githubusercontent.com` (read-only archives of public repos); the system prompt says how.
- 0.3.0: Computer mode: `--full-access` (command line and `--install` only), `access` in `/v1/hello` and in the code turn\'s `message` (see "Computer mode"). Also 0.3.0: projects (see "Projects"); the start banner says which mode chat turns and code turns run in.
- 0.3.1: approval display fails closed (a request too deep to escape is denied, never shown raw); look-alike keys are compared on the text shown; the Bash description is shown with non-ASCII escaped as <U+XXXX>; a field named `constructor` or `prototype` is asked about, with the notice "Request holds a field named constructor/prototype." (`__proto__` is still refused).
- 0.3.2: running turns (additive; an older client ignores all of it): the `turn_started` event, `POST /v1/turns`, `POST /v1/turn/cancel`, `code` (`CodeTurnRunning`, `TooManyTurns`) and the running turn's `project`, `turnId` and `startedAt` in the two 429 bodies, tool-call counts and last activity for built-in and MCP tools, and the relay window's `gilb-bridge-bye` / opener-closed abort (see "Running turns").
- 0.3.4: a turn belongs to its pairing: a hand-off under another pairing's turn is refused like an unknown turn; the `CodeTurnRunning` 429 carries `turnId` and `startedAt` only for the turn's own pairing and says `ownTurn` true or false; a non-string id on any route is `400 Bad request.` (it was a 500 for an object id).
- 0.3.5: the person's choice of `model` and `effort` on a chat or code turn (a hand-off inherits them), `delegateCoding` for code turns (the `sonnet-coder` subagent), `options` in `/v1/hello`, `effort` and `delegateCoding` in the final `message`; a model or effort off the list is 400 (it was ignored). `/v1/tool-result` checks the turn's owner; a hand-off under a cancelled parent is 404.
- 0.3.6: pictures in a turn. `/v1/turn` takes `images: [{mediaType, data}]` (base64, no `data:` prefix): at most 4, PNG/JPEG/GIF/WebP, magic bytes checked, each at most 5 MiB and 10 MiB together (decoded); anything else is 400 before a child starts, and a hand-off with pictures is 400. A turn with pictures runs Claude Code with `--input-format stream-json` and one stdin line (pictures first, then the text; an empty prompt becomes "Please look at the attached picture."). `/v1/turn` bodies may be up to 16 MiB (other routes keep 2 MiB). The final `message` and `/v1/turns` carry `images: <count>`; `/v1/hello` `options.images` = `{maxCount, maxBytes, types}`. Picture data is never logged.
- 0.3.6 (code turns): every code turn tells the model to load the platform's coding standards (Agent.Coder) and to search the platform's shared code library for a unit to reuse before writing new code; a delegating turn also tells it to put those rules and units into each brief for the coder, whose prompt says to follow them.
- 0.3.7: the person's turn `message` carries `usage` (`model`, `contextWindow`, and the token counts that are whole numbers from 0 to 1e9) from the result's `modelUsage` for the reported model, or the only entry when there is exactly one. A bad count is left out; no valid context window means no `usage`. No other field of the result is passed on. A hand-off's message is unchanged.
- 0.3.11: the turn's `usage` counts the context of the turn's last model call, not the sum over the turn's tool steps (`inputTokens`, `cacheReadInputTokens` and `cacheCreationInputTokens` come from the last top-level `assistant` line's `message.usage`; `contextWindow` and `outputTokens` still come from the result's `modelUsage`; with no such line the result's counts are used).
- 0.3.10: a run in which Claude Code reports its sign-in again after its first answer (a background task or agent that reports back starts a new query in the same process) is no longer stopped: every later init is checked again and must also say the subscription (`apiKeySource` "none", only after a first good init); the code-folder checks run on every init; the page gets the last answer. A stdout line that does not parse but names an init or an `apiKeySource` stops the turn. The refusal now says which: another credential was reported, or the subscription was not confirmed (send again; `claude auth status`). No tool events are sent after a billing refusal.
- 0.3.9: a project folder the bridge makes gets a `.npmrc` with the one line `install-links=true` (written only when the folder is new, never over an existing file), so code-library units install as copies. Code turns are told never to write `.npmrc`, to keep commands plain (no temporary folder, no `$VARIABLE`, no recursive delete), and the one-command recipe for taking a library unit from GitHub.
- 0.3.8: an approval question for a command or any other request may be up to 200000 characters (the relay's practical size). The old 2000-character cap is gone. The text is still never cut; a longer one is still denied with the same sentence. The app shows a long request folded; the person can open the whole text, and approving approves all of it. Paths stay capped at 1000. Hidden and control characters are still refused.
- 0.3.12: folder mode can search the web; opening a web page asks the person, who can allow that page or every page for the rest of the turn
- 0.3.13: computer mode with approval `session` on macOS and Linux runs Claude Code inside its OS sandbox, wide open except protected places (ssh keys, the deploy folder, the bridge's own files, LaunchAgents, cloud and gpg logins, .netrc, the gh login, Keychains): commands run without a question and write only in the code folder, ~/Developer and temp (never the home folder, `~/.local/bin`, binaries, shell files, `.claude` settings), and the OS refuses the protected places however a command is written; Claude Code's file tools are denied those places by `bridge_approve` (links followed), and `sudo`, `security`, `launchctl`, `osascript` and GilbServerOps ship/server are still asked. `/v1/hello` options has `approvals: { mode: "sandboxed" }`. each-write, folder mode and Windows are unchanged. This replaces the abandoned text-matching approach (see "Full access inside the OS sandbox (0.3.13)").
- 0.3.14: the always-on bridge now records a lasting path to node, so it keeps starting after a reboot when node comes from fnm (fnm's per-terminal `fnm_multishells` link, and anything in the temp folder, is never recorded; the real node is).
- 0.3.15: one message and its hand-offs may make up to 600 tool calls (was 240).
- 0.3.16: the bridge can update itself from the app: it downloads the new version, checks our signature, and restarts with the same settings.
