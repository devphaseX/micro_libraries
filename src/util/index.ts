export function cloneList<T>(list: Array<T>) {
  return list.slice(0);
}

export function microqueueTask(queueTask: () => void) {
  void queueMicrotask(queueTask);
}
