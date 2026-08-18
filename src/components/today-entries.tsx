import { useTranslation } from "react-i18next";
import { projectName } from "../data/project-name";
import type { Project, TimeEntry } from "../data/types";
import { formatClock } from "../timer/clock";
import { quietLabelClass } from "./field";

interface TodayEntriesProps {
  entries: TimeEntry[];
  projects: Project[];
}

/**
 * What today has come to so far, under the button that made it.
 *
 * Timer blocks show the window they ran in; manual entries have no clock times
 * to show, and inventing one would be a lie the list tells every day.
 *
 * A soft raised block under a sentence-case heading, rather than a bare list:
 * the fill is what makes it read as secondary to the dial without a line drawn
 * round it (ADR-0004).
 */
export function TodayEntries({ entries, projects }: TodayEntriesProps) {
  const { t } = useTranslation();
  const nameOf = (projectId: number) =>
    projectName(projects, projectId, t("timer.unknownProject"));

  return (
    <section className="flex flex-col gap-3">
      <h2 className={quietLabelClass}>{t("timer.today")}</h2>

      {entries.length === 0 ? (
        <p className="rounded-lg bg-surface-raised px-4 py-3 text-sm text-ink-muted">
          {t("timer.noEntries")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg bg-surface-raised px-4">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-baseline justify-between gap-4 py-3"
            >
              <span className="truncate text-sm text-ink">
                {nameOf(entry.projectId)}
              </span>

              <span className="flex shrink-0 items-baseline gap-3 text-sm text-ink-muted">
                {entry.startAt && entry.endAt ? (
                  <span className="tabular-nums">
                    {`${formatClock(entry.startAt)}–${formatClock(entry.endAt)}`}
                  </span>
                ) : null}
                <span className="tabular-nums text-ink">
                  {t("timer.minutes", { minutes: entry.durationMinutes })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
