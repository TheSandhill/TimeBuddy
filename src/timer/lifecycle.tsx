/**
 * The Pomodoro Block's lifecycle, which belongs to the app and not to a screen.
 *
 * A block outlives whatever is on screen: it survives the window being hidden
 * in the tray, and it survives the user walking off to Rapporten. So the state
 * that governs it lives above the `<Outlet/>`, alongside the query the titlebar
 * pill and the tray tooltip already read (ADR-0010). The Timer screen is a view
 * over what is here — a rich one, with the dial and the buttons — but no longer
 * the thing that decides.
 *
 * It owns state and effects only. The arithmetic is still `timer/block`, pure
 * and taking the current instant as an argument, so a block behaves the same
 * whether anyone watched it tick.
 *
 * What is deliberately *not* here: today's entries, which are a thing the Timer
 * screen shows rather than a thing the block needs.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  discardRunningTimer,
  getRunningTimer,
  listProjects,
  pauseRunningTimer,
  resumeRunningTimer,
  startRunningTimer,
  stopRunningTimer,
  updateSettings,
} from "../data/commands";
import { settingsKey, useSettings } from "../data/use-settings";
import type { Instant, RunningTimer, StopTimer } from "../data/types";
import { UNDO_WINDOW_MS } from "../entries/use-undoable-delete";
import { useTimerPause, useTimerToggle } from "../tray/toggle-request";
import { isPaused, outcomeAt, type BlockOutcome } from "./block";
import { playChime } from "./chime";
import { currentInstant, localDay, plusMinutes } from "./clock";
import { notify } from "./notify";
import { useNow } from "./use-now";

/**
 * A block and the instant it is being read at.
 *
 * The pair travels together everywhere, because either one alone says nothing:
 * a countdown is the distance between them. The titlebar pill and the tray
 * tooltip take this and no more.
 */
export interface RunningBlock {
  /** The at-most-one block in flight, or `null`. Absence is the normal state. */
  block: RunningTimer | null;
  /** A wall-clock reading, refreshed each second while something is running. */
  now: Instant;
}

/** What failed to be written. Each has its own sentence on the screen. */
export type TimerFault = "block" | "blockLength";

/**
 * A stop that has been asked for and not yet written.
 *
 * Both halves are frozen at the click. The five seconds are the app's hesitation,
 * not the user's work — a block held open for them would log the reading of a
 * toast as time spent on a project.
 */
interface PendingStop {
  source: RunningTimer;
  outcome: BlockOutcome;
}

export interface TimerLifecycle extends RunningBlock {
  /**
   * What an Orphaned Block is worth, frozen at the instant it was found — or
   * `null` when the block in flight is one this process started, which is the
   * ordinary case and the one nobody should be asked about.
   */
  orphan: BlockOutcome | null;
  /** The Break's end instant. State, never a row — a Break is not hours. */
  breakEndsAt: Instant | null;
  /** Which project the next block runs on. The tray needs this as much as the picker does. */
  projectId: number | null;
  chooseProject: (id: number) => void;
  /** The nominal length a block started now would have. */
  plannedMinutes: number;
  /**
   * Changes the length the next block will run for, by saving it. There is no
   * one-off override: the dial and the number on the Settings screen are the
   * same number, and two of them could disagree.
   */
  chooseLength: (minutes: number) => void;
  /**
   * Which write did not land, or `null`. Named rather than boolean because the
   * two say different things: a block that could not be logged is work at risk,
   * and a length that could not be saved is only the next block being wrong.
   * The block, if any, is deliberately left in flight either way.
   */
  fault: TimerFault | null;
  /** A write is in flight, so nothing should be asked of the block yet. */
  busy: boolean;
  canStart: boolean;
  start: () => void;
  /**
   * Ends the block now — logging the elapsed time, or the full length if it ran
   * out. Nothing is written for five seconds; see `pendingStop`.
   */
  stop: () => void;
  /**
   * What a hand-stopped block is about to be logged as, while that is still a
   * question. `null` at every other moment.
   *
   * The block is presented as already stopped while this is set: the countdown
   * is gone and the dial is idle, because the screen must not offer to stop
   * something it has just said it stopped.
   */
  pendingStop: BlockOutcome | null;
  /** Cancels a stop that has not been written yet. The block simply carries on. */
  undoStop: () => void;
  /** Whether the block is being held rather than running. */
  paused: boolean;
  /** Holds the block, or lets it carry on. Both no-ops without a block. */
  pause: () => void;
  resume: () => void;
  /** Logs the frozen worth of an Orphaned Block. */
  keepOrphan: () => void;
  /** Throws the block away without logging anything. */
  discard: () => void;
  endBreak: () => void;
}

const LifecycleContext = createContext<TimerLifecycle | null>(null);

export function useTimerLifecycle(): TimerLifecycle {
  const lifecycle = useContext(LifecycleContext);
  if (lifecycle === null) {
    throw new Error("useTimerLifecycle used outside a TimerLifecycleProvider");
  }
  return lifecycle;
}

/**
 * `watching` is false behind the lock screen. A block keeps running there, but
 * a countdown on the titlebar and a tooltip counting minutes are both
 * statements about someone's working day, and the door exists so that none of
 * them are made before it is opened (ADR-0003).
 *
 * Nothing is settled while it is false either. The hours come out the same
 * whenever it happens — a completed block ends at the instant it ran out, not
 * when anyone noticed — so waiting until the door opens costs nothing and saves
 * a chime that would have to be suppressed anyway.
 */
export function TimerLifecycleProvider({
  watching,
  children,
}: {
  watching: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useSettings();

  const running = useQuery({
    queryKey: ["runningTimer"],
    queryFn: getRunningTimer,
    enabled: watching,
  });
  // What can be started is a shorter list than what can be named: an archived
  // project is off the picker but still names the hours it already has.
  const projects = useQuery({
    queryKey: ["projects", "offerable"],
    queryFn: () => listProjects({ includeArchived: false }),
    enabled: watching,
  });

  const [projectId, setProjectId] = useState<number | null>(null);
  const [breakEndsAt, setBreakEndsAt] = useState<Instant | null>(null);
  const [fault, setFault] = useState<TimerFault | null>(null);
  /** A hand-stopped block and what it is worth, waiting out the undo window. */
  const [pendingStop, setPendingStop] = useState<PendingStop | null>(null);

  /**
   * Whether the block in flight is one this *process* started.
   *
   * A ref in a component that outlives every navigation, which is what makes
   * the distinction the right one: it is false again only after a genuine
   * restart, and a block found after a restart is exactly the Orphaned Block
   * worth asking about. Held in the Timer screen this was false after every
   * trip to another screen, and a block still being worked in was offered up
   * for discarding (#31).
   */
  const startedHere = useRef(false);
  /** Stops the completion effect firing twice while the write is in flight. */
  const finishing = useRef(false);

  /**
   * The row as it actually is, which is not always what is shown.
   *
   * While a stop is waiting out its five seconds the block is still in flight —
   * that is the whole point, nothing has been written — but it is presented as
   * stopped. The effects below watch this rather than the masked version, or
   * clearing `startedHere` mid-window would turn an undone stop into an
   * Orphaned Block.
   */
  const liveBlock = watching ? (running.data ?? null) : null;
  const stopping = pendingStop !== null;
  const block = stopping ? null : liveBlock;
  const orphaned = block !== null && !startedHere.current;

  const now = useNow(block !== null || breakEndsAt !== null);

  /**
   * The instant the Orphaned Block was found, frozen.
   *
   * The question must not answer itself while it waits: a block that had not
   * run out would otherwise offer more minutes the longer the prompt sat on
   * screen, and keeping it would log the time spent reading the prompt.
   */
  const foundAt = useRef<Instant | null>(null);
  if (orphaned && foundAt.current === null) {
    foundAt.current = currentInstant();
  } else if (!orphaned && foundAt.current !== null) {
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

  const plannedMinutes = settings.data?.pomodoroMinutes ?? 0;

  const startBlock = useMutation({
    mutationFn: (id: number) => startRunningTimer(id, plannedMinutes),
    onSuccess: () => {
      startedHere.current = true;
      setBreakEndsAt(null);
      setFault(null);
      return refresh();
    },
    onError: () => setFault("block"),
  });

  // A failed write leaves the block in flight on purpose. Clearing the guard
  // lets the next tick — or the next click — try again, rather than stranding
  // a block nothing will ever offer back.
  const writeFailed = () => {
    finishing.current = false;
    setFault("block");
  };

  const stopBlock = useMutation({
    mutationFn: (ending: StopTimer) => stopRunningTimer(ending),
    onSuccess: () => {
      setFault(null);
      return refresh();
    },
    onError: writeFailed,
  });

  /**
   * Holding the block, and letting it go again.
   *
   * Both write the row and re-read it, so the block the countdown is derived from
   * is the one the database agrees with — nothing here keeps its own idea of how
   * long a pause has lasted. A failure leaves the row exactly as it was, which
   * for a pause is the harmless direction: the worst case is a block that carried
   * on when it was asked to stop counting, and the countdown says so.
   */
  const pauseBlock = useMutation({
    mutationFn: pauseRunningTimer,
    onSuccess: () => {
      setFault(null);
      return queryClient.invalidateQueries({ queryKey: ["runningTimer"] });
    },
    onError: () => setFault("block"),
  });

  const resumeBlock = useMutation({
    mutationFn: resumeRunningTimer,
    onSuccess: () => {
      setFault(null);
      return queryClient.invalidateQueries({ queryKey: ["runningTimer"] });
    },
    onError: () => setFault("block"),
  });

  const discardBlock = useMutation({
    mutationFn: discardRunningTimer,
    onSuccess: () => {
      setFault(null);
      return refresh();
    },
    onError: writeFailed,
  });

  /**
   * Saves a new block length.
   *
   * The whole settings row goes back, as it always does — the Settings screen's
   * one Save and one `UPDATE` is preserved, and this is that same write with one
   * field different rather than a second place a duration can live. Which is why
   * the dial can never disagree with the number on that screen.
   */
  const saveLength = useMutation({
    mutationFn: (minutes: number) => {
      const current = settings.data;
      if (!current) {
        throw new Error("no settings row to change");
      }
      return updateSettings({ ...current, pomodoroMinutes: minutes });
    },
    onSuccess: async (saved) => {
      setFault(null);
      queryClient.setQueryData(settingsKey, saved);
      await queryClient.invalidateQueries({ queryKey: settingsKey });
    },
    onError: () => setFault("blockLength"),
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

  // Auto-stop at zero: a block can never be left running overnight, and no
  // longer needs the Timer screen to be open to be noticed.
  useEffect(() => {
    if (!block || orphaned || stopping || finishing.current) {
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
  }, [block, orphaned, stopping, now, settings.data]);

  // Once nothing is in flight, the next block found on launch is a crash
  // again — and a failed stop deliberately leaves the block, and the prompt.
  // Keyed on the live row: a block waiting out its undo window has not gone
  // anywhere, and forgetting that this process started it would offer an undone
  // stop back as an Orphaned Block.
  useEffect(() => {
    if (!liveBlock) {
      finishing.current = false;
      startedHere.current = false;
    }
  }, [liveBlock]);

  // The Break ends the same way it started: a chime and nothing written.
  useEffect(() => {
    if (breakEndsAt && Date.parse(now) >= Date.parse(breakEndsAt)) {
      setBreakEndsAt(null);
      announce(t("timer.breakEnded"));
    }
  }, [breakEndsAt, now]);

  const busy =
    startBlock.isPending ||
    stopBlock.isPending ||
    discardBlock.isPending ||
    pauseBlock.isPending ||
    resumeBlock.isPending;
  const paused = block !== null && isPaused(block);
  /**
   * Whether a pause or resume has been asked for in this tick.
   *
   * `busy` cannot answer that: two clicks landing in one batch both read it
   * before either mutation reports itself pending. Rust is forgiving about the
   * second request — pausing a paused block deliberately changes nothing — so
   * this saves a pointless round trip rather than preventing a wrong one.
   */
  const holding = useRef(false);
  if (holding.current && !pauseBlock.isPending && !resumeBlock.isPending) {
    holding.current = false;
  }
  // Not while a stop is pending: the row is still there, so starting would be
  // refused by Rust, and the honest thing to offer is the undo already on screen.
  const canStart =
    projectId !== null && plannedMinutes > 0 && !busy && !stopping;

  /**
   * The pending stop as the timeout sees it, beside the state the screen sees.
   *
   * Two copies because they answer different questions: the render needs to know
   * *that* a stop is pending, and the callback needs the stop itself without
   * being rebuilt — and a cleanup keyed on the state could not tell an expiry
   * apart from an undo, so undoing would commit the very thing it cancelled.
   */
  const waiting = useRef<PendingStop | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSettle = useRef(settle);
  latestSettle.current = settle;

  const forget = useCallback(() => {
    if (timeout.current !== null) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
    waiting.current = null;
  }, []);

  const commitStop = useCallback(() => {
    const pending = waiting.current;
    forget();
    setPendingStop(null);
    if (pending) {
      latestSettle.current(pending.source, pending.outcome);
    }
  }, [forget]);

  /**
   * Ends the block, five seconds from now.
   *
   * Deferred rather than written-then-undone, which is the choice
   * `use-undoable-delete` already makes and for the same reason: getting the
   * block back must not depend on a second write landing.
   *
   * A block that ran less than a minute is not deferred at all. Nothing is
   * written for it either way, so there is nothing to take back, and a toast
   * offering to undo the logging of nothing would be noise.
   */
  const stop = () => {
    if (!liveBlock || stopping) {
      return;
    }
    const outcome = outcomeAt(liveBlock, currentInstant());
    if (outcome.kind === "tooShort" || outcome.kind === "tooLong") {
      settle(liveBlock, outcome);
      return;
    }
    const pending = { source: liveBlock, outcome };
    waiting.current = pending;
    setPendingStop(pending);
    timeout.current = setTimeout(commitStop, UNDO_WINDOW_MS);
  };

  // Going away is not an answer to the question, so the stop goes through —
  // cancelling it would leave running a block the user asked to end.
  useEffect(() => () => commitStop(), [commitStop]);

  // No second request for a row already in the state being asked for.
  const pause = () => {
    if (block !== null && !paused && !busy && !holding.current) {
      holding.current = true;
      pauseBlock.mutate();
    }
  };

  const resume = () => {
    if (block !== null && paused && !busy && !holding.current) {
      holding.current = true;
      resumeBlock.mutate();
    }
  };

  // Start/Stop from the tray lands here rather than on the Timer screen: this
  // is where what a stopped block is worth is decided, and it is answered
  // whether or not that screen happens to be open. A block found on launch is
  // left alone — the recovery prompt is a question, and a menu item must not
  // answer it on the user's behalf.
  useTimerToggle(() => {
    if (!watching || orphaned || busy) {
      return;
    }
    if (block) {
      stop();
    } else if (canStart) {
      startBlock.mutate(projectId as number);
    }
  });

  // Pause from the tray lands here too, and here that is all it takes: nothing
  // is navigated to, because holding a block asks nothing of any screen. An
  // Orphaned Block is left alone for the reason Start/Stop leaves it alone —
  // there is no third answer to the recovery question, and resuming one would
  // be vouching for minutes nobody watched.
  useTimerPause(() => {
    if (!watching || orphaned || block === null) {
      return;
    }
    if (paused) {
      resume();
    } else {
      pause();
    }
  });

  const lifecycle: TimerLifecycle = {
    block,
    now,
    orphan: orphaned && block ? outcomeAt(block, discoveredAt) : null,
    breakEndsAt,
    projectId,
    chooseProject: setProjectId,
    plannedMinutes,
    // A block already under way keeps the length it started with, so there is
    // nothing for this to do while one is running.
    chooseLength: (minutes: number) => {
      if (block === null) {
        saveLength.mutate(minutes);
      }
    },
    fault,
    busy,
    canStart,
    start: () => {
      if (canStart) {
        startBlock.mutate(projectId as number);
      }
    },
    stop,
    pendingStop: pendingStop?.outcome ?? null,
    paused,
    pause,
    resume,
    undoStop: () => {
      forget();
      setPendingStop(null);
    },
    keepOrphan: () => {
      if (block) {
        settle(block, outcomeAt(block, discoveredAt));
      }
    },
    discard: () => discardBlock.mutate(),
    endBreak: () => setBreakEndsAt(null),
  };

  return (
    <LifecycleContext.Provider value={lifecycle}>
      {children}
    </LifecycleContext.Provider>
  );
}
