/**
 * When a timer entry ran — while that is still true.
 *
 * `start_at` / `end_at` record how an entry came to exist and cannot be edited
 * (`types.ts`), but its duration can. Correcting a 25-minute block to 90 leaves
 * a stored window that no longer describes it, and a list that showed
 * "09:00–09:25 · 1:30" would be telling the reader two different things.
 */

import type { TimeEntry } from "../data/types";
import { MS_PER_SECOND, SECONDS_PER_MINUTE } from "../timer/clock";

export interface RanBetween {
  startAt: string;
  endAt: string;
}

export function windowOf(entry: TimeEntry): RanBetween | null {
  if (!entry.startAt || !entry.endAt) {
    return null;
  }

  const minutes =
    (Date.parse(entry.endAt) - Date.parse(entry.startAt)) /
    (SECONDS_PER_MINUTE * MS_PER_SECOND);

  return Math.round(minutes) === entry.durationMinutes
    ? { startAt: entry.startAt, endAt: entry.endAt }
    : null;
}
