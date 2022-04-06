import { timeout } from '../util/index.js';
import sequence from '../core/sequence/index.js';

function sleep(ms: number, task: () => void) {
  let id = -1;
  function release() {
    task();
  }
  function cancel() {
    clearInterval(id);
    id = -1;
  }
  sequence(
    [
      function delay(ms: number, next) {
        id = timeout(ms, function () {
          next(null);
        });
      },
    ],
    { onsuccess: release }
  )(ms);

  return cancel;
}

export default sleep;
