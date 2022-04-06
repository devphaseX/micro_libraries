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
