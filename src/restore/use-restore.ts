/**
 * The queries and mutations a restore is driven through.
 *
 * A restore is two launches (ADR-0008), so there are two things to ask about:
 * what is **staged** — which the Settings screen shows, with the way to undo it
 * — and what the last launch **did**, which the shell announces.
 *
 * Both read their own cache key. Staging invalidates the staged one, so the
 * notice appears without a reload, and nothing invalidates the outcome: it is a
 * fact about a launch, and a launch does not happen twice.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  cancelRestore,
  listRestorableBackups,
  pendingRestore,
  previewRestore,
  restoreOutcome,
  stageRestore,
} from "../data/commands";
import type {
  Instant,
  RestorableBackup,
  RestoreOutcome,
  RestorePreview,
} from "../data/types";

export const restorableKey = ["restore", "restorable"] as const;
export const pendingRestoreKey = ["restore", "pending"] as const;
export const restoreOutcomeKey = ["restore", "outcome"] as const;

/** The backups on offer, newest first. */
export function useRestorableBackups(): UseQueryResult<RestorableBackup[]> {
  return useQuery({ queryKey: restorableKey, queryFn: listRestorableBackups });
}

/**
 * What restoring `fileName` would cost.
 *
 * Disabled until something is chosen, so opening the section costs nothing —
 * the cost is a question about one backup, not about the folder.
 */
export function useRestorePreview(
  fileName: string | null,
): UseQueryResult<RestorePreview> {
  return useQuery({
    queryKey: ["restore", "preview", fileName] as const,
    queryFn: () => previewRestore(fileName as string),
    enabled: fileName !== null,
  });
}

/** The restore waiting for a relaunch, or `null`. */
export function usePendingRestore(): UseQueryResult<Instant | null> {
  return useQuery({ queryKey: pendingRestoreKey, queryFn: pendingRestore });
}

/**
 * Stages a restore.
 *
 * Success here means "verified and staged", never "restored" — so callers show
 * the relaunch notice rather than a tick.
 */
export function useStageRestore(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileName: string) => stageRestore(fileName),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pendingRestoreKey }),
  });
}

export function useCancelRestore(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelRestore(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pendingRestoreKey }),
  });
}

/**
 * What this launch did about a staged restore.
 *
 * `staleTime: Infinity` because it cannot change: the swap happened before the
 * window existed, and re-asking would only be a second chance to get the same
 * answer.
 */
export function useRestoreOutcome(): UseQueryResult<RestoreOutcome> {
  return useQuery({
    queryKey: restoreOutcomeKey,
    queryFn: restoreOutcome,
    staleTime: Infinity,
  });
}
