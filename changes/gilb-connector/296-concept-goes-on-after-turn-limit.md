---
unit: gilb-connector
kind: changed
audience: developer
breaking: false
action: none
pr: 296
---
Agent.Concept no longer waits for the person's next message after a turn limit: the connector renews the turn and Concept goes on by itself, including a connector that is itself Agent.Concept. It waits only when the platform says the person's daily limit of term packages is reached.
