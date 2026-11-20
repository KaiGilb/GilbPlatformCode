---
unit: lws-session-bridge
kind: fix
audience: developer
breaking: false
action: await ready before reading session
pr: 295
---
`configureLiveApp` now starts `credential.restore()` and answers it as `ready`; await it before reading `session`, or a page shows "Not connected" until the stored session loads.
