/**
 * A start/stop asked for from the tray, held until the Timer screen can act.
 *
 * The tray menu is reachable from every screen, but only the Timer screen
 * knows what stopping a block is worth. So the request is latched here, the
 * shell navigates to the Timer, and the Timer picks the request up when it
 * mounts — which is usually a beat after it was made.
 *
 * A latch rather than a plain event, precisely because of that beat: an event
 * fired at a screen that is not mounted yet is an event nobody hears.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * How many requests have been made, or `0` for "nothing pending". A count
 * rather than an instant: it only ever has to differ from the last one, and
 * two clicks inside the same millisecond would not.
 */
let pending = 0;
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) {
    listener();
  }
}

export function requestTimerToggle(): void {
  pending += 1;
  announce();
}

/** Drops the outstanding request without acting on it. */
export function clearTimerToggle(): void {
  pending = 0;
  announce();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => pending;

/**
 * Runs `toggle` once per request, then clears it.
 *
 * `toggle` is deliberately not a dependency of the effect: acting is tied to a
 * request arriving, not to the handler being rebuilt — and it is rebuilt on
 * every tick of the countdown.
 */
export function useTimerToggle(toggle: () => void): void {
  const pending = useSyncExternalStore(subscribe, snapshot, snapshot);
  const latest = useRef(toggle);
  latest.current = toggle;

  useEffect(() => {
    if (pending === 0) {
      return;
    }
    clearTimerToggle();
    latest.current();
  }, [pending]);
}
