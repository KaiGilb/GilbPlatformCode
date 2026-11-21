---
unit: vault-share-sheet
kind: fix
audience: developer
breaking: false
action: with a dark look or a bright accent, set --vss-on-danger to a colour that reads on your red (README, "Styling")
pr: 302
---
The label of the share sheet's red Remove button has its own variable, `--vss-on-danger`; unset it is `--on-accent` as before, which on a dark look's light red reads at 2.33:1, so a host sets it (with `style-runtime`: `var(--on-bad)`); no colour changes while it is unset.
