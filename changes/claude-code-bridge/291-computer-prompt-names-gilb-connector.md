---
unit: claude-code-bridge
kind: fix
audience: developer
breaking: false
action: none
pr: 291
---
Computer mode tells the AI to use only the `mcp__gilb__*` tools for GilbPlatform, and passes the Claude session id (`GILB_CLAUDE_SESSION_ID`) to the Claude it starts.
