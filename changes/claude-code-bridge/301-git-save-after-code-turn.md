---
unit: claude-code-bridge
kind: added
audience: developer
breaking: false
action: none
pr: 301
---
Version 0.3.22 saves a code turn's changed files as one local git commit after the answer (hardened git, secret scan, per-project switch `POST /v1/git/sync`, `git_saved` and `git_error` events, `options.git` in `/v1/hello`); it never pushes.
