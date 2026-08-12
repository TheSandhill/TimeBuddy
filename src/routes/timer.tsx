/**
 * The Timer screen — the primary screen and the reason the app exists.
 *
 * It is a view, not the owner. What a block is worth, when it ends, and what a
 * Break is are all decided in `timer/lifecycle`, above the `<Outlet/>`, because
 * a block outlives whichever screen is open (ADR-0010). This file draws the
 * dial, asks the questions, and lists today's hours.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BreakBanner } from "../components/break-banner";
import { PomodoroDial } from "../components/pomodoro-dial";
import { ProjectPicker } from "../components/project-picker";
import { RecoveryPrompt } from "../components/recovery-prompt";
import { TodayEntries } from "../components/today-entries";
import { listProjects, listTimeEntries } from "../data/commands";
import {
  formatCountdown,
  remainingSeconds,
  secondsUntil,
} from "../timer/block";
import { currentInstant, localDay, SECONDS_PER_MINUTE } from "../timer/clock";
import { useTimerLifecycle } from "../timer/lifecycle";

export function Timer() {
  const { t } = useTranslation();
  const {
    block,
    now,
    orphan,
    breakEndsAt,
    projectId,
    chooseProject,
    plannedMinutes,
    failed,
    busy,
    canStart,
    start,
    stop,
    keepOrphan,
    discard,
    endBreak,
  } = useTimerLifecycle();

  // Two lists, because what can be started and what today's hours are called
  // are different questions: an archived project is off the picker but still
  // names the hours it already has.
  const projects = useQuery({
    queryKey: ["projects", "offerable"],
    queryFn: () => listProjects({ includeArchived: false }),
  });
  const named = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => listProjects({ includeArchived: true }),
  });

  const today = localDay(currentInstant());
  const entries = useQuery({
    queryKey: ["timeEntries", today],
    queryFn: () => listTimeEntries({ from: today, to: today }),
  });

  const countdown = formatCountdown(
    block && orphan === null
      ? remainingSeconds(block, now)
      : plannedMinutes * SECONDS_PER_MINUTE,
  );

  return (
    <section className="flex flex-col gap-10">
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t("timer.failed")}
        </p>
      ) : null}

      {orphan !== null ? (
        <RecoveryPrompt
          outcome={orphan}
          busy={busy}
          onKeep={keepOrphan}
          onDiscard={discard}
        />
      ) : (
        <>
          {breakEndsAt ? (
            <BreakBanner
              countdown={formatCountdown(secondsUntil(breakEndsAt, now))}
              onSkip={endBreak}
            />
          ) : null}

          <div className="flex flex-col items-center gap-8 py-6">
            <PomodoroDial
              countdown={countdown}
              running={block !== null}
              canStart={canStart}
              onStart={start}
              onStop={stop}
            />

            <ProjectPicker
              projects={projects.data ?? []}
              value={block ? block.projectId : projectId}
              onChange={chooseProject}
              disabled={block !== null}
            />
          </div>
        </>
      )}

      <TodayEntries entries={entries.data ?? []} projects={named.data ?? []} />
    </section>
  );
}
