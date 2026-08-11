/**
 * "When was the last backup" as something a person reads.
 *
 * The stamp is stored in UTC because that is what sorts and never repeats an
 * hour (ADR-0007); the reader is in Amsterdam. So the conversion happens here,
 * at the edge, and the date and the time both appear — "yesterday at 09:12" is
 * the answer to "is my work safe", and a bare date is not.
 */

import type { Instant } from "../data/types";

export function momentLabel(at: Instant, language: string): string {
  const moment = new Date(at);

  // `Intl` throws on an unparseable date, and this is called from the lock screen
  // and the app shell — the two places where a throw is not one bad line but the
  // whole window, because there is nothing above them left to render. So an
  // instant that will not parse is shown as it arrived instead.
  if (Number.isNaN(moment.getTime())) {
    return String(at);
  }

  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(moment);
}
