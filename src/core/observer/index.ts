import { noop } from '../../util/index.js';

type Observer<V> = (value: V) => void;
type Mappable<T, U> = (value: T) => U;

type TerminateOption = { stop: () => void; unsubscribe: () => void };

export type Obervable<T> = {
  from<U>(fn: Mappable<T, U>): Obervable<U>;
  observe(notifier: Observer<T>): TerminateOption;
  stop(): void;
};

type CleanupFn = (reset: () => void) => void;

function createObservable<T>(
  observable: (next: Observer<T>, cleanup: CleanupFn) => void
) {
  let subscribers: Array<Observer<T>> = [];
  let _resetInternalFn: null | (() => void) = null;

  function from<U>(map: Mappable<T, U>) {
    return createObservable<U>((next, reset) => {
      const { unsubscribe } = observe((value) => {
        next(map(value));
      });
      reset(function () {
        unsubscribe();
      });
    });
  }

  let notify = function (value: T) {
    subscribers.forEach((subsriber) => {
      subsriber(value);
    });
  };

  function observe(notifier: Observer<T>): TerminateOption {
    if (subscribers.length === 0) {
      observable(
        function (value: T) {
          notify(value);
        },
        function (reset) {
          _resetInternalFn = reset;
        }
      );
    }
    subscribers.push(notifier);

    function unsubscribe() {
      _removeSubscriber(notifier);
    }
    return { unsubscribe, stop };
  }

  function _removeSubscriber(subscriber: Observer<T>) {
    subscribers = subscribers.filter((_sub) => _sub !== subscriber);
    if (!subscribers.length) stop();
  }

  function pipe<A, B, C>(
    ...observableCreators: [Mappable<A, B>, Mappable<B, C>]
  ) {
    return createObservable<T>((next, _r1) => {
      let observable: Obervable<any> = _self;

      observableCreators.forEach((mapFn) => {
        let prevObservable = observable;
        observable = createObservable(function (next, _r2) {
          const { stop, unsubscribe } = prevObservable.observe(subscriber);

          _r2(function () {
            return void (prevObservable !== _self ? stop() : unsubscribe());
          });

          function subscriber(value: any) {
            next(mapFn(value));
          }
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
    subscribers = [];
  }

  const _self = { from, observe, pipe, stop } as Obervable<T>;
  return _self;
}

export default createObservable;
