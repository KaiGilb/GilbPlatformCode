---
unit: claude-code-bridge
kind: feature
audience: developer
breaking: false
action: none
pr: 324
---
A code turn can now ask for one fixed action with the new tool `request_action` (the old `request_setting` stays as an alias), starting with `ship.backend` (version 0.4.2). The bridge checks the request against a closed list, runs its prechecks (SHA on main, newer than live, every pull request reviewed, CI green, change-log dry run), and shows the app a card; one click from the paired app that owns the chat, from the one allowed origin, on a computer that holds the ship key (a plain file, mode 0600), runs the ship. A computer without the key says `this computer cannot ship; ask Kai`. The result (exit, verdict REAL, MOCK or UNPROVEN, the redacted log tail and its path) comes back through `action_status`. New routes: `/v1/actions/requests`, `approve`, `decline`, `status`. The ship folder in the bridge state is now read-denied and write-denied to a code turn in both sandbox modes, and computer mode also read-denies the grant store.
