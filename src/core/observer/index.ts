type Observer<V> = (value: V) => void;
type Mappable<T, U> = (value: T) => U;

export type Obervable<T> = {
  from<U>(fn: Mappable<T, U>): Obervable<U>;
  observe(notifier: Observer<T>): void;
};

function createObservable<T>(observable: (next: Observer<T>) => void) {
  const subsriber: Array<Observer<T>> = [];

  function from<U>(map: Mappable<T, U>) {
    return createObservable<U>((next) => {
      observe((value) => {
        next(map(value));
      });
    });
  }

  function notify(value: T) {
    subsriber.forEach((subsriber) => {
      subsriber(value);
    });
  }

  function observe(notifier: Observer<T>) {
    if (subsriber.length === 0) {
      observable(notify);
    }
    subsriber.push(notifier);
  }

  function pipe<A, B, C>(observaleCreators: [Mappable<A, B>, Mappable<B, C>]) {
    return createObservable<T>((next) => {
      let observable!: Obervable<any>;
      let prevObserver: Obervable<any>['observe'] = observe;

      observaleCreators.forEach((mapFn) => {
        let lastObserver = prevObserver;
        observable = createObservable(function (next) {
          lastObserver(function (value) {
            next(mapFn(value));
          });
        });
      });

      observable.observe(next);
    });
  }

  return { from, observe, pipe };
}

export default createObservable;
