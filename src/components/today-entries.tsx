import { useTranslation } from "react-i18next";
import type { Project, TimeEntry } from "../data/types";
import { formatClock } from "../timer/clock";

interface TodayEntriesProps {
  entries: TimeEntry[];
  projects: Project[];
}

/**
 * What today has come to so far, under the button that made it.
 *
 * Timer blocks show the window they ran in; manual entries have no clock times
 * to show, and inventing one would be a lie the list tells every day.
 */
export function TodayEntries({ entries, projects }: TodayEntriesProps) {
  const { t } = useTranslation();
  // An archived project is out of the picker but still owns yesterday's hours,
  // so a name can genuinely be missing from the list this component was given.
  const nameOf = (projectId: number) =>
    projects.find((project) => project.id === projectId)?.name ??
    t("timer.unknownProject");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-widest text-ink-muted">
        {t("timer.today")}
      </h2>

      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("timer.noEntries")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-baseline justify-between gap-4 py-2"
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
