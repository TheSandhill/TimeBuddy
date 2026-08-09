/**
 * `2026-08-05` is a key, not a heading. This turns it into one.
 *
 * The day is built field by field rather than through `new Date(day)`, which
 * reads `YYYY-MM-DD` as midnight **UTC** and would head a Wednesday's hours
 * with "Tuesday" for anyone west of Greenwich.
 */

import type { Day } from "../data/types";

function dayAsDate(day: Day): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function dayLabel(day: Day, language: string): string {
  return new Intl.DateTimeFormat(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dayAsDate(day));
}
