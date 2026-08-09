/**
 * A flat list of entries is not how a week is read back — a day is.
 *
 * The Rust side already returns entries newest-first, but the grouping is not
 * left to that: sorting here means the list looks the same whatever order it
 * was handed, and the day totals are arithmetic the view should never do.
 */

import type { Day, TimeEntry } from "../data/types";

export interface EntryDay {
  date: Day;
  /** What that day came to — the number the user is actually looking for. */
  totalMinutes: number;
  entries: TimeEntry[];
}

export function sumMinutes(entries: TimeEntry[]): number {
  return entries.reduce((total, entry) => total + entry.durationMinutes, 0);
}

export function groupByDay(entries: TimeEntry[]): EntryDay[] {
  const days = new Map<Day, TimeEntry[]>();
  for (const entry of entries) {
    const sameDay = days.get(entry.date);
    if (sameDay) {
      sameDay.push(entry);
    } else {
      days.set(entry.date, [entry]);
    }
  }

  return [...days.entries()]
    // `YYYY-MM-DD` sorts as text exactly as it sorts as a date.
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayEntries]) => ({
      date,
      totalMinutes: sumMinutes(dayEntries),
      entries: dayEntries,
    }));
}
