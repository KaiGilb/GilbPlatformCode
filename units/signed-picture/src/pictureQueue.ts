// A tiny queue: at most `limit` picture fetches in flight at once.
const LIMIT = 4;
let active = 0;
const waiting: Array<() => void> = [];

function next(): void {
  while (active < LIMIT && waiting.length > 0) {
    active++;
    waiting.shift()!();
  }
}

export function queuePicture<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push(() => {
      job().then(resolve, reject).finally(() => {
        active--;
        next();
      });
    });
    next();
  });
}
