import { microQueueTaskNative } from '../../util/index.js';
import { preserveState } from '../statePreserver/preserverState.js';

interface _LockOption {
  keyAccess?: string;
}

type ReleasePayload = { lockKey: string | symbol | null; release: () => void };

type UseLock<T> = {
  [K in keyof T]: T[K] extends (...args: [...infer Args]) => infer R
    ? ((key: () => { lockKey: string | symbol | null }, ...args: Args) => R) &
        T[K]
    : T[K];
};

const accessGrantId = Symbol();

const grantAccess = (key: ReleasePayload['lockKey']) => {
  const allow = (internalLock: typeof key) =>
    key === internalLock || internalLock === null;
  allow.grant = accessGrantId;
  return allow;
};

function createLockableQueue<T>() {
  let queue: Set<T> = new Set();
  let isQueueLocked = false;
  let isSignalingAwaitingLock = false;
  const awaitingLockRelease = [] as Array<(isEmpty: boolean) => void>;
  let releaseLock: string | symbol | null = null;
  let internalLockActive = false;

  function grantLockAccess<T extends Function>(fn: T): T {
    return function (...args: any[]) {
      const accessFn = args[0] as ReturnType<typeof grantAccess> | undefined;
      if (!internalLockActive && (!isQueueLocked || accessFn?.(releaseLock))) {
        return fn(...args);
      }

      throw new Error('Queue is currently in locked mode');
    } as unknown as T;
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
    internalLockActive = true;
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
        internalLockActive = false;
      }
    });
  }

  type LockOption = _LockOption;
  function lock(option?: LockOption) {
    if (isSignalingAwaitingLock) {
      throw new Error('Acquiring lock failed, queue in lock mode');
    }
    if (!isSignalingAwaitingLock) isQueueLocked = true;

    const supportSymbol = typeof Symbol === 'function';
    const supportGlobalSymbol =
      supportSymbol && typeof Symbol.for === 'function';

    if (supportGlobalSymbol && option?.keyAccess) {
      releaseLock = Symbol.for(option.keyAccess);
    } else if (supportSymbol && option?.keyAccess) {
      releaseLock = Symbol(option.keyAccess);
    } else {
      releaseLock = option?.keyAccess ?? Math.random().toString().slice(2);
    }

    return getRelease(releaseLock) as ReleasePayload;
  }

  async function release(key: typeof releaseLock) {
    if (!isQueueLocked || key !== releaseLock) return;

    releaseLock = null;
    isQueueLocked = false;
    try {
      isSignalingAwaitingLock = true;

      const lockerError = [] as Array<{
        releaser: (isEmpty: boolean) => void;
        error: unknown;
      }>;

      for (let releaseFn of awaitingLockRelease) {
        const context = preserveState(() => releaseFn(isEmpty()), {}, true);
        if (context.isSuccess) continue;
        lockerError.push({ releaser: releaseFn, error: context.error });
      }

      if (lockerError.length) throw lockerError;
    } finally {
      isSignalingAwaitingLock = false;
    }
  }

  function awaitLockRelease(): Promise<boolean> {
    return new Promise<boolean>((res) => {
      if (isQueueLocked) {
        awaitingLockRelease.push(() => {
          res(isEmpty());
        });
      } else {
        res(isEmpty());
      }
    }).then<boolean>((status) => {
      return isQueueLocked ? awaitLockRelease() : status;
    });
  }

  function isEmpty() {
    return queue.size == 0;
  }

  function getRelease(key?: typeof releaseLock): ReleasePayload | null {
    if (key === releaseLock) {
      return { lockKey: releaseLock, release: () => release(key) };
    }
    return null;
  }

  async function awaitLockAccess(exitLock?: AbortSignal) {
    if (lockableQueue.isLocked()) {
      await (exitLock
        ? Promise.all([
            new Promise((_, rej) => {
              if (exitLock.aborted)
                rej('Lock access revoked externally using an abort signal');
              exitLock.addEventListener(
                'abort',
                () =>
                  rej('Lock access revoked externally using an abort signal'),
                { once: true }
              );
            }),
            awaitLockRelease(),
          ])
        : awaitLockRelease());
    }
    return lockableQueue.lock();
  }

  const lockableQueue = {
    pop: grantLockAccess(pop),
    push: grantLockAccess(push),
    clear: grantLockAccess(clear),
    flush: grantLockAccess(flush),
    lock: grantLockAccess(lock),
    isEmpty,
    awaitLock: awaitLockRelease,
    getRelease,
    awaitLockAccess,
    isLocked() {
      return releaseLock != null;
    },
  };

  return lockableQueue as UseLock<typeof lockableQueue>;
}

export { createLockableQueue };
