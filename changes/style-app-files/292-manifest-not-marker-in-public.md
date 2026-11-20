---
unit: style-app-files
kind: fix
audience: developer
breaking: false
action: none
pr: 292
---
A built app no longer holds the `.style-app-files` marker in `dist/fonts/`, so publishing is no longer refused for it; the unit now keeps its record in `style-app-files.manifest.json` at the app root and removes an old marker on the next run.
