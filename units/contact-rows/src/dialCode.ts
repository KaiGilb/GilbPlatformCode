// `joinPhone` is `home-dial`'s, which holds the app's version of it (a national number that already starts with "+" is returned as it is).
// It is NOT the `joinPhone` of `phone-text`. This file only keeps the module path `./dialCode`, so `ContactRows.tsx`, the entry point and
// the tests read it where they always did.
export { joinPhone } from "@kaigilb/gilbplatformcode-home-dial";
