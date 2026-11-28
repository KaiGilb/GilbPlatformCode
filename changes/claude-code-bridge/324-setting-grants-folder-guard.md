---
unit: claude-code-bridge
kind: fix
audience: developer
breaking: false
action: none
pr: 324
---
Setting grants are safer against a folder swapped after the bridge started (version 0.4.2). Before every write the bridge checks that the grant store folder and the project's folder are still the same plain folders it started with; if one became a link or was replaced, the grant or revoke is refused, nothing is written through it, and setting grants stay off until the bridge restarts. At start the bridge also removes the temp files a killed write can leave behind (they could hold the grant secret).
