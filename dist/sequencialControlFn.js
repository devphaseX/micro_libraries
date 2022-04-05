const DELEGATE_CONTROL_ERROR =
  'You can only delegate control within a function scope once';
function cloneList(list) {
  return list.slice(0);
}
function sequence(controlFns, options) {
  debugger;
  let currentTask = null;
  let pendingTask = null;
  const nonEnqueueTaskFns = cloneList(controlFns);
  function createTask(fn, value) {
    return { task: fn, arg: value, status: 'pending' };
  }
  function microqueueControlTask(queueTask) {
    void queueMicrotask(queueTask);
  }
  function resume(value) {
    if (value instanceof Error) {
      return handleThrownError(value);
    }
    if (currentTask && currentTask.status === 'executing') {
      if (pendingTask) throw new Error(DELEGATE_CONTROL_ERROR);
      return void (pendingTask = createTask(nonEnqueueTaskFns.shift(), value));
    }
    const task = nonEnqueueTaskFns.length
      ? nonEnqueueTaskFns.shift()
      : options.onsuccess;
    currentTask = createTask(task, value);
    microqueueControlTask(delegateControl);
  }
  function markProgress(task, status) {
    return void (task.status = status);
  }
  function scopeTaskProgress(currentTask, taskRunScope) {
    markProgress(currentTask, 'executing');
    taskRunScope();
    markProgress(currentTask, 'complete');
  }
  function shiftToCurrent(task) {
    currentTask = task;
    pendingTask = null;
  }
  function throwErrorOnNextCycle(error) {
    microqueueControlTask(() => {
      throw error;
    });
  }
  function handleThrownError(e) {
    const { onerror } = options;
    if (onerror) return void onerror(e);
    throwErrorOnNextCycle(e);
  }
  function delegateControl() {
    if (currentTask && currentTask.status === 'pending') {
      const { task, arg } = currentTask;
      let erroredDuringControl = false;
      scopeTaskProgress(currentTask, function () {
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
  return function (initial) {
    if (!nonEnqueueTaskFns.length) {
      throw new Error('Expected One or more sequencial fn, but got none');
    }
    return void resume(initial);
  };
}
export default sequence;
