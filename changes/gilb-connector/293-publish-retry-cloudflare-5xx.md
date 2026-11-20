---
unit: gilb-connector
kind: fix
audience: developer
breaking: false
action: none
pr: 293
---
When a publish is refused by a Cloudflare 5xx and the platform says nothing was admitted, `publish` now waits a few seconds, asks for a new ticket and tries once more, and reports the failure as before if that also fails.
