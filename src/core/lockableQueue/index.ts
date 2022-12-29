import { createPromiseSignal, microQueueTaskNative } from '../../util/index.js';
import { preserveState } from '../statePreserver/preserverState.js';
import {
  WARN_ABOUT_ACCESS_FN,
  ERROR_QUEUE_IN_LOCK,
  REVOCATION_ERROR,
} from './error_msg.js';

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

interface ReleaseProcessError {
  releaser: (isEmpty: boolean) => void;
  error: unknown;
}

const accessGrantId = Symbol();

const grantAccess = (key: ReleasePayload['lockKey']) => {
  const allow = (internalLock: typeof key) =>
    key === internalLock || internalLock === null;
  allow.grant = accessGrantId;
  return allow;
};

type GrantAccessFn = ReturnType<typeof grantAccess>;

function createLockableQueue<T>() {
  let queue: Set<T> = new Set();
  let isQueueLocked = false;
  let isSignalAwaitingLock = false;
  let awaitingLockFns = [] as Array<(isEmpty: boolean) => void>;
  let releaseLock: string | symbol | null = null;
  let internalLockActive = false;

  function grantProtectAccess<T extends Function>(fn: T): T {
    return function (...args: any[]) {
      const accessFn = args[0] as GrantAccessFn | undefined;
      if (
        !internalLockActive &&
        (!isQueueLocked ||
          (accessFn &&
            accessFn.grant === accessGrantId &&
            accessFn(releaseLock)))
      ) {
        return fn(...args);
      }

      if (typeof accessFn === 'function') {
        console.warn(WARN_ABOUT_ACCESS_FN);
      }
      throw new Error(ERROR_QUEUE_IN_LOCK);
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
    if (isSignalAwaitingLock) {
      throw new Error('Acquiring lock failed, queue in lock mode');
    }
    if (!isSignalAwaitingLock) isQueueLocked = true;

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
      isSignalAwaitingLock = true;

      const lockerError = [] as Array<ReleaseProcessError>;

      for (let awaitLockFn of awaitingLockFns) {
        const context = preserveState(() => awaitLockFn(isEmpty()), {}, true);
        if (context.isSuccess) continue;
        lockerError.push({ releaser: awaitLockFn, error: context.error });
      }

      if (lockerError.length) throw lockerError;
    } finally {
      isSignalAwaitingLock = false;
      awaitingLockFns = [];
    }
  }

  function awaitLockRelease(signal?: AbortSignal): Promise<boolean> {
    let awaitFn: () => void;
    return new Promise<boolean>((res) => {
      if (isQueueLocked) {
        awaitingLockFns.push(
          (awaitFn = () => {
            res(isEmpty());
          })
        );
        if (signal) {
          signal.addEventListener(
            'abort',
            () =>
              (awaitingLockFns = awaitingLockFns.filter(
                (lock) => lock !== awaitFn
              )),
            { once: true }
          );
        }
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
        ? Promise.race([
            awaitLockRelease(exitLock),
            createPromiseSignal(exitLock, REVOCATION_ERROR),
          ])
        : awaitLockRelease());
    }
    return lockableQueue.lock();
  }

  const lockableQueue = {
    pop: grantProtectAccess(pop),
    push: grantProtectAccess(push),
    clear: grantProtectAccess(clear),
    flush: grantProtectAccess(flush),
    lock: grantProtectAccess(lock),
    isEmpty,
    awaitLock: awaitLockRelease,
    getRelease,
    awaitLockAccess,
    isLocked() {
      return releaseLock != null;
    },
    grantAccess,
  };

  return lockableQueue as UseLock<typeof lockableQueue>;
}

export { createLockableQueue };
