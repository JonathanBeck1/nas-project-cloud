const tails = new Map<string, Promise<void>>();

// The app is a single process, so an in-memory chain per session is enough to keep
// chunk and complete requests for the same upload from interleaving.
export function withUploadSessionLock<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const run = (tails.get(sessionId) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  tails.set(sessionId, tail);
  void tail.then(() => {
    if (tails.get(sessionId) === tail) {
      tails.delete(sessionId);
    }
  });
  return run;
}
