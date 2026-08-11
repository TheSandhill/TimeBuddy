/**
 * The queries the update prompt and the Settings screen are both driven from.
 *
 * Two places are interested: the bar across the top of the app, which is where
 * an update is actually accepted, and the Settings screen with the "check now"
 * button on it. Both read the **same** cache key, so pressing the button cannot
 * leave the two disagreeing about whether there is a newer TimeBuddy.
 *
 * A check is made **once per launch**, like the daily backup, and for the same
 * reason: it has to happen whether or not anybody goes looking for it. It is
 * mounted behind the lock screen, because that is where its answer has somewhere
 * to appear.
 */

import { useState } from "react";
import {
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { checkForUpdate, currentVersion, type PendingUpdate } from "./updater";

export const updateKey = ["update", "check"] as const;
export const versionKey = ["update", "version"] as const;

export interface UpdateCheck {
  /**
   * The newer version, `null` when this build is the newest, and `undefined`
   * while the answer is not in yet — which is not the same thing as "no".
   */
  update: PendingUpdate | null | undefined;
  checking: boolean;
  /**
   * The check could not be made at all. Read on Settings, never announced: a
   * laptop with no network is not news, and there is nothing at risk.
   */
  failed: boolean;
  /** Ask again. What the button in Settings does, and the only retry there is. */
  check: () => void;
}

/** The version of the running build, for the line that says which one it is. */
export function useCurrentVersion(): UseQueryResult<string> {
  return useQuery({
    queryKey: versionKey,
    queryFn: currentVersion,
    staleTime: Infinity,
  });
}

export function useUpdateCheck(): UpdateCheck {
  const query = useQuery({
    queryKey: updateKey,
    queryFn: checkForUpdate,
    // `Infinity` is what makes this once per launch: without it, every window
    // focus would be another request to GitHub for an answer that changes on
    // the timescale of a release, not of an alt-tab.
    staleTime: Infinity,
    // And this is what keeps it true across a re-lock. The shell unmounts when
    // the door closes behind a restore, and the default five minutes would
    // collect the answer while nobody was looking — so unlocking again would ask
    // GitHub a second time for a fact about this launch.
    gcTime: Infinity,
    // No automatic retry. The one thing that fixes a failed check is a network
    // that came back, and nothing here can tell when that happened — so the
    // retry is a button, the same way a failed backup's is (ADR-0007).
    retry: false,
  });

  return {
    update: query.data,
    checking: query.isFetching,
    failed: query.isError,
    check: () => void query.refetch(),
  };
}

export interface UpdatePrompt {
  /**
   * The version to offer, or `null` — nothing newer, not asked yet, the check
   * failed, or this one has already been waved off.
   */
  offered: { version: string } | null;
  install: () => void;
  installing: boolean;
  /**
   * The install did not happen. Worth saying, unlike a failed check: the user
   * pressed a button and is still looking at the old version.
   */
  installFailed: boolean;
  /** "Later." Takes the bar down for this version, until the next launch. */
  dismiss: () => void;
}

export function useUpdatePrompt(): UpdatePrompt {
  const { update } = useUpdateCheck();

  /**
   * The version "later" was said to, rather than a bare boolean.
   *
   * Held in component state, so it lasts exactly one launch — which is the
   * honest lifetime for it. A dismissal kept on disk would be a preference
   * nobody chose, and one the user would have to find again to undo.
   */
  const [dismissed, setDismissed] = useState<string | null>(null);

  // The update travels in as the argument rather than being read off the
  // closure, so there is no "install what the check found, if it found anything"
  // to assert with a cast: an unanswered check has nothing to pass.
  const install = useMutation({
    mutationFn: (target: PendingUpdate) => target.install(),
  });

  const offered =
    update === null || update === undefined || update.version === dismissed
      ? null
      : { version: update.version };

  return {
    offered,
    install: () => {
      if (update) install.mutate(update);
    },
    installing: install.isPending,
    installFailed: install.isError,
    dismiss: () => {
      if (update) setDismissed(update.version);
    },
  };
}
