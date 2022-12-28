import { microQueueTaskNative } from '../../util';
import { preserveState } from '../statePreserver/preserverState';

function createLockableQueue<T>() {
  let queue: Set<T> = new Set();
  let isQueueLocked = false;
  let isSignalingAwaitingLock = false;
  const awaitingLockRelease = [] as Array<(isEmpty: boolean) => void>;

  function grantLockAccess<T extends (...args: any[]) => any>(
    fn: T extends infer U extends Function ? U : never
  ) {
    return function (...args: Parameters<T>): ReturnType<T> {
      if (!isQueueLocked) {
        return fn(...args);
      }

      throw new Error('Queue is currently in locked mode');
    };
  }

  function push(value: T) {
    if (!queue.has(value)) {
      queue.add(value);
    }
  }

  function pop(): T | undefined {
    const [nextTask] = queue;
    _removeTask(nextTask);
    return nextTask;
  }

  function _removeTask(value: T) {
    queue.delete(value);
  }

  function clear() {
    queue.forEach(_removeTask);
  }

  function flush(task: (value: T) => void | Promise<void>) {
    lock();
    microQueueTaskNative(async () => {
      try {
        while (queue.size) {
          const asyncWaiter = task(pop()!);
          if (asyncWaiter instanceof Promise) {
            await asyncWaiter;
          }
        }
      } catch (e) {
        throw e;
      } finally {
        release();
      }
    });
  }

  function lock() {
    if (!isSignalingAwaitingLock) {
      isQueueLocked = true;
    }
  }

  function release() {
    if (!isQueueLocked) return;
    isQueueLocked = false;
    try {
      isSignalingAwaitingLock = true;

      const lockerError = [] as Array<{
        releaser: (isEmpty: boolean) => void;
        error: unknown;
      }>;

      awaitingLockRelease.forEach((releaser) => {
        const releaserSafeContext = preserveState(
          () => releaser(isEmpty()),
          {},
          true
        );
        if (!releaserSafeContext.isSuccess) {
          lockerError.push({ releaser, error: releaserSafeContext.error });
        }
      });

      if (lockerError.length) throw lockerError;
    } finally {
      isSignalingAwaitingLock = false;
    }
  }

  function awaitLock(): Promise<boolean> {
    return new Promise((res) => {
      if (isQueueLocked) {
        awaitingLockRelease.push(() => {
          res(isEmpty());
        });
      } else {
        res(isEmpty());
      }
    });
  }

  function isEmpty() {
    return queue.size == 0;
  }

  return {
    pop: grantLockAccess(pop),
    push: grantLockAccess(push),
    clear: grantLockAccess(clear),
    flush: grantLockAccess(flush),
    lock: grantLockAccess(lock),
    release: grantLockAccess,
    isEmpty,
    awaitLock,
  };
}

export { createLockableQueue };
