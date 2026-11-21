---
unit: claude-code-bridge
kind: added
audience: developer
breaking: false
action: none
pr: 301
---
Version 0.3.22 saves a code turn's changed files as one local git commit after the answer (hardened git with a 20 s limit per git call and 120 s only for a folder's first save, secret scan, per-project switch `POST /v1/git/sync`, `git_saved` and `git_error` events, `options.git` in `/v1/hello`); it saves only once every process of the turn has ended, refuses a git folder holding any link, pipe or hard link, commits by plumbing, and leaves switched-off projects out of a code-folder save; a code turn can no longer write anywhere under .git (the bridge saves the history), and a lock is removed only when the bridge proves its own killed git left it; it never pushes.
