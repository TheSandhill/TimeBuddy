/**
 * The in-flight block and a clock that moves while it runs.
 *
 * Two things outside the Timer screen watch the same block — the titlebar's
 * pill and the tray's tooltip — and they must agree, down to the second they
 * are reading. So the shell subscribes once and hands the reading down, rather
 * than each of them starting an interval of its own.
 */

import { useQuery } from "@tanstack/react-query";
import { getRunningTimer } from "../data/commands";
import type { Instant, RunningTimer } from "../data/types";
import { useNow } from "./use-now";

export interface RunningBlock {
  /** The at-most-one block in flight, or `null`. Absence is the normal state. */
  block: RunningTimer | null;
  /** A wall-clock reading, refreshed each second while something is running. */
  now: Instant;
}

export function useRunningBlock(): RunningBlock {
  const running = useQuery({
    queryKey: ["runningTimer"],
    queryFn: getRunningTimer,
  });
  const block = running.data ?? null;

  return { block, now: useNow(block !== null) };
}
