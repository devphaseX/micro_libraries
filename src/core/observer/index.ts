import {
  createDataQueue,
  microQueueTaskNative,
  noop,
  selfRefence,
} from '../../util/index.js';
import { ErrorMessage } from './message.js';

type Observer<V> = (value: V) => void;
type Mappable<T, U> = (value: T) => U;
type SideEffectFn = () => void;

type TerminateOption = { stop: SideEffectFn; unsubscribe: SideEffectFn };

export type Obervable<T> = {
  from<U>(fn: MappableObserver<T, U>): Obervable<U>;
  observe(notifier: Observer<T>): TerminateOption;
  stop(): void;
};

type MappableObserver<T, U> = (value: T, ob: Observer<U>) => void;

type CleanupScopeFn = (reset: CleanUpFn) => void;
type CleanUpFn = VoidFunction;
type ObservableFn<T> = (
  next: Observer<T>,
  cleanup: CleanupScopeFn,
  option: { _markObInternal: <T>(ob: Observer<T>) => _InternalMarkObserver<T> }
) => void | CleanUpFn;

const signature = Math.random().toString(32).slice(2);

const INTERNAL_OBSERVER = Symbol(`INTERNAL_OBSERVER_${signature}`);
const EXTERNAL_OBSERVER = Symbol(`DATA_OBSERVER_${signature}`);
type MARK_OBSERVER_TYPE = typeof INTERNAL_OBSERVER | typeof EXTERNAL_OBSERVER;

interface MarkObserveFn<T, Mark> extends Observer<T> {
  type: Mark;
  valueOf(): Observer<T>;
}

const createConstantPropDesc = (
  restDes: Partial<Pick<PropertyDescriptor, 'value' | 'get' | 'set'>>
): PropertyDescriptor => {
  return {
    configurable: false,
    writable: false,
    enumerable: false,
    ...restDes,
  };
};

interface _InternalMarkObserver<T>
  extends MarkObserveFn<T, typeof INTERNAL_OBSERVER> {
  stop: VoidFunction;
}
interface _DataMarkObserver<T>
  extends MarkObserveFn<T, typeof EXTERNAL_OBSERVER> {}

type DataMarkObStore<T> = Map<Observer<T>, _DataMarkObserver<T>>;
type InternalMarkObStore<T> = Map<Observer<T>, _InternalMarkObserver<T>>;

interface SubscriberStore<T> {
  [INTERNAL_OBSERVER]: InternalMarkObStore<T>;
  [EXTERNAL_OBSERVER]: DataMarkObStore<T>;
  subsriberEntries: Set<Observer<T>>;
}

function createObservable<T>(observable: ObservableFn<T>) {
  let _subscribers: SubscriberStore<T> = _resetSubscriber('all');
  let _resetInternalFn: null | (() => void) = null;

  function _resetSubscriber(
    type: 'all' | MARK_OBSERVER_TYPE | Array<MARK_OBSERVER_TYPE>
  ): SubscriberStore<T> {
    if (type === 'all') {
      return {
        [INTERNAL_OBSERVER]: new Map(),
        [EXTERNAL_OBSERVER]: new Map(),
        subsriberEntries: new Set(),
      };
    }

    if (typeof _subscribers === 'undefined') {
      throw new Error(ErrorMessage.INTERNAL_OBSERVER_ERROR);
    }

    if (Array.isArray(type)) {
      return type.map(_resetSubscriber).at(-1)!;
    }

    return {
      ..._subscribers,
      [type]: new Map(),
    };
  }

  function _markObserver<T>(observer: Observer<T>, type: MARK_OBSERVER_TYPE) {
    const _markedFn = function (value) {
      observer(value);
    } as MarkObserveFn<T, MARK_OBSERVER_TYPE>;

    Object.defineProperties(_markedFn, {
      type: createConstantPropDesc({ value: type }),
      valueOf: createConstantPropDesc({ value: () => observer }),
      stop: createConstantPropDesc({
        value: () => {
          _stop(type === INTERNAL_OBSERVER);
        },
      }),
    });

    return _markedFn;
  }

  function _registerObserver(ob: MarkObserveFn<T, MARK_OBSERVER_TYPE>) {
    if (wrappedObserverInStore(ob)) {
      throw new Error(ErrorMessage.ALREADY_MADE_SUSCRIPTION);
    }
    const type = ob.type;

    _subscribers.subsriberEntries.add(ob);
    //@ts-ignore
    //valueof() unwrapped the real observer fn provided during observe time
    _subscribers[type].set(ob.valueOf(), ob);
    return selfRefence<TerminateOption>((ref) => {
      function _revokeSelfOnDisconnect<T extends object>(target: T) {
        function revokeAccess() {
          const _self = ref();
          _self.unsubscribe = noop;
          _self.stop = noop;
        }
        return new Proxy(target, {
          get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof value === 'function') {
              return function (this: any, ...args: any) {
                let result = Reflect.apply(value, this, args);
                return revokeAccess(), result;
              };
            }
            return value;
          },
        });
      }

      return _revokeSelfOnDisconnect({
        stop: () => {
          _stop();
        },
        unsubscribe() {
          removeSubscriber(ob, type);
        },
      });
    });
  }

  function wrappedObserverInStore(ob: Observer<T>) {
    let isAlreadyWrapped = false;

    _subscribers.subsriberEntries.forEach((sub) => {
      isAlreadyWrapped = sub.valueOf() === ob;
    });
    return isAlreadyWrapped;
  }

  function from<U>(map: (value: T, next: Observer<U>) => void) {
    return createObservable<U>((next, reset, { _markObInternal }) => {
      const queue = createDataQueue<T>();
      let isLocked = false;

      const { unsubscribe } = observe(
        _markObInternal<T>(function (value) {
          if (!isLocked) {
            isLocked = true;

            map(value, function _next(value: U) {
              next(value);
              isLocked = false;

              if (!queue.isEmpty()) {
                isLocked = true;
                map(queue.pop()!, _next);
              }
            });
          } else {
            queue.push(value);
          }

          reset(function () {
            queue.flush(() => {
              return new Promise((res) => {
                map(value, function (value) {
                  res(undefined);
                  next(value);
                });
              });
            });
            unsubscribe();
          });
        })
      );
    });
  }

  let notify = function (value: T | Error) {
    if (value instanceof Error) {
      return _stop(true);
    } else {
      batchNofication(value);
    }
  };

  function batchNofication(value: T) {
    //queuemicroTask before UI rendering(i.e change app state before UI render)
    microQueueTaskNative(() => {
      _subscribers.subsriberEntries.forEach((subscriber) => {
        subscriber(value);
      });
    });
  }

  function observe(
    notifier: Observer<T> | MarkObserveFn<T, MARK_OBSERVER_TYPE>
  ) {
    if (_subscribers.subsriberEntries.size === 0) {
      let hasSetCleanUpFnUsingReturnValue = false;
      const cleanUpFn = observable(
        function (value) {
          notify(value);
        },
        function (reset) {
          if (!hasSetCleanUpFnUsingReturnValue) _resetInternalFn = reset;
        },
        {
          _markObInternal: function <T>(ob: Observer<T>) {
            return _markObserver(
              ob,
              INTERNAL_OBSERVER
            ) as _InternalMarkObserver<T>;
          },
        }
      );

      if (!_resetInternalFn && cleanUpFn) {
        _resetInternalFn = cleanUpFn;
        hasSetCleanUpFnUsingReturnValue = true;
      }
    }
    return _registerObserver(
      'type' in notifier ? notifier : _markObserver(notifier, EXTERNAL_OBSERVER)
    );
  }

  function removeSubscriber(ob: Observer<T>, type: MARK_OBSERVER_TYPE) {
    if (_subscribers[type].size === 1) {
      if (_subscribers.subsriberEntries.size === 1) {
        return _resetSubscriber('all');
      }
      _resetSubscriber(type);
    } else {
      return _unsubscriber(type, ob);
    }
  }

  function _unsubscriber(type: MARK_OBSERVER_TYPE, ob: Observer<T>) {
    _subscribers[type].delete(ob);
    _subscribers.subsriberEntries.delete(ob);
  }

  function pipe<A, B, C>(
    ...observableCreators: [Mappable<A, B>, Mappable<B, C>]
  ) {
    return createObservable<T>((next, _r1) => {
      let observable: Obervable<any> = _self;
      let _internalObserve = observe;

      observableCreators.forEach((mapFn) => {
        let { observe } = observable;
        observable = createObservable(function (
          next,
          _r2,
          { _markObInternal }
        ) {
          const { stop, unsubscribe } = observe(_markObInternal(subscriber));

          _r2(function () {
            return void (observe !== _internalObserve ? stop() : unsubscribe());
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

  function _stop(rootExit?: boolean) {
    notify = noop;
    if (_resetInternalFn) {
      _resetInternalFn();
      _resetInternalFn = null;
    }
    if (rootExit) {
      _subscribers[INTERNAL_OBSERVER].forEach((subscriber) => {
        subscriber.stop();
      });
    }
    _subscribers = _resetSubscriber('all');
  }

  const _self = { from, observe, pipe, stop: _stop } as Obervable<T>;
  return _self;
}

export default createObservable;

export function linkObservable<A>(linker: ObservableFn<A>) {
  return createObservable<A>(linker);
}
