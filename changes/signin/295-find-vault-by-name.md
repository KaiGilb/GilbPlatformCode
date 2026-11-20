---
unit: signin
kind: fix
audience: developer
breaking: false
action: none
pr: 295
---
New `findVaultByName(vaults, raw)` finds a listed vault by its short name; the README examples no longer compare the display name (`v.name`) to a normalised name, which never matched "TestCreateApp2".
