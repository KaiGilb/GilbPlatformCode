---
unit: signin
kind: fix
audience: developer
breaking: false
action: for a dark look, set --signin-link and --signin-error-text (README, "Styling")
pr: 299
---
On the sign-in card in a dark look the new vault's address is readable (its background follows `--tint-hi`; it was a fixed white under light text); the Change email link and the sentence that refuses a name are unchanged and get their own variables, `--signin-link` and `--signin-error-text`, for a host to set; the light look is unchanged.
