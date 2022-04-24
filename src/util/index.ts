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

type QueuedItem<T> = { value: T; next: QueuedItem<T> | null };

type QueueRoot<T> = {
  head: QueuedItem<T> | null;
  tail: QueuedItem<T> | null;
  count: number;
};

export function createMiniQueue<T>(value?: T) {
  const root: QueueRoot<T> = {
    head: null,
    tail: null,
    count: 0,
  };

  function createItem(value: T) {
    return { value, next: null };
  }

  if (value) {
    root.head = root.tail = createItem(value);
  }

  return {
    dequeue: function () {
      const head = root.head;
      if (!head) return null;

      if (head.next === null) {
        root.head = root.tail = null;
      } else {
        root.head = head.next;
      }
      root.count--;
      return head.value;
    },
    enqueue: function (value: T) {
      const prevTail = root.tail;
      if (prevTail === null) {
        root.tail = root.head = createItem(value);
      } else {
        prevTail.next = createItem(value);
        root.tail = prevTail.next;
      }
      root.count++;
    },

    isEmpty() {
      return root.head === null;
    },

    get size() {
      return root.count;
    },
  };
}

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

  return {
    pop,
    push,
    clear,
    isEmpty: function () {
      return queue.size === 0;
    },
  };
}

export function nativeTaskQueuer(task: Task) {
  Promise.resolve()
    .then(() => task())
    .catch(noop);
}

type NonEmpty<T> = Exclude<T, undefined | void | null>;

export function isFunction<T>(value: T): value is NonEmpty<T> {
  return typeof value === 'function';
}
