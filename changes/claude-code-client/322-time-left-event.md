---
unit: claude-code-client
kind: feature
audience: developer
breaking: false
action: none
pr: 322
---
The client now passes on the bridge's new `time_left` event to `onEvent` (`{ value }`, the agent's own estimate of the time until it needs the person), in every mode and for the person's own turn only. It also exports `isTimeValue` and the type `TimeValue`, and depends on the `time-line` unit. Version 0.4.0.
