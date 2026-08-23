/**
 * Run persistence operations in invocation order while allowing the queue to
 * continue after a rejected operation. The returned promise still preserves
 * the individual operation's success or failure for its caller.
 */
export function createSerializedOperationQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    if (typeof operation !== 'function') {
      return Promise.reject(new TypeError('A queued persistence operation must be a function.'));
    }
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
