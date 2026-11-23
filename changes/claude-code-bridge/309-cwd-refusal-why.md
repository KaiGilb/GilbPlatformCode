---
unit: claude-code-bridge
kind: fix
audience: developer
breaking: false
action: none
pr: 309
---
A code turn the bridge refused because Claude Code did not start in the code folder is no longer retried, so the person sees the true reason instead of "The code folder changed on disk", and the log names the init, the reported folder and the expected one.
