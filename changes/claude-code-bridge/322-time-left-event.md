---
unit: claude-code-bridge
kind: feature
audience: developer
breaking: false
action: none
pr: 322
---
The bridge now sends a `time_left` event with the value of the agent's Time line (`[Time until I need you: ...]`) as soon as the agent writes it, in chat, code and computer turns, from the top agent only (version 0.4.0). The line itself is not removed from the reply.
