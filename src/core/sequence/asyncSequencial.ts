import createSyncBlockQueue from './index.js';
import type { Task } from './types';
import { microqueueTask, noop } from '../../util/index.js';

interface AsyncTaskEntryOption {
  wait: (ms: number) => Promise<void>;
}

type AsyncTaskEntry<Arg, Shared, Return> = {
  timeout: number;
  function(option: AsyncTaskEntryOption): Promise<Return> | Return;
  function(arg: Arg, option: AsyncTaskEntryOption): Promise<Return> | Return;
  function(
    arg: Arg,
    sharedArgs: Shared,
    option: AsyncTaskEntryOption
  ): Promise<Return> | Return;
};

interface AsyncBlockQueueOption<Shared extends object> {
  shared: Shared;
  tasks: Array<AsyncTaskEntry<any, Shared, any>>;
  oncomplete: (final: any, shared: Shared) => void;
  onerror: (error: any, shared: Shared) => void;
}

type DoneOption<Args, Shared> = {
  shared: Shared;
  passAlonged: Args;
};

type DoneCase<Args, Shared> = (
  input: DoneOption<Args, Shared>['passAlonged']
) => void;

interface PayloadBasedError<Shared> extends Error {
  payload: AsyncTaskEntry<any, Shared, any>;
}

function isPromiseType<W = any>(value: any): value is Promise<W> {
  return (
    value &&
    typeof value === 'object' &&
    (value instanceof Promise || typeof value.then === 'function')
  );
}

function isTaskTimed(task: AsyncTaskEntry<any, any, any>) {
  return task.timeout && Number.isFinite(task.timeout) && task.timeout > 0;
}

function createAsyncBlockQueue<S extends object>(
  option: AsyncBlockQueueOption<S>
) {
  function formatSyncToAsyncMatch(syncError: {
    error: {
      payload: AsyncTaskEntry<any, S, any>;
    };
    task: {
      arg: {
        shared: S;
      };
      status: string;
      task: any;
    };
  }) {
    const { task, ...rest } = syncError.task;
    return {
      task: rest,
      function: syncError.error.payload,
      fullerror: syncError.error,
    };
  }
  function createAsyncScope(option: AsyncBlockQueueOption<S>) {
    const { shared, tasks } = option;

    function releaseTaskControl(
      task: AsyncTaskEntry<any, S, any>
    ): Task<any, any> {
      return (previousData, next) => {
        let isTaskDone = false;

        function handleOnTaskDone<Args extends unknown[]>(
          next: (...args: Args) => void
        ) {
          return function (...args: Args) {
            if (isTaskDone) return;
            next(...args);
          };
        }

        function wait(ms: number) {
          return new Promise<void>((res) => {
            setTimeout(() => {
              if (!isTaskDone) res();
            }, ms);
          });
        }

        const doneWithError = (
          msg: string,
          task: AsyncTaskEntry<any, S, any>
        ) => {
          return handleOnTaskDone(() => {
            const errorWithPayload = new Error(msg) as PayloadBasedError<S>;
            errorWithPayload.payload = task;
            next(errorWithPayload);
          });
        };
        try {
          const taskArity = task.function.length;
          let result;
          switch (taskArity) {
            case 1: {
              result = task.function({ wait });
              break;
            }
            case 2: {
              result = task.function(previousData, { wait });
              break;
            }
            default: {
              result = task.function(previousData, { ...shared }, { wait });
            }
          }

          const done = handleOnTaskDone(next);

          if (isPromiseType(result)) {
            if (isTaskTimed(task)) {
              let timeout = setTimeout(() => {
                doneWithError('Task timeout', task)();
                isTaskDone = true;
              }, task.timeout) as unknown as number;

              result
                .finally(() => {
                  clearInterval(timeout);
                  timeout = -1;
                })
                .catch(noop);
            }
            (result as Promise<any>).then(done, doneWithError('', task));
          } else done(result);
        } catch (e) {
          doneWithError((e as Error).message || (e as string), task);
        }
      };
    }
    return tasks.map(releaseTaskControl);
  }
  const startTaskBlocking = createSyncBlockQueue<any, any>(
    createAsyncScope(option) as [Task],
    {
      onsuccess(output) {
        microqueueTask(() => option.oncomplete(output, option.shared));
      },
      onerror(error) {
        microqueueTask(() =>
          option.onerror(formatSyncToAsyncMatch(error), option.shared)
        );
      },
    }
  );

  return function () {
    startTaskBlocking({ shared: option.shared });
  };
}

export { createAsyncBlockQueue };
