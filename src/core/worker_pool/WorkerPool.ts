import { Task, TasKWorker } from './WorkerTask';

class WorkerPool {
  taskQueue: Task<unknown>[];
  workers: TasKWorker<unknown>[];
  constructor(workerPool: number, ...workerArgs: any[]) {
    this.taskQueue = [];
    this.workers = [];

    Array.from(
      { length: workerPool },
      //@ts-ignore;
      () => new TasKWorker(() => this.dispatchIfAvailable(), ...workerArgs)
    );
  }

  enqueue(...postMessageArgs: [message: any, transfer: Transferable[]]) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ resolve, reject, postMessageArgs });
    });
  }

  // Sends a task to the next available worker if there is one
  dispatchIfAvailable() {
    if (!this.taskQueue.length) {
      return;
    }
    for (const worker of this.workers) {
      if (worker.available) {
        let a = this.taskQueue.shift()!;
        worker.dispatch(a);
        break;
      }
    }
  }

  // Kills all the workers
  close() {
    for (const worker of this.workers) {
      worker.terminate();
    }
  }
}

export default WorkerPool;
