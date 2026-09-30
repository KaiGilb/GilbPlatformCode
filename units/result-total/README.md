# Result total

Use this when a list says how many things matched.

A count is one of three things: exact, a lower bound ("more than 200"), or a guess ("about 3000000"). This unit is the only way to turn that into words. A lower bound is never printed as a plain number. "Nothing matched" is allowed only when the count is an exact zero. If the server sent no count, this returns nothing. It does not invent zero.

The app passes the response body in. This unit does not call the network.
