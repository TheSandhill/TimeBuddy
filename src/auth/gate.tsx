import { useState, type ReactNode } from "react";
import { RestoreNotice } from "../components/restore-notice";
import { ScrollArea } from "../components/scroll-area";
import { WindowFrame } from "../components/window-frame";
import { useRestoreOutcome } from "../restore/use-restore";
import { Unlock } from "./unlock";
import { useFirstRun } from "./use-first-run";
import { useSession } from "./use-session";
import { Wizard } from "./wizard";

/**
 * The door the app opens behind (ADR-0003), and the walk through setup behind
 * that.
 *
 * It sits outside the router on purpose: the lock screen and the wizard are
 * not screens of the app, they are what stands in front of it, and neither
 * should be reachable by a route. They carry their own window frame, so the
 * window can still be dragged, hidden and quit before anyone has typed
 * anything — and that frame says nothing about the work until the door opens.
 *
 * While anything is still being asked, nothing is rendered. Each question
 * lasts one round trip, and a flash of the wrong door is worse than a blank
 * one.
 */
export function Gate({ children }: { children: ReactNode }) {
  const { state, open } = useSession();

  // A restore re-locks the app, so this door is sometimes being shown for a
  // reason the person did not cause today. The explanation belongs on the
  // screen doing the asking (ADR-0008).
  const restored = useRestoreOutcome();

  /**
   * Whether this run has walked the wizard already.
   *
   * The wizard writes the very Client that `useFirstRun` looks for, so once it
   * has finished there is nothing left to ask — and asking anyway means a
   * blank window while the answer comes back.
   */
  const [walked, setWalked] = useState(false);

  const firstRun = useFirstRun(state === "open" && !walked);

  if (state === "checking") {
    return <WindowFrame revealsWork={false}>{null}</WindowFrame>;
  }

  if (state === "setup") {
    return (
      <WindowFrame revealsWork={false}>
        <Setting>
          {/*
           * Nothing to remember yet: the password was just chosen, and the
           * next launch is the first honest chance to offer keeping it.
           */}
          <Wizard
            onDone={() => {
              setWalked(true);
              open(null);
            }}
          />
        </Setting>
      </WindowFrame>
    );
  }

  if (state === "locked") {
    return (
      <WindowFrame revealsWork={false}>
        <Setting>
          {restored.data?.status === "done" ? (
            <RestoreNotice restoredFrom={restored.data.restoredFrom} />
          ) : null}
          <Unlock onOpen={open} />
        </Setting>
      </WindowFrame>
    );
  }

  // Straight through: the wizard just finished, and this render already knows
  // what a fresh query would come back and say.
  if (walked) {
    return <>{children}</>;
  }

  // Unlocked, but setup never got past the password. The account exists, so
  // the walk resumes at the step after it rather than starting over.
  if (firstRun === "unfinished") {
    return (
      <WindowFrame revealsWork={false}>
        <Setting>
          <Wizard startAt="backup" onDone={() => setWalked(true)} />
        </Setting>
      </WindowFrame>
    );
  }

  if (firstRun === "checking") {
    return <WindowFrame revealsWork={false}>{null}</WindowFrame>;
  }

  return <>{children}</>;
}

/** The scrolling body the lock screen and the wizard both sit in. */
function Setting({ children }: { children: ReactNode }) {
  return <ScrollArea className="p-6">{children}</ScrollArea>;
}
