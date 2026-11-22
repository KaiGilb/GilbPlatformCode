---
unit: browser-proof
kind: added
audience: developer
breaking: false
action: none
pr: 000
---
`browser-proof` 0.3.0 adds `assertNoSaveButtons`, `collectFieldButtons` and `judgeSaveButtons`: a check that a record screen has no Save, Done, Edit or Apply button and no Cancel that cancels nothing, because its fields save as the person types. Buttons inside a dialog are left out, and a Cancel beside Delete or Remove is allowed.
