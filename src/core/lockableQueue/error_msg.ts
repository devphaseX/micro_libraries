const WARN_ABOUT_ACCESS_FN = `if the passed function serves as a grant function, simply use the queue grand function by importing it.
from the lockable queue module or directly on the queue instance.`;
const ERROR_QUEUE_IN_LOCK = `Access is prevented because Queue is in locked mode. Ensure lock is released before attempting
To use queue or access using the grand function with the release key.`;
const REVOCATION_ERROR =
  'Revocation exception. Lock access is revoked externally using abortSignal';

export { ERROR_QUEUE_IN_LOCK, WARN_ABOUT_ACCESS_FN, REVOCATION_ERROR };
