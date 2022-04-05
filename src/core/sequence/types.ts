export interface ControlTaskContext {
  status: 'pending' | 'executing' | 'complete';
  arg: any;
  task: Task;
}

export interface SequenceOption<T> {
  onsuccess: (finalResult: T) => void;
  onerror?: <R>(reason: R) => void;
}

export type Task<A = any, R = any, E extends Error = Error> = (
  arg: A,
  next: (passValue: R | E) => void
) => void;
