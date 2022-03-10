type Task = (arg: any, next: (passValue: any) => void) => void;
type ProgressStatus = Exclude<ControlTask['status'], 'pending'>;

interface ControlTask {
  status: 'pending' | 'executing' | 'complete';
  arg: any;
  task: Task;
}

function sequence(...fns: Array<Task>) {
  let currentTask: ControlTask | null = null;
  let pendingTask: ControlTask | null = null;

  function createTask(fn: Task, value: any): ControlTask {
    return { task: fn, arg: value, status: 'pending' };
  }

  function microqueueControlTask() {
    void queueMicrotask(delegateControl);
  }

  function resume(value: unknown) {
    if (!fns.length) return;
    if (currentTask) {
      if (currentTask.status === 'executing') {
        if (pendingTask) {
          throw new Error(
            'You can only delegate control within a function scope once'
          );
        }
        pendingTask = createTask(fns.shift()!, value);
      } else {
        currentTask = createTask(fns.shift()!, value);
        microqueueControlTask();
      }
    }
  }

  function markProgress(task: ControlTask, status: ProgressStatus) {
    return void (task.status = status);
  }

  function delegateControl() {
    if (currentTask && currentTask.status === 'pending') {
      const { task, arg } = currentTask;

      function monitorControlDelegate() {
        markProgress(currentTask!, 'executing');
        task(arg, resume);
        markProgress(currentTask!, 'complete');

        if (pendingTask) {
          currentTask = pendingTask;
          pendingTask = null;
          microqueueControlTask();
        }
      }

      monitorControlDelegate();
    }
  }

  return function (initial: any) {
    if (!fns.length) {
      throw new Error('Expected One or more sequencial fn, but got none');
    }
    currentTask = createTask(fns.shift()!, initial);

    return void delegateControl();
  };
}

export default sequence;
