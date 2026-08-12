/**
 * What was asked of the block from the tray, held until something can act on it.
 *
 * The tray menu is reachable from every screen, and what it asks for is answered
 * by the block's lifecycle above all of them (ADR-0010) rather than by whichever
 * screen happens to be mounted. Start/Stop is latched all the same, because the
 * shell still navigates to the Timer on its way — and an event fired at a
 * listener that has just been remounted is an event nobody hears.
 *
 * Pause goes through a latch of its own rather than sharing that one. Both are
 * offered while a block runs, so a single pending flag could not say which item
 * was pressed.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * One request outstanding, or none.
 *
 * Counted rather than stamped: it only ever has to differ from the last one it
 * was read at, and two clicks inside the same millisecond would not.
 */
function latch() {
  let pending = 0;
  const listeners = new Set<() => void>();

  const announce = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const request = () => {
    pending += 1;
    announce();
  };

  const clear = () => {
    pending = 0;
    announce();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const snapshot = () => pending;

  /**
   * Runs `answer` once per request, then clears it.
   *
   * `answer` is deliberately not a dependency of the effect: acting is tied to a
   * request arriving, not to the handler being rebuilt — and it is rebuilt on
   * every tick of the countdown.
   */
  const use = (answer: () => void) => {
    const pending = useSyncExternalStore(subscribe, snapshot, snapshot);
    const latest = useRef(answer);
    latest.current = answer;

    useEffect(() => {
      if (pending === 0) {
        return;
      }
      clear();
      latest.current();
    }, [pending]);
  };

  return { request, clear, use };
}

const toggle = latch();
const hold = latch();

export const requestTimerToggle = toggle.request;
/** Drops the outstanding request without acting on it. */
export const clearTimerToggle = toggle.clear;
export const useTimerToggle = toggle.use;

/** The Pause/Resume item, which needs no screen and so no navigation. */
export const requestTimerPause = hold.request;
export const clearTimerPause = hold.clear;
export const useTimerPause = hold.use;
