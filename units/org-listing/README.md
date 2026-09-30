# org-listing

Whether a listing value is public or private. A value that is neither is shown as public.

## What this is

`isOrgListing(value)` is true only for the strings `public` and `private`.

`listingFromBody(listing)` returns that spelling when the check passes, and `public` when it does not.

## What this is not

- Not a request. The host already has the body.
- Not the server's "there is no claim" answer. That answer is decided on the server. This function only reads a value the client already decoded.
- Not a trim, and not a case fold. `Public` is not a listing. `private ` (with a space) is not a listing.

## How to take it

Package: `@kaigilb/gilbplatformcode-org-listing`

```ts
import { isOrgListing, listingFromBody } from "@kaigilb/gilbplatformcode-org-listing";

const shown = listingFromBody(body.listing);
```

## What you pass

The `listing` field from the body, which may be missing. Pass the field, not the whole response, unless you have already taken `listing` off it.

## What you get

`public` or `private`.

A stored `private` stays `private`. A stored `public` stays `public`. Missing, null, `""`, `Public`, and any other value become `public`.

You cannot tell a missing body from a stored public. Both come back `public`. That is the same in both apps. Do not "fix" the fallback to `private` or the screen will disagree with them.

## Examples

```ts
isOrgListing("private") === true;
isOrgListing("Public") === false;
listingFromBody("private") === "private";
listingFromBody(undefined) === "public";
listingFromBody("Public") === "public";
```

## The host must supply

The decoded body. Saving a listing stays in the app. This unit does not check that the person may change it.

## Do not

- Do not treat a false result from `isOrgListing` as "private". The show function maps that false result to public.
- Do not trim before the check. A space is a bad body, and a bad body is shown as public, not rejected.
- Do not use this as the server's fail-closed rule. The server and the screen are different layers.

## Wrong readings

- "The word public in the result means the group was set to public." It might. It also means the body was not one of the two spellings.
- "Private should be the safe fallback." It would be a different product. Both apps show public.

## Where it was taken from

MyNetBase `src/lib/base/orgListing.ts` and GilbApp `src/lib/base/orgListing.ts`. The same two functions. The fetch stays in each app.
