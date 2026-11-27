---
unit: claude-code-bridge
kind: fix
audience: developer
breaking: false
action: none
pr: 319
---
On Windows (proven on GitHub's Windows runner), a new project now gets its own git repo, and the bridge stops within about two seconds when it shuts down during a turn.
