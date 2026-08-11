/**
 * The one query and the one mutation the backup folder is reached through.
 *
 * Two screens are interested: the banner across the top of the app, which is
 * the only thing that will say a backup failed, and the Settings screen with
 * the button on it. Both read the same cache key, so pressing "Back up now"
 * takes the banner down rather than leaving it arguing with the folder.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { backupStatus, runBackup } from "../data/commands";
import type { BackupStatus } from "../data/types";

/** The cache key, exported so a writer can invalidate what readers read. */
export const backupKey = ["backup"] as const;

export function useBackupStatus(): UseQueryResult<BackupStatus> {
  return useQuery({ queryKey: backupKey, queryFn: backupStatus });
}

/**
 * Makes a backup now.
 *
 * The command answers with the folder as it stands afterwards, and that answer
 * is written straight into the cache — a backup that has just been made is not
 * something to go and ask about again.
 */
export function useRunBackup(): UseMutationResult<BackupStatus, unknown, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => runBackup(),
    onSuccess: (status) => queryClient.setQueryData(backupKey, status),
  });
}
