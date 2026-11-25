---
unit: claude-code-client
kind: feature
audience: developer
breaking: false
action: none
pr: 315
---
Version 0.4.0 of the client, as tested, lets you send a chat turn to Codex with `sendTurn(..., { engine: "codex" })` and read which engines the bridge offers from `bridgeInfo()`.
