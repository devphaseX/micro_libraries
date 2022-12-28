interface SafelySuccess<T> {
  isSuccess: true;
  result: T;
}

interface SafelyFailed<E> {
  isSuccess: false;
  error: E;
}

type SafeContext<S, F> = SafelySuccess<S> | SafelyFailed<F>;
type StateRestorer = () => void;
type PreserverFn = () => StateRestorer;

interface PreserverStore extends Record<string, PreserverFn> {}

class SafeContextInitializationError extends Error {}
class FailedTaskError extends Error {}

type PreserveResult<T, P> = P extends false
  ? T
  : SafeContext<T, SafeContextInitializationError | FailedTaskError>;

function preserveState<T, PreventThrownError extends boolean = boolean>(
  work: () => T,
  namedPreservers: PreserverStore,
  prevent?: PreventThrownError
): PreserveResult<T, PreventThrownError> {
  let resetter: Set<PreserverFn> = new Set();
  function handleThrownError<ThrownError extends typeof Error>(
    context: SafelyFailed<Error>,
    Constructor: ThrownError,
    isThrownPrevent?: boolean
  ) {
    if (!isThrownPrevent) {
      throw new Constructor();
    } else {
      return {
        ...context,
        error: new Constructor((context as SafelyFailed<Error>).error.message),
      } as PreserveResult<T, PreventThrownError>;
    }
  }

  {
    const loopContext = safeContext(() => {
      let key: keyof typeof namedPreservers;
      for (key in namedPreservers) resetter.add(namedPreservers[key]);
    });

    if (!loopContext.isSuccess) {
      return handleThrownError(
        loopContext,
        SafeContextInitializationError as typeof Error,
        prevent
      );
    }
  }

  const workContext = safeContext(work);
  if (!workContext.isSuccess) {
    return handleThrownError(
      workContext,
      FailedTaskError as typeof Error,
      prevent
    );
  }

  let resetErrors: Array<SafelyFailed<Error>> = [];

  resetter.forEach((reset) => {
    const resetContext = safeContext(reset);
    if (!resetContext.isSuccess) resetErrors.push(resetContext);
  });

  if (resetErrors.length) {
    return {
      isSuccess: false,
      error: resetErrors,
    } as unknown as PreserveResult<T, PreventThrownError>;
  }
  return workContext as PreserveResult<T, PreventThrownError>;
}

function safeContext<T>(cb: () => T): SafeContext<T, Error> {
  try {
    return { isSuccess: true, result: cb() };
  } catch (e) {
    return { isSuccess: false, error: new Error(e as any) };
  }
}

export default preserveState;

export { SafeContextInitializationError, FailedTaskError, preserveState };
