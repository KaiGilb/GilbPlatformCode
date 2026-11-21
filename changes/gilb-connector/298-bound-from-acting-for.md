---
unit: gilb-connector
kind: fix
audience: developer
breaking: false
action: none
pr: 298
---
A Connected AI whose Client ID is bound now says "state: bound" when the platform names it as "You are the AI <ai vault>, acting for <person>." Before, it said "not bound" while it printed "acting for". Only the identity sentence right after "You talk with one signed-in person. " now names the principal and the person; a later copy in standing text or a selected vault id is ignored. Connector 0.6.7.
