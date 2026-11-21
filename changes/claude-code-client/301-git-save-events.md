---
unit: claude-code-client
kind: added
audience: developer
breaking: false
action: none
pr: 301
---
Version 0.3.15 passes on the bridge's `git_saved` and `git_error` events, sends `gitIdentity` on a code turn, and adds `gitSync()`, `bridgeInfo().options.git` `git_saved.recovered`, and `outside` on the git events.
