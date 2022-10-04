import { timeout } from '../../util/index.js';
import sequence from '../sequence/index.js';

function sleep(ms: number, task: () => void) {
  let id = -1;

  function release() {
    clearInterval(id);
    id = -1;
    task();
  }

  sequence(
    [
      function delay(ms: number, next) {
        id = timeout(ms, function () {
          next(null);
        }) as unknown as number;
      },
    ],
    { onsuccess: release }
  )(ms);

  return release;
}

export default sleep;
