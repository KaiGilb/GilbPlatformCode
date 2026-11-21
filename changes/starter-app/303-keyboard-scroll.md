---
unit: starter-app
kind: fix
audience: developer
breaking: false
action: none; an app taken from the starter gets it with the unit. If a section of yours wrapped its screen in a scroller only to make it scroll, you may take that scroller out.
pr: 303
---
The centre and the right region of the starter's frame scroll themselves, take the focus with Tab, have a name (the open section's label; `words.detail`, "Details") and show a focus ring, so a screen taller than the window is scrolled from the keyboard. This was run in Chrome only; other browsers were not run. On a wide window shorter than the screen the centre did not scroll at all before.
