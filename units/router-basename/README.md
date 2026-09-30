# router-basename

The base path you give the router. A trailing slash is kept, so a redirect cannot drop the query.

## What this is

One function, `routerBasename`. You pass the bundler's base string. You get either that same string, or `undefined` when the app lives at the origin root.

Vite's `import.meta.env.BASE_URL` is the usual input. It is `"/"` for an app at the root, and a path with a trailing slash when the app is in a subpath (`"/desk/"`).

React Router writes the root location as the basename alone. With a base of `/desk/`, the root URL is `/desk/` plus the query. If you strip the slash first, the root URL becomes `/desk` plus the query. A host that answers `/desk` with a redirect to `/desk/` can drop the query on that redirect. The person reloads and the selected vault (or any other query) is gone. Keeping the slash avoids that hop.

## What this is not

- Not a path joiner. It does not join the basename to a route.
- Not a normalizer. It does not add a slash, remove a slash (except by returning `undefined` for the two root values), trim spaces, or reject a bad base.
- Not tied to one bundler. The parameter is a string. The name in the app source says Vite because that is where the string comes from today.

## How to take it

Package: `@kaigilb/gilbplatformcode-router-basename`

```ts
import { routerBasename } from "@kaigilb/gilbplatformcode-router-basename";

const basename = routerBasename(import.meta.env.BASE_URL);
// pass `basename` to BrowserRouter. `undefined` means no basename.
```

Path: `units/router-basename/`.

## What you pass

`viteBaseUrl: string`. The two root values are exactly `"/"` and exactly `""`. Nothing else is special.

`" /"` (space, then slash) is not the root. It is returned unchanged. `"//"` is returned unchanged. `"/desk"` without a slash is returned unchanged. This function will not repair a base the bundler built wrong.

## What you get

- `undefined` for `"/"` and `""`.
- The same string you passed, for every other value. Same characters, same trailing slash.

## Examples

```ts
routerBasename("/");          // undefined
routerBasename("");           // undefined
routerBasename("/desk/");     // "/desk/"
routerBasename("/desk");      // "/desk"   — the slash is not added
routerBasename("/desk/?x=1"); // "/desk/?x=1"
```

## What the host must supply

The base string from the bundler. The router itself stays in the app. This package does not import React or a router.

## Do not

- Do not `basename.replace(/\/$/, "")`. That is the bug.
- Do not special-case only your own app's folder name. Pass the bundler's value through.
- Do not treat `undefined` as an error. It means the app is at the root, and the router should have no basename.

## Wrong readings

- "A missing return means the base was invalid." No. `undefined` is the successful root result. An unexpected base is returned as-is, not rejected.
- "The function makes the trailing slash safe by adding it." No. It only refuses to remove one. If the bundler already omitted the slash, you still have the redirect risk. Fix the bundler base. Do not teach this function to invent a slash, or a base that was intentionally without one will change.

## Where it came from

GilbApp `src/routerBasename.ts`. The body is the same four lines. The comment there names the redirect that dropped the query. This note says the same thing without a host name.
