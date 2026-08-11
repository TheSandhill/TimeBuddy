/**
 * Which of the three doors the app opens with.
 *
 * There is no fourth. An install has either never been set up, or is locked,
 * or is open — and the answer to which is a question for Rust, not a flag in
 * the webview: the account row's absence is what "never set up" means, and the
 * token's validity is checked where the deadline is stored (ADR-0003).
 */

import { useCallback, useEffect, useState } from "react";
import {
  accountExists,
  claimRestoreRelock,
  resumeSession,
} from "../data/commands";
import { clearToken, readToken, writeToken } from "./session";

export type SessionState =
  /** Asking Rust. Nothing is shown yet — a flash of the wrong door is worse. */
  | "checking"
  /** No account. The first-run wizard, not the unlock screen. */
  | "setup"
  /** An account, and no valid token. The unlock screen. */
  | "locked"
  /** Through. */
  | "open";

export interface Session {
  state: SessionState;
  /** Called when the wizard finishes, or the unlock screen succeeds. */
  open: (token: string | null) => void;
}

export function useSession(): Session {
  const [state, setState] = useState<SessionState>("checking");

  useEffect(() => {
    let current = true;

    const decide = async () => {
      // A restore brings its own account row with it (ADR-0008). The password is
      // now the one from the day that backup was made, and the token in this
      // webview was issued by a database that is no longer here — so the session
      // is dropped deliberately rather than left to fail its own check. A door
      // that quietly reverted to an older key would be the worst kind of
      // surprise, which is why the lock screen says what happened.
      //
      // Claimed, not read: this is owed once per launch. Asking whether a
      // restore *happened* would still be true after the user has unlocked and
      // ticked "remember me", so a reload would throw away the token the
      // restored database had just issued — a box that could never stay ticked.
      if (await claimRestoreRelock()) {
        clearToken();
        return (await accountExists()) ? ("locked" as const) : ("setup" as const);
      }

      if (!(await accountExists())) {
        return "setup" as const;
      }
      const token = readToken();
      if (token && (await resumeSession(token))) {
        return "open" as const;
      }
      // A token Rust would not take is a token worth throwing away, so the
      // next launch does not spend a round trip asking about it again.
      clearToken();
      return "locked" as const;
    };

    void decide().then(
      (next) => current && setState(next),
      // The database is unreachable. Locked is the honest answer: the app
      // cannot show hours it cannot read, and it must not open by accident.
      () => current && setState("locked"),
    );

    return () => {
      current = false;
    };
  }, []);

  const open = useCallback((token: string | null) => {
    // `null` is "do not remember me", which is an instruction to forget any
    // token still lying about rather than to leave it be.
    if (token) {
      writeToken(token);
    } else {
      clearToken();
    }
    setState("open");
  }, []);

  return { state, open };
}
