/** debounce 带 maxWait（04 §3.2：300ms 防抖 / 2000ms 强制写；session 800ms）。 */
export interface Debounced {
  (): void;
  flush(): void;
  cancel(): void;
  pending(): boolean;
}

export function debounce(fn: () => void, waitMs: number, maxWaitMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstCallAt = 0;
  let lastCallAt = 0;

  const run = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    firstCallAt = 0;
    fn();
  };

  const armed = (): Debounced =>
    Object.assign(() => {
      const now = Date.now();
      if (firstCallAt === 0) firstCallAt = now;
      lastCallAt = now;
      if (timer !== null) clearTimeout(timer);
      const waited = now - firstCallAt;
      const remaining = Math.max(0, Math.min(waitMs, maxWaitMs - waited));
      timer = setTimeout(run, remaining);
    }, {
      flush: run,
      cancel: () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        firstCallAt = 0;
      },
      pending: () => timer !== null && lastCallAt > 0,
    });

  return armed();
}
