type NotifyAvailable = () => void;

type Resolve<T> = (value: T) => void;
type Reject<E> = (reason: E) => void;

export type Task<T> = {
  resolve: Resolve<T>;
  reject: Reject<unknown>;
  postMessageArgs: [message: any, transfer: Transferable[]];
};

export class TasKWorker<T> extends Worker {
  available: boolean;
  resolve: Resolve<T> | null;
  reject: Reject<unknown> | null;
  constructor(
    public notify: NotifyAvailable,
    ...workArgs: [scriptURL: string | URL, options?: WorkerOptions | undefined]
  ) {
    super(...workArgs);
    // Initialize as unavailable
    this.available = false;
    this.resolve = null;
    this.reject = null;

    this.onmessage = () => this.notify();
  }

  dispatch({ resolve, reject, postMessageArgs }: Task<T>) {
    this.available = false;

    this.onmessage = ({ data }: { data: T }) => {
      resolve(data);
      this.notify();
    };

    this.onerror = (e) => {
      reject(e);
      this.notify();
    };

    this.postMessage(...postMessageArgs);
  }

  setAvailable() {
    this.available = true;
    this.resolve = null;
    this.reject = null;
    this.notify();
  }
}
