import { noop } from '../../util/index.js';

type Observer<V> = (value: V) => void;
type Mappable<T, U> = (value: T) => U;

export type Obervable<T> = {
  from<U>(fn: Mappable<T, U>): Obervable<U>;
  observe(notifier: Observer<T>): void;
  stop(): void;
};

type CleanupFn = (reset: () => void) => void;

function createObservable<T>(
  observable: (next: Observer<T>, cleanup: CleanupFn) => void
) {
  let subscriber: Array<Observer<T>> = [];
  let _resetInternalFn: null | (() => void) = null;

  function from<U>(map: Mappable<T, U>) {
    return createObservable<U>((next) => {
      observe((value) => {
        next(map(value));
      });
    });
  }

  let notify = function (value: T) {
    subscriber.forEach((subsriber) => {
      subsriber(value);
    });
  };

  function observe(notifier: Observer<T>) {
    if (subscriber.length === 0) {
      observable(
        function (value: T) {
          notify(value);
        },
        function (reset) {
          _resetInternalFn = reset;
        }
      );
    }
    subscriber.push(notifier);
  }

  function pipe<A, B, C>(observableCreators: [Mappable<A, B>, Mappable<B, C>]) {
    return createObservable<T>((next, _r1) => {
      let observable: Obervable<any> = _self;
      let _internalObserverFnIndex = subscriber.length - 1;

      observableCreators.forEach((mapFn) => {
        let lastObservable = observable;
        observable = createObservable(function (next, _r2) {
          lastObservable.observe(function (value) {
            next(mapFn(value));
          });

          _r2(function () {
            if (
              lastObservable !== _self ||
              lastObservable.observe !== _self.observe
            ) {
              lastObservable.stop();
            } else {
              subscriber.splice(_internalObserverFnIndex, 1);
            }
          });
        });
      });

      _r1(function () {
        observable.stop();
      });

      observable.observe(next);
    });
  }

  function stop() {
    notify = noop;
    if (_resetInternalFn) {
      _resetInternalFn();
      _resetInternalFn = null;
    }
    subscriber = [];
  }

  const _self = { from, observe, pipe, stop };
  return _self;
}

export default createObservable;
