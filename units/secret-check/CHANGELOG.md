# Changelog

## 1.1.0

- New prose level for hand-off text: `secretKindOfProse(text)` names the kind of secret (key prefix, private key block, JWT or DPoP proof, bearer token, `password=`-style assignment, URL credentials, secret in a URL query, one-time code, long random run) and `textHasSecretProse(text)` answers yes or no. It lets ordinary prose through: possessives, commit and record ids, `t:` and `a:` names, e-mail addresses, paths, host:port, time stamps, amounts, file names. The strict level (`textHasSecret`, `maskSecrets`) is unchanged.

## 1.0.1

- The package ships compiled JavaScript and type declarations (`dist/`), so a Node back end can load it.
- An http(s) URL that has a user name and a password in it (`https://user:pass@host/`) is now refused. A URL with only a user name (`https://user@host/`) is not a secret and is still allowed.

## 1.0.0

- First release, moved as it is from GilbApp `projectDecisions.ts` at 602ebf2e: `textHasSecret`, `maskSecrets` and `normalise`. A URL with `user:pass@` was not refused at this version; a test pins that.
