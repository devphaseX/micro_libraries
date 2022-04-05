type Task<A = any, R = any, E extends Error = Error> = (
  arg: A,
  next: (passValue: R | E) => void
) => void;
type ProgressStatus = Exclude<ControlTask['status'], 'pending'>;

const DELEGATE_CONTROL_ERROR =
  'You can only delegate control within a function scope once';

interface ControlTask {
  status: 'pending' | 'executing' | 'complete';
  arg: any;
  task: Task;
}

interface SequenceOption<T> {
  onsuccess: (finalResult: T) => void;
  onerror?: <R>(reason: R) => void;
}

function cloneList<T>(list: Array<T>) {
  return list.slice(0);
}

function sequence<A, B, C>(
  controlFns: [Task<A, B>, Task<B, C>],
  options: SequenceOption<C>
): (initial: A) => void;
function sequence<A, B, C, D>(
  controlFns: [Task<A, B>, Task<B, C>, Task<C, D>],
  options: SequenceOption<D>
): (initial: A) => void;
function sequence<A, B, C, D, E>(
  controlFns: [Task<A, B>, Task<B, C>, Task<C, D>, Task<D, E>],
  options: SequenceOption<E>
): (initial: A) => void;
function sequence<A, B, C, D, F>(
  controlFns: [Task<A, B>, Task<B, C>, Task<C, D>, Task<D, F>],
  options: SequenceOption<F>
): (initial: A) => void;
function sequence<A, B, C, D, F, E>(
  controlFns: [Task<A, B>, Task<B, C>, Task<C, D>, Task<D, F>, Task<F, E>],
  options: SequenceOption<E>
): (initial: A) => void;
function sequence<A, B, C, D, F, E, G>(
  controlFns: [
    Task<A, B>,
    Task<B, C>,
    Task<C, D>,
    Task<D, F>,
    Task<F, E>,
    Task<E, G>
  ],
  options: SequenceOption<G>
): (initial: A) => void;
function sequence<A, B, C, D, F, E, G, H>(
  controlFns: [
    Task<A, B>,
    Task<B, C>,
    Task<C, D>,
    Task<D, F>,
    Task<F, E>,
    Task<E, G>,
    Task<G, H>
  ],
  options: SequenceOption<H>
): (initial: A) => void;
function sequence<A, B, C, D, F, E, G, H, I>(
  controlFns: [
    Task<A, B>,
    Task<B, C>,
    Task<C, D>,
    Task<D, F>,
    Task<F, E>,
    Task<E, G>,
    Task<G, H>,
    Task<H, I>
  ],
  options: SequenceOption<I>
): (initial: A) => void;
function sequence<A, B, C, D, F, E, G, H, I, J>(
  controlFns: [
    Task<A, B>,
    Task<B, C>,
    Task<C, D>,
    Task<D, F>,
    Task<F, E>,
    Task<E, G>,
    Task<G, H>,
    Task<H, I>,
    Task<I, J>
  ],
  options: SequenceOption<J>
): (initial: A) => void;
function sequence<A, B, C, D, F, E, G, H, I, J, K>(
  controlFns: [
    Task<A, B>,
    Task<B, C>,
    Task<C, D>,
    Task<D, F>,
    Task<F, E>,
    Task<E, G>,
    Task<G, H>,
    Task<H, I>,
    Task<I, J>,
    Task<J, K>
  ],
  options: SequenceOption<K>
): (initial: A) => void;

function sequence(controlFns: Array<Task>, options: SequenceOption<any>) {
  let currentTask: ControlTask | null = null;
  let pendingTask: ControlTask | null = null;
  const nonEnqueueTaskFns = cloneList(controlFns);

  function createTask(fn: Task, value: any): ControlTask {
    return { task: fn, arg: value, status: 'pending' };
  }

  function microqueueControlTask(queueTask: () => void) {
    void queueMicrotask(queueTask);
  }

  function resume(value: unknown) {
    if (value instanceof Error) {
      return handleThrownError(value);
    }

    if (currentTask && currentTask.status === 'executing') {
      if (pendingTask) throw new Error(DELEGATE_CONTROL_ERROR);
      return void (pendingTask = createTask(nonEnqueueTaskFns.shift()!, value));
    }
    const task = nonEnqueueTaskFns.length
      ? nonEnqueueTaskFns.shift()!
      : options.onsuccess;

    currentTask = createTask(task, value);
    microqueueControlTask(delegateControl);
  }

  function markProgress(task: ControlTask, status: ProgressStatus) {
    return void (task.status = status);
  }

  function scopeTaskProgress(
    currentTask: ControlTask,
    taskRunScope: () => void
  ) {
    markProgress(currentTask, 'executing');
    taskRunScope();
    markProgress(currentTask!, 'complete');
  }

  function shiftToCurrent(task: ControlTask) {
    currentTask = task;
    pendingTask = null;
  }

  function throwErrorOnNextCycle(error: any) {
    microqueueControlTask(() => {
      throw error;
    });
  }

  function handleThrownError(e: any) {
    const { onerror } = options;
    if (onerror) return void onerror(e);
    throwErrorOnNextCycle(e);
  }

  function delegateControl() {
    if (currentTask && currentTask.status === 'pending') {
      const { task, arg } = currentTask;
      let erroredDuringControl = false;

      scopeTaskProgress(currentTask!, function () {
        try {
          task(arg, resume);
        } catch (e) {
          handleThrownError(e);
        } finally {
          erroredDuringControl = true;
        }
      });

      if (pendingTask && !erroredDuringControl) {
        shiftToCurrent(pendingTask);
        microqueueControlTask(delegateControl);
      }
    }
  }

  return function (initial: any) {
    if (!nonEnqueueTaskFns.length) {
      throw new Error('Expected One or more sequencial fn, but got none');
    }
    return void resume(initial);
  };
}
export default sequence;
