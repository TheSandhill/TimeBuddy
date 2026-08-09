/**
 * A wall-clock reading that refreshes once a second while something is live.
 *
 * The interval exists only to re-render; it counts nothing. Every duration is
 * still the distance between two instants, so a tick that arrives late — or an
 * hour of them that never arrive at all, because the laptop was shut — changes
 * what the screen shows but never what it logs.
 */

import { useEffect, useState } from "react";
import type { Instant } from "../data/types";
import { currentInstant } from "./clock";

const TICK_MS = 1000;

export function useNow(live: boolean): Instant {
  const [now, setNow] = useState<Instant>(currentInstant);

  useEffect(() => {
    if (!live) {
      return;
    }

    // Read once immediately: waiting a second for the first frame would show a
    // stale countdown at the very moment the user is looking hardest.
    setNow(currentInstant());
    const id = window.setInterval(() => setNow(currentInstant()), TICK_MS);
    return () => window.clearInterval(id);
  }, [live]);

  return now;
}
