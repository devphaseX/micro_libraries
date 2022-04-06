import { cloneList, microqueueTask } from '../../util/index.js';
import * as error from './errorMessage.js';
import {
  ControlTaskContext,
  ContextError,
  SequenceOption,
  Task,
} from './types.js';

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
  controlFns = cloneList(controlFns);
  let currentTask: ControlTaskContext | null = null;
  let pendingTask: ControlTaskContext | null = null;
  let nonEnqueueTaskFns = cloneList(controlFns).reverse();
  let erroredDuringControl = false;

  function createTask(fn: Task, value: any): ControlTaskContext {
    return { task: fn, arg: value, status: 'pending' };
  }

  function popNextTask() {
    return nonEnqueueTaskFns.length
      ? nonEnqueueTaskFns.pop()!
      : options.onsuccess;
  }

  function pendTask(task: Task, value: unknown) {
    pendingTask = createTask(task, value);
  }

  function transferFlow(task: ControlTaskContext) {
    if (!currentTask || task !== currentTask) {
      shiftToCurrent(task, pendingTask === task);
    }
    microqueueTask(delegateControl);
  }

  function release(value?: unknown) {
    if (value instanceof Error) {
      if (currentTask) {
        const task = currentTask;
        return mark(task, function (progress) {
          progress(
            task.status === 'executing'
              ? 'erroredbeforesynccomplete'
              : 'erroredaftersynccomplete',
            value
          );
        });
      }
    }
    if (pendingTask) return handleThrownError(error.DELEGATE_CONTROL_ERROR);

    if (currentTask) {
      switch (currentTask.status) {
        case 'pending':
          return handleThrownError(error.TASK_IN_PENDING_DURING_RELEASE_ERROR);

        case 'executing':
          return pendTask(popNextTask(), value);

        case 'complete': {
          return transferFlow(createTask(popNextTask(), value));
        }
      }
    }
  }

  type ProgressMarkFn = (
    mode: ControlTaskContext['status'],
    errored?: any
  ) => void;

  function mark(
    task: ControlTaskContext,
    scoper: (progresser: ProgressMarkFn) => void
  ) {
    const progresser: ProgressMarkFn = function (mode, error) {
      task.status = mode;
      if (mode.includes('error')) {
        return void handleThrownError(error);
      }
    };
    scoper(progresser);
  }

  function shiftToCurrent(task: ControlTaskContext, clearPending?: boolean) {
    if (clearPending) {
      pendingTask = null;
    }
    currentTask = task;
  }

  function throwErrorOnNextCycle(error: any) {
    microqueueTask(() => {
      throw error;
    });
  }

  function handleThrownError(e: any) {
    erroredDuringControl = true;
    const { onerror } = options;
    const error: ContextError = { error: e, task: currentTask! };
    if (onerror) return void onerror(error);
    return void throwErrorOnNextCycle(error);
  }

  function delegateControl() {
    if (erroredDuringControl) return;

    if (currentTask) {
      switch (currentTask.status) {
        case 'complete':
        case 'executing': {
          return handleThrownError(
            error.CONTROL_DELEGATE_ERROR(currentTask.status)
          );
        }

        case 'pending': {
          const { task, arg } = currentTask;
          mark(currentTask, function (progress) {
            try {
              progress('executing');
              task(arg, release);
            } catch (e) {
              return progress('error', e);
            }
            progress('complete');
            if (pendingTask) transferFlow(pendingTask);
          });
        }
      }
    }
  }

  function initFlow(initial: any) {
    const task = createTask(popNextTask(), initial);
    return transferFlow(task);
  }

  return function (initial: any) {
    if (!nonEnqueueTaskFns.length) {
      throw new Error(error.MORE_FUNCTION_ERROR);
    }
    return initFlow(initial);
  };
}
export default sequence;
