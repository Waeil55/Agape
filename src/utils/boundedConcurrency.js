export async function forEachWithConcurrency(items, worker, concurrency = 4) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return;
  const limit = Math.max(1, Math.min(list.length, Math.floor(Number(concurrency) || 1)));
  let nextIndex = 0;
  let firstError;
  let failed = false;

  const run = async () => {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= list.length) return;
      try {
        await worker(list[index], index);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, run));
  if (failed) throw firstError;
}
