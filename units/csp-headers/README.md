# csp-headers

## What this is

A Vite plugin that makes one policy file the page's Content-Security-Policy meta tag, the header on the dev and preview servers, and the build's _headers file. It runs in Node, as part of the build; it needs no `vite` package (its plugin type is written out and checked against Vite's own `Plugin` in a test).

**Replaces in run 8:** the `cspPlugin` in `app/vite.config.ts` (about 60 lines).

## API

```ts
cspHeaders(options?: {
  policyFile?: string;                       // default "security/csp.txt", relative to the project root
  policy?: string;                           // the policy text itself; the file is then not read
  extraHeaders?: Record<string, string>;     // other headers: dev, preview and _headers
  headersFile?: string | false;              // default "_headers"; false writes none
  exclude?: (path: string) => boolean;       // pages and requests that get no policy
  transformPolicy?: (policy: string, mode: "dev" | "build") => string;
}): Plugin

readPolicy(text: string): string             // comments and blank lines out, directives joined with "; ", empty refused
metaPolicy(policy: string): string           // without frame-ancestors, report-uri, report-to, sandbox
headersFileText(policy, extra?): string      // the /* block of a Cloudflare _headers file
mergeHeadersFile(existing, policy, extra?): string
withMetaPolicy(html, policy): string         // exactly one CSP meta
```

- The policy file is one directive per line; `#` starts a comment. It is read on every use, so an edit shows on the next dev request.
- **Meta tag**, dev and build: exactly one `<meta http-equiv="Content-Security-Policy">`. An existing one (for example `content="__CSP__"`) is replaced where it stands; none is added after `<head>`. The meta never has `frame-ancestors`.
- **Header**, dev and preview responses whose path is not excluded: the full policy, with `frame-ancestors`, plus `extraHeaders`.
- **`_headers`**, on build, after Vite has copied `public/`: written as `dist/_headers`; an existing file is merged, so the `/*` block holds one policy line and other blocks stay.
- `transformPolicy` gets `"dev"` for the dev server (header and meta) and `"build"` for the build and the preview server. `exclude` gets the request path or the page path and applies to the header and the meta.

## Example

As the run-8 app would use it: a fake mode that may connect to itself only, a dev websocket, and a dev-only Studio page with no policy.

```ts
import { cspHeaders } from "@kaigilb/gilbplatformcode-csp-headers";

export default defineConfig(({ mode }) => ({
  plugins: [
    cspHeaders({
      exclude: (path) => /^\/(studio\.html|src\/studio\/|__studio\/)/.test(path),
      extraHeaders: { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(self), geolocation=()" },
      transformPolicy: (policy, m) => {
        const p = mode === "fake" ? policy.replace(/connect-src [^;]*/, "connect-src 'self'") : policy;
        return m === "dev" ? p.replace(/connect-src /, `connect-src ws://localhost:${PORT} `) : p;
      },
    }),
  ],
}));
```

## What the host must supply

`security/csp.txt` (or the `policy` option). The unit holds no origin and no policy of its own.

## How to take it

Package `@kaigilb/gilbplatformcode-csp-headers`. No peers. Put `install-links=true` in your `.npmrc` so the unit is installed as a copy. Put the plugin first in `plugins`.

## Where it came from

New code, written for EESpeed Round 8 (batch CB3) from the `cspPlugin` in the run-8 app's `vite.config.ts`, made general: the policy file, `exclude`, `transformPolicy` and `extraHeaders` are options; the `_headers` file is written after `public/` is copied and merged with an existing one. Repository `KaiGilb/GilbPlatformCode`, commit `a5e8f8cd1ff677b5f1cb2645c4d49f44a6f1823c`.

## Tests

`npm test` (vitest): the pure helpers (comments, blank lines, trailing semicolons, an empty policy refused, the meta drops frame-ancestors, the `_headers` text and its merge, one meta whatever the page held); the plugin hooks called directly with fake objects (the meta in dev and build, the headers on dev and preview and the excluded paths, `_headers` written, merged, not written with `headersFile: false`); and that the plugin is assignable to Vite's `Plugin`.
