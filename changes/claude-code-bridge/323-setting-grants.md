---
unit: claude-code-bridge
kind: feature
audience: developer
breaking: false
action: none
pr: 323
---
A sandboxed code turn inside a project can now ask for one wider sandbox setting with the new tool `request_setting`, and only the paired app can grant it (version 0.4.1). Allowed: local binding, one Unix socket inside the project, or one host from a closed list; the bridge refuses everything else, a wildcard and every `.claude`, hook, env and filesystem setting included. A grant lasts until it is removed, is kept where a code turn cannot read or write it, and is checked again each time a turn is built. New routes: `/v1/settings/requests`, `grant`, `decline`, `grants`, `revoke`.
