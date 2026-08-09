/**
 * The days a report covers, said once.
 *
 * `Intl` knows that "3 – 9 augustus 2026" needs the month and year only at the
 * end, and that a range crossing New Year needs both years. Spelling that out
 * by hand would be six rules and a bug at every month edge.
 */

import type { DateRange } from "../data/types";
import { dayAsDate } from "../entries/day-label";

export function rangeLabel(range: DateRange, language: string): string {
  const format = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return format.formatRange(dayAsDate(range.from), dayAsDate(range.to));
}
