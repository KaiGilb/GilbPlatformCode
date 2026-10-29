// A virtual clock for the tests (not shipped). A door that "takes 4 ms" is a timer on this clock; nothing waits on the wall
// clock. The clock moves to the next timer only when everything else has settled (two turns of the event loop with no timer
// due), so the order of events is the order of the virtual times, then the order the timers were set.
type Timer = { at: number; seq: number; go: () => void };

const timers: Timer[] = [];
let virtualNow = 0;
let seq = 0;
let pumping = false;

const turn = (): Promise<void> => new Promise((r) => setImmediate(r));

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      await turn();
      await turn();
      const next = timers.sort((a, b) => a.at - b.at || a.seq - b.seq).shift();
      if (!next) break;
      virtualNow = Math.max(virtualNow, next.at);
      next.go();
    }
  } finally {
    pumping = false;
  }
}

/** The virtual time in ms. */
export const now = (): number => virtualNow;

/** Resolves after `ms` of virtual time. */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((go) => {
    timers.push({ at: virtualNow + ms, seq: seq++, go });
    void pump();
  });
}

/** Lets everything that can settle without a timer settle. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await turn();
}
