import { ControlTaskContext } from './types';

export const DELEGATE_CONTROL_ERROR =
  'You can only delegate control within a function scope once';

export const MORE_FUNCTION_ERROR =
  'Expected One or more sequencial fn, but got none';

export const TASK_IN_PENDING_DURING_RELEASE_ERROR =
  'current Task cannot be in pending state during control release.';

export const CONTROL_DELEGATE_ERROR = (
  mode: Exclude<ControlTaskContext['status'], 'pending'>
) => `Current task not in pending mode but in ${mode}`;
