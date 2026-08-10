/**
 * The Timer screen — the primary screen and the reason the app exists.
 *
 * It owns the state a Pomodoro Block moves through, but not the arithmetic:
 * every duration comes from `timer/block`, which is pure and takes the current
 * instant as an argument. The interval in `useNow` only causes re-renders. If
 * it stops — the machine sleeps, the window is hidden, the tab is throttled —
 * the countdown catches up on the next tick and the logged length is unchanged.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BreakBanner } from "../components/break-banner";
import { PomodoroDial } from "../components/pomodoro-dial";
import { ProjectPicker } from "../components/project-picker";
import { RecoveryPrompt } from "../components/recovery-prompt";
import { TodayEntries } from "../components/today-entries";
import {
  discardRunningTimer,
  getRunningTimer,
  listProjects,
  listTimeEntries,
  startRunningTimer,
  stopRunningTimer,
} from "../data/commands";
import { useSettings } from "../data/use-settings";
import type { Instant, RunningTimer, StopTimer } from "../data/types";
import {
  formatCountdown,
  outcomeAt,
  remainingSeconds,
  secondsUntil,
  type BlockOutcome,
} from "../timer/block";
import { playChime } from "../timer/chime";
import { notify } from "../timer/notify";
import {
  currentInstant,
  localDay,
  plusMinutes,
  SECONDS_PER_MINUTE,
} from "../timer/clock";
import { useNow } from "../timer/use-now";
import { useTimerToggle } from "../tray/toggle-request";

export function Timer() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const settings = useSettings();
  // What can be started and what today's hours are called are two different
  // lists: an archived project is off the picker but still names its hours.
  const projects = useQuery({
    queryKey: ["projects", "offerable"],
    queryFn: () => listProjects({ includeArchived: false }),
  });
  const named = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => listProjects({ includeArchived: true }),
  });
  const running = useQuery({
    queryKey: ["runningTimer"],
    queryFn: getRunningTimer,
  });

  const today = localDay(currentInstant());
  const entries = useQuery({
    queryKey: ["timeEntries", today],
    queryFn: () => listTimeEntries({ from: today, to: today }),
  });

  const [projectId, setProjectId] = useState<number | null>(null);
  /** The Break's end instant. State, never a row — a Break is not hours. */
  const [breakEndsAt, setBreakEndsAt] = useState<Instant | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * Whether the in-flight block is one this session started. A block found on
   * launch is one the app died on, and that is the only case worth asking
   * about — asking again about a block the user just started would be noise.
   */
  const startedHere = useRef(false);
  /** Stops the completion effect firing twice while the write is in flight. */
  const finishing = useRef(false);

  const block = running.data ?? null;
  const recovering = block !== null && !startedHere.current;

  const now = useNow(block !== null || breakEndsAt !== null);

  /**
   * The instant the orphaned block was found, frozen.
   *
   * The question must not answer itself while it waits: a block that had not
   * run out would otherwise offer more minutes the longer the prompt sat on
   * screen, and keeping it would log the time spent reading the prompt.
   */
  const foundAt = useRef<Instant | null>(null);
  if (recovering && foundAt.current === null) {
    foundAt.current = currentInstant();
  } else if (!recovering && foundAt.current !== null) {
    foundAt.current = null;
  }
  const discoveredAt = foundAt.current ?? now;

  /**
   * Marks the edge of an interval, in whichever ways are still switched on.
   *
   * Both can be turned off independently: a chime is unwelcome in a shared
   * room and a toast is unwelcome during a call, and neither carries anything
   * the other does not. Until the settings row has arrived, the shipped
   * defaults apply — a block cannot have ended before then anyway.
   */
  const announce = (message: string) => {
    if (settings.data?.chimeEnabled ?? true) {
      playChime();
    }
    if (settings.data?.notificationsEnabled ?? true) {
      void notify(t("app.name"), message);
    }
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["runningTimer"] });
    await queryClient.invalidateQueries({ queryKey: ["timeEntries"] });
  };

  const startBlock = useMutation({
    mutationFn: (id: number) =>
      startRunningTimer(id, settings.data?.pomodoroMinutes ?? 0),
    onSuccess: () => {
      startedHere.current = true;
      setBreakEndsAt(null);
      setFailed(false);
      return refresh();
    },
    onError: () => setFailed(true),
  });

  // A failed write leaves the block in flight on purpose. Clearing the guard
  // lets the next tick — or the next click — try again, rather than stranding
  // a block nothing will ever offer back.
  const writeFailed = () => {
    finishing.current = false;
    setFailed(true);
  };

  const stopBlock = useMutation({
    mutationFn: (ending: StopTimer) => stopRunningTimer(ending),
    onSuccess: () => {
      setFailed(false);
      return refresh();
    },
    onError: writeFailed,
  });

  const discardBlock = useMutation({
    mutationFn: discardRunningTimer,
    onSuccess: () => {
      setFailed(false);
      return refresh();
    },
    onError: writeFailed,
  });

  /** Turns an outcome into either a logged entry or nothing at all. */
  const settle = (source: RunningTimer, outcome: BlockOutcome) => {
    if (outcome.kind === "tooShort" || outcome.kind === "tooLong") {
      discardBlock.mutate();
      return;
    }
    stopBlock.mutate({
      date: localDay(source.startAt),
      durationMinutes: outcome.durationMinutes,
      endAt: outcome.endAt,
      note: null,
    });
  };

  // The first project is a better default than an empty picker; anything else
  // the user picks sticks, because `projectId` stops being null.
  useEffect(() => {
    if (projectId === null && projects.data?.length) {
      setProjectId(projects.data[0].id);
    }
  }, [projectId, projects.data]);

  // Auto-stop at zero: a block can never be left running overnight.
  useEffect(() => {
    if (!block || recovering || finishing.current) {
      return;
    }
    const outcome = outcomeAt(block, now);
    if (outcome.kind !== "completed") {
      return;
    }

    finishing.current = true;
    announce(t("timer.blockEnded", { minutes: outcome.durationMinutes }));
    setBreakEndsAt(plusMinutes(now, settings.data?.breakMinutes ?? 0));
    settle(block, outcome);
  }, [block, recovering, now, settings.data]);

  // Once nothing is in flight, the next block found on launch is a crash
  // again — and a failed stop deliberately leaves the block, and the prompt.
  useEffect(() => {
    if (!block) {
      finishing.current = false;
      startedHere.current = false;
    }
  }, [block]);

  // The Break ends the same way it started: a chime and nothing written.
  useEffect(() => {
    if (breakEndsAt && Date.parse(now) >= Date.parse(breakEndsAt)) {
      setBreakEndsAt(null);
      announce(t("timer.breakEnded"));
    }
  }, [breakEndsAt, now]);

  const plannedMinutes = settings.data?.pomodoroMinutes ?? 0;
  const countdown = formatCountdown(
    block && !recovering
      ? remainingSeconds(block, now)
      : plannedMinutes * SECONDS_PER_MINUTE,
  );

  const busy =
    startBlock.isPending || stopBlock.isPending || discardBlock.isPending;

  // Start/Stop from the tray lands here, because this is the one place that
  // knows what a stopped block is worth. A block found on launch is left
  // alone: the recovery prompt is a question, and a menu item must not answer
  // it on the user's behalf.
  useTimerToggle(() => {
    if (recovering || busy) {
      return;
    }
    if (block) {
      settle(block, outcomeAt(block, currentInstant()));
    } else if (projectId !== null && plannedMinutes > 0) {
      startBlock.mutate(projectId);
    }
  });

  return (
    <section className="flex flex-col gap-10">
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t("timer.failed")}
        </p>
      ) : null}

      {recovering && block ? (
        <RecoveryPrompt
          outcome={outcomeAt(block, discoveredAt)}
          busy={busy}
          onKeep={() => settle(block, outcomeAt(block, discoveredAt))}
          onDiscard={() => discardBlock.mutate()}
        />
      ) : (
        <>
          {breakEndsAt ? (
            <BreakBanner
              countdown={formatCountdown(secondsUntil(breakEndsAt, now))}
              onSkip={() => setBreakEndsAt(null)}
            />
          ) : null}

          <div className="flex flex-col items-center gap-8 py-6">
            <PomodoroDial
              countdown={countdown}
              running={block !== null}
              canStart={projectId !== null && plannedMinutes > 0 && !busy}
              onStart={() => projectId !== null && startBlock.mutate(projectId)}
              onStop={() =>
                block && settle(block, outcomeAt(block, currentInstant()))
              }
            />

            <ProjectPicker
              projects={projects.data ?? []}
              value={block ? block.projectId : projectId}
              onChange={setProjectId}
              disabled={block !== null}
            />
          </div>
        </>
      )}

      <TodayEntries entries={entries.data ?? []} projects={named.data ?? []} />
    </section>
  );
}
