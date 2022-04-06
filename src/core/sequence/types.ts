export type ControlTaskContext = {
  status:
    | 'pending'
    | 'executing'
    | 'complete'
    | 'error'
    | 'erroredaftersynccomplete'
    | 'erroredbeforesynccomplete';
  arg: any;
  task: Task;
};

export type ContextError = {
  task: ControlTaskContext;
  error: any;
};

export interface SequenceOption<T> {
  onsuccess: (finalResult: T) => void;
  onerror?: (reason: ContextError) => void;
}

export type Task<A = any, R = any, E extends Error = Error> = (
  arg: A,
  next: (passValue: R | E) => void
) => void;
