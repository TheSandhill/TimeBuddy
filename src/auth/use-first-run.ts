/**
 * Whether first-run setup ever finished.
 *
 * The account row's absence says the wizard has never been started. It says
 * nothing about whether it was *completed* — the wizard commits step by step,
 * so an install abandoned after the password was chosen has an account and
 * nothing else. Left at that, the next launch would unlock straight into the
 * five empty screens the wizard exists to prevent.
 *
 * The signal that the walk finished is the first Client. Clients are archived,
 * never deleted (`CONTEXT.md`), so "none at all" cannot mean "there were some
 * once" — it only ever means step three was never reached. Archived ones are
 * counted for exactly that reason.
 */

import { useQuery } from "@tanstack/react-query";
import { listClients } from "../data/commands";

export type FirstRun =
  /** Still asking. Nothing should be rendered on a guess. */
  | "checking"
  /** Setup was finished. The app proper. */
  | "done"
  /** An account, but no work to start on. The wizard, resumed. */
  | "unfinished";

export function useFirstRun(asking: boolean): FirstRun {
  const clients = useQuery({
    queryKey: ["clients", "everAny"],
    queryFn: () => listClients(true),
    enabled: asking,
  });

  if (!asking || clients.isPending) {
    return "checking";
  }
  // A database that will not answer is not a reason to re-run setup over the
  // top of data that may well be there. The app can say so for itself.
  if (clients.isError) {
    return "done";
  }

  return clients.data.length === 0 ? "unfinished" : "done";
}
