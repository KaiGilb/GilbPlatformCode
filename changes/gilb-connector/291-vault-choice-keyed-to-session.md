---
unit: gilb-connector
kind: fix
audience: developer
breaking: false
action: none
pr: 291
---
The vault the person chose now comes back on the next turn of the same Claude session (keyed to `GILB_CLAUDE_SESSION_ID`; parent process when none). Vault ids compare without a trailing slash. `gilbplatform_whoami` names the person the AI acts for when the platform says so.
