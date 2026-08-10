/**
 * The one query the settings row is read through.
 *
 * There is exactly one row and three screens interested in it — the Settings
 * screen that writes it, the Timer that reads its lengths and toggles, and the
 * shell that wears its theme. Spelling the key in three places is how two of
 * them eventually end up looking at different caches.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getSettings } from "./commands";
import type { Settings } from "./types";

/** The cache key, exported so a writer can invalidate what readers read. */
export const settingsKey = ["settings"] as const;

export function useSettings(): UseQueryResult<Settings> {
  return useQuery({ queryKey: settingsKey, queryFn: getSettings });
}
