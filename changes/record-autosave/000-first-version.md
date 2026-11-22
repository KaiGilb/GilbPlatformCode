---
unit: record-autosave
kind: added
audience: developer
breaking: false
action: none
pr: 000
---
New unit `record-autosave`: saves a record's fields as the person types, with no Save, no Cancel and no Edit mode. `useAutosaveRecord` writes only the changed fields after 400 ms of quiet, at blur, and when the page is hidden or the screen is left; `SaveStateLine` says "Not saved yet…", "Saving…", "Saved" or the failure's own words with "Try again". Tested without a vault: the caller passes the write in.
