// A tiny queue: at most `limit` picture fetches in flight at once.
const DEFAULT_LIMIT = 4;
let limit = DEFAULT_LIMIT;
let active = 0;
const waiting: Array<() => void> = [];

function next(): void {
  while (active < limit && waiting.length > 0) {
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

/** Sets how many picture fetches may run at once (default 4). Raising it starts waiting jobs at once. */
export function setPictureQueueLimit(n: number): void {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("The picture queue limit must be a whole number of at least 1.");
  limit = n;
  next();
}
