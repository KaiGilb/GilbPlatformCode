# type-picture

Draws a GilbVeda type's picture at a given size, and draws nothing when the type has no picture or the picture fails to load.

## What this is

Draws a GilbVeda type's picture at a given size, and draws nothing when the type has no picture or the picture fails to load: no stand-in glyph and no empty space. The picture is the type's `a:typePicture` (a pointer to a file) on the type's own document; the host says where those documents and the files live, once.

- `createTypePictureSource({ termOrigin, originOf, fetch? })` makes the source: `termOrigin` is the origin that serves type documents (`<termOrigin>/base/t/<Type>`), `originOf(entityIri)` is the origin a file entity's bytes are served from (`<origin>/files/<id>`), and `fetch` defaults to `globalThis.fetch`. The source holds the cache, so make ONE, once.
  - `fetchTypePictureSrc(typeName)`: one GET per type name, asking for JSON; resolves to the picture's bytes URL, or null. A 404 (the type has no page) is remembered as no picture; any other failure (a 5xx, a refusal, a network error, a body that is not JSON) is null and forgotten, so the next ask goes to the server again.
  - `clearTypePictureCache()`, `typeTermUrl(typeName)`, `fileBytesUrl(id)` (a `/base/e/<id>` entity IRI to its bytes URL; refuses anything else, an id that ends in an extension such as `x.png`, a malformed URL and a value that is not a string; an id that merely contains `png` is a picture), `typePictureSrc(doc)` (reads `a:typePicture` or `typePicture` as `{ "@id": <iri> }`), `recordTypePictureSrc(facts)` (reads the flat string a record's fact map holds).
- `TypePictureSourceContext`: put the source here, once, above the app: `<TypePictureSourceContext.Provider value={source}>`.
- `useTypePictureSrc(typeName)`: the picture's address, null while loading, absent, or with no provider.
- `useTypePicture(typeName)`: `{ src, fail }`; call `fail` from an image's `onError` and `src` becomes null until the type name changes.
- `TypePicture({ typeName, px, className? })`: an `<img>` (`alt=""`, `aria-hidden`, `decoding="async"`, `width` and `height` of `px`, `data-type-picture` = the bare type name) or nothing.
- `TYPE_PICTURE_ATTR` = `a:typePicture`.

The type name may be given in any spelling (`Chair`, `t:Chair`, an address with `/base/t/Chair`); it is reduced to the bare name by the `type-name` unit.

## What this is not

- Not the picture button or the definition popover (`TypePictureButton` of the source): that belongs to a later unit with the definition popover.
- Not the file thumbnail helper (`fileThumbnailSrc`) and not the type-name guessing from a record type id (`inferTypeName`): they need the app's own record-type registry and are not used by the picture.
- Not a stand-in drawer. There is no fallback glyph.
- Not a vault client: it never sends credentials, and the bytes are read from a public URL.

## How to take it

Package: `@kaigilb/gilbplatformcode-type-picture`

Take it together with its peer `type-name`. Put this line in your app's own `.npmrc` so both are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install both:

```sh
npm install <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { TypePicture, TypePictureSourceContext, createTypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";

// Once, at app start.
const source = createTypePictureSource({
  termOrigin: "https://ontology.example.test",
  originOf: (entityIri) => new URL(entityIri).origin,
});

<TypePictureSourceContext.Provider value={source}>
  <App />
</TypePictureSourceContext.Provider>;

// Anywhere below it.
<TypePicture typeName="Chair" px={20} className="ml-1" />;
```

## What the host must supply

- The ONE source, made at start-up with `createTypePictureSource` and provided above everything that draws a type picture.
- `termOrigin` (where type documents are served) and `originOf` (where a file entity's bytes are served). Both are the host's; the unit names no host.
- React 19.

## Do not

- Do not make a source per render, or per component: it holds the cache, so a new source asks the server again every time.
- Do not install a second copy of this unit: a second copy has its own context, and a picture below a provider from the other copy never sees the source.
- Do not draw your own stand-in when `TypePicture` draws nothing: that is the answer.
- Do not pass a changing `originOf` or `fetch` and expect old answers to follow it: a cached answer is the address it was made with. Clear the cache with `clearTypePictureCache()`.

## Wrong readings

- "With no provider the picture shows from a default server." With no provider there is no source and no picture, silently. Nothing is drawn and nothing is asked.
- "A failed image is retried." After `onError` the picture stays gone for that type until the type name changes; the failure is forgotten on a change of name, even to a type with the same picture address.
- "An entity id with `png` in it is refused." Only an id that ENDS in an extension is. `https://example.test/base/e/fpngn43e70b4` is a picture; `https://example.test/base/e/x.png` is not.
- "A 404 and a 500 are the same." A 404 is cached for the life of the source (until `clearTypePictureCache`); a 500, any other status and a network error are not.
- "`typePictureSrc` reads a record's fact map." It reads the type's document, where the pointer is an `{ "@id" }` object; a bare string there is null. `recordTypePictureSrc` reads the bare string of the flat fact map.
- "The picture is drawn while loading." While loading, nothing is drawn.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`:

- `src/components/records/TypePicture.tsx` lines 9-37 (`useTypePicture`, `TypePicture`; `TypePictureButton` from line 39 on is not taken) to `src/TypePicture.tsx`. Code verbatim; the header comment is new and the imports are the unit's own (`./useTypePictureSrc`, and `normalizeTypeName` from `@kaigilb/gilbplatformcode-type-name`).
- `src/lib/base/useTypePictureSrc.ts` (whole) to `src/useTypePictureSrc.ts`. Named changes: `fetchTypePictureSrc` is `source.fetchTypePictureSrc`, where `source` is read from the new `TypePictureSourceContext` (`useContext`); with no source the hook returns null (the effect's first test became `!typeName || !source`); `source` is in the effect's dependency list after `typeName`.
- `src/lib/base/typePicture.ts` to `src/pictureSource.ts`: `TYPE_PICTURE_ATTR` (line 15) as a module constant; `typeTermUrl` (64-68), `fetchTypePictureSrc` (91-117), `clearTypePictureCache` (119-121), `fileBytesUrl` (133-152), `typePictureSrc` (156-161) and `recordTypePictureSrc` (184-189) inside `createTypePictureSource`, bodies verbatim except: `TYPE_TERM_ORIGIN` is `opts.termOrigin`; `vaultOriginOf(id)` is `opts.originOf(id)`; `fetch(` is `(opts.fetch ?? globalThis.fetch)(`; the module-level `pictureCache` (line 89) is one `Map` per source, made inside the factory; the `export` of each function is dropped (they are returned as the source). Not taken: `TYPE_TERM_ORIGIN` (line 18), `normalizeTypeName` (21-32; `@kaigilb/gilbplatformcode-type-name` has the same function, compared with comments stripped and identical), `LOWER_TYPE_NAMES`, `pascalFromLower`, `inferTypeName` (35-62), `fileThumbnailSrc` (71-87). Comments made generic.
- `src/index.ts` is new.

The tests are ported from `src/lib/base/typePicture.test.ts` (the cases of `typePictureSrc`, `typeTermUrl` and `recordTypePictureSrc`, with the expected strings made to follow the `termOrigin` and `originOf` passed; `fileThumbnailSrc`, `inferTypeName` and the `normalizeTypeName` case are not in this unit). The render cases of `src/components/records/TypePictures.v32.test.tsx` all draw the Endpoint line and its popover, so they are not ported; `src/TypePicture.test.tsx` is new and pins the same behaviour on `TypePicture` (nothing without a provider or while loading, the `<img>` once loaded, nothing after `onError`, the failure reset on a change of type name). `src/pictureSource.test.ts` is new for the cache and `fileBytesUrl`.
