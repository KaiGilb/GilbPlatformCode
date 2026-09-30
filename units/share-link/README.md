# Share link

Builds a link to the screen someone is looking at, so another person can open the same screen.

The link carries only the view: which vault, record, section, or folder. It does not carry a sign-in, and it does not grant access. Opening it still depends on what the opener is allowed to see. If a token was sitting in the address, it is left out.

If the link would be longer than 2000 characters, nothing is returned. The screen should say it is too large. Do not cut the link and hand someone a broken one.

Pass the site origin and the public path prefix in. This unit does not read them off the page.
