/**
 * Map a bundler's base path to a router basename.
 *
 * Pass Vite's `import.meta.env.BASE_URL` (or the same string from another bundler).
 *
 * The router joins the basename in front of every path except when the path is
 * `/`. At the root, the browser URL is the basename itself, plus the query and
 * hash. A base of `/desk/` must stay `/desk/`.
 *
 * Stripping the trailing slash builds `/desk?vault=…`. A server that redirects
 * `/desk` to `/desk/` can drop the query on that redirect, so the selection
 * disappears on reload. This function does not strip the slash, and it does not
 * add one.
 *
 * `/` and `""` mean "the app is mounted at the origin root". Those two return
 * `undefined`, which is what the router expects when there is no basename.
 * Any other string is returned unchanged, including a missing slash, a double
 * slash, or surrounding spaces.
 */
export function routerBasename(viteBaseUrl: string): string | undefined {
  if (viteBaseUrl === "/" || viteBaseUrl === "") return undefined;
  return viteBaseUrl;
}
