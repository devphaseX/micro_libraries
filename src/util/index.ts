export function cloneList<T>(list: Array<T>) {
  return list.slice(0);
}

export function microqueueTask(queueTask: () => void) {
  void queueMicrotask(queueTask);
}

export function getSnapshot<V>(value: V): V {
  return JSON.parse(JSON.stringify(value));
}

export function timeout(ms: number, task: () => void) {
  const timerId = setTimeout(() => {
    task();
  }, ms);
  return timerId;
}

export function getLastItem<T>(list: Array<T>): T | undefined {
  return list.slice(-1)[0];
}

export function testEnvironmentSupport(tester: () => void) {
  let isSupported = true;
  try {
    tester();
  } catch {
    isSupported = false;
  }
  return isSupported;
}

export function noop() {}

export const MAX_ARRAY_SIZE = 2 * 32 - 1;

export function selfRefence<T>(resulter: (ref: () => T) => T) {
  let isRefAvailable = false;
  const res = resulter(function () {
    if (!isRefAvailable) {
      throw new Error(
        `Cannot use self reference during during selfReference function execution.`
      );
    }
    return res;
  });
  isRefAvailable = true;
  return res;
}

type Task = () => void;

export function createDataQueue<T>() {
  let queue: Set<T> = new Set();
  let isQueueLocked = false;

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
    isQueueLocked = true;
  }

  function release() {
    isQueueLocked = false;
  }

  return {
    pop,
    push,
    clear,
    flush,
    lock,
    release,
    isEmpty: function () {
      return queue.size === 0;
    },
  };
}

export function microQueueTaskNative(task: Task) {
  Promise.resolve()
    .then(() => task())
    .catch(noop);
}

type NonEmpty<T> = Exclude<T, undefined | void | null>;

export function isFunction<T>(value: T): value is NonEmpty<T> {
  return typeof value === 'function';
}

export function repeatedSetTimeout(task: () => void, ms = 0) {
  let isCancel = false;
  let id = setTimeout(function scheduler() {
    if (!isCancel) {
      task();
      id = setTimeout(scheduler, ms);
    }
  }, ms);
  return {
    cancel() {
      isCancel = true;
      clearTimeout(id);
    },
    get id() {
      return id;
    },
  };
}
