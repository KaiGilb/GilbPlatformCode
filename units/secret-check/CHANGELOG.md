# Changelog

## 1.0.1

- The package ships compiled JavaScript and type declarations (`dist/`), so a Node back end can load it.
- An http(s) URL that has a user name and a password in it (`https://user:pass@host/`) is now refused. A URL with only a user name (`https://user@host/`) is not a secret and is still allowed.

## 1.0.0

- First release, moved as it is from GilbApp `projectDecisions.ts` at 602ebf2e: `textHasSecret`, `maskSecrets` and `normalise`. A URL with `user:pass@` was not refused at this version; a test pins that.
