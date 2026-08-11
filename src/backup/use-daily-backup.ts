/**
 * The daily backup, and the one thing it can interrupt someone about.
 *
 * "Daily" for an app that is not always running means **on launch, if today's
 * has not been made yet** — there is no scheduler, because a scheduler for a
 * program that spends the night switched off is a scheduler that never fires.
 * Whether one is owed is decided in Rust, off the folder itself (ADR-0007);
 * this hook only asks and acts.
 *
 * Mounted once, in the app shell, behind the lock screen — so the backup
 * happens where its failure has somewhere to appear.
 *
 * A **failed attempt** is the only thing that raises the banner. Staleness is
 * not: every stale folder is also a folder that owes a backup, and every launch
 * attempts the one it owes — so "the last one is old" and "the last one failed"
 * are the same news, and only the second says why. Staleness is still shown, in
 * Settings, where it is read rather than announced.
 */

import { useEffect } from "react";
import type { Instant } from "../data/types";
import { useBackupStatus, useRunBackup } from "./use-backup";

export interface DailyBackup {
  /** The last attempt failed, or `null` when nothing has gone wrong. */
  failure: {
    /** The newest backup that *did* work — what is still safe. `null`: none. */
    lastBackupAt: Instant | null;
  } | null;
  /**
   * Try again. Deliberately the **same** attempt the launch made, rather than a
   * second mutation of its own — a retry that succeeded while the first failure
   * was still on record would leave the banner arguing with the folder.
   */
  retry: () => void;
  retrying: boolean;
}

export function useDailyBackup(): DailyBackup {
  const status = useBackupStatus();
  const run = useRunBackup();

  // `isIdle` is what keeps this to one attempt per launch: once the mutation
  // has an outcome it is no longer idle, so a folder that fails is asked once
  // and then reported, rather than retried for as long as the app is open.
  const owed = status.data?.due === true && run.isIdle;

  // Keyed on `owed` alone rather than on the mutation: what stops a second
  // attempt is the mutation's own state, above, and not this dependency list.
  useEffect(() => {
    if (owed) run.mutate();
  }, [owed, run]);

  return {
    failure: run.isError
      ? { lastBackupAt: status.data?.lastBackupAt ?? null }
      : null,
    retry: () => run.mutate(),
    retrying: run.isPending,
  };
}
