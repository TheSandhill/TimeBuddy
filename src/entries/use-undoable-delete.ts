/**
 * The five seconds between "delete" and the row actually going away.
 *
 * The delete is **deferred**, not undone: the row is left alone until the
 * window runs out, and undo simply cancels the write. Deleting first and
 * re-creating on undo would work too, but it makes getting the row back depend
 * on a second write succeeding — and a hard delete is the one thing in this app
 * that really loses hours (`CONTEXT.md`).
 *
 * The row is hidden from the list while it waits, so the screen already tells
 * the truth about what is about to happen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeEntry } from "../data/types";

export const UNDO_WINDOW_MS = 5000;

export interface UndoableDelete {
  /** The entry on its way out, or `null`. Hide it, and offer the undo. */
  pending: TimeEntry | null;
  request: (entry: TimeEntry) => void;
  undo: () => void;
}

export function useUndoableDelete(
  commit: (entry: TimeEntry) => void,
): UndoableDelete {
  const [pending, setPending] = useState<TimeEntry | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** So unmount and a second request can settle without a stale render. */
  const waiting = useRef<TimeEntry | null>(null);
  const latestCommit = useRef(commit);
  latestCommit.current = commit;

  const clear = useCallback(() => {
    if (timeout.current !== null) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
    waiting.current = null;
  }, []);

  const settle = useCallback(() => {
    const entry = waiting.current;
    clear();
    setPending(null);
    if (entry) {
      latestCommit.current(entry);
    }
  }, [clear]);

  const request = useCallback(
    (entry: TimeEntry) => {
      // Only one row can be on its way out: a second toast would offer back a
      // row the first one is already taking away.
      settle();
      waiting.current = entry;
      setPending(entry);
      timeout.current = setTimeout(settle, UNDO_WINDOW_MS);
    },
    [settle],
  );

  const undo = useCallback(() => {
    clear();
    setPending(null);
  }, [clear]);

  // Leaving the screen is not an answer to the question, so the pending delete
  // goes through. Cancelling it would put a row back the user asked to remove.
  useEffect(() => () => settle(), [settle]);

  return { pending, request, undo };
}
