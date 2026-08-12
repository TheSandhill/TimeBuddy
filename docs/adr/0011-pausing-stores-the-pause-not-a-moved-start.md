# ADR-0011: Pausing stores the pause, not a moved start

- **Status**: Accepted
- **Date**: 2026-08-12

## Context

A block could only be started or stopped. An interruption left the user choosing between logging time
they had not worked and throwing away a block they were partway through — so pause was wanted.

The Running Timer was built on a single stored instant. `CONTEXT.md` says so outright, and rests a real
property on it: elapsed time is the distance between two wall-clock readings, never a tally kept by a
counting interval, which is why laptop sleep is a non-event and why a crash three days into a block
offers back 25 minutes instead of three days.

Pausing has to fit inside that. A held block must survive the process, because the alternative — a
pause kept in memory — would mean a crash while paused resumed the clock retroactively over however
long the app was gone.

## Decision

Migration 5 adds two columns to `running_timer`:

- `paused_at TEXT NULL` — when the pause in progress began; null while running.
- `paused_seconds INTEGER NOT NULL DEFAULT 0` — every pause already finished, totalled.

Elapsed becomes `(paused_at ?? now) − start_at − paused_seconds`. Still two wall-clock readings and a
stored total. Nothing ticks.

**`start_at` is not moved.** The cheaper design was one column: on resume, shift `start_at` forward by
the length of the pause, and every existing calculation keeps working unchanged. It was rejected
because the logged TimeEntry takes its `start_at` from this row, and that column exists precisely
because it is *true* — the Entries screen prints it as the window the work ran in. Shifting it would
report that work began later than it did, to buy a slightly smaller diff.

Both writes are **forgiving about being asked twice**. Pausing an already-paused block does nothing:
overwriting `paused_at` would move the point elapsed is measured to and hand the block minutes nobody
worked, which is the one outcome worse than a redundant round trip. Resuming a block that was never
paused likewise does nothing.

A pause is **indefinite**. That is a genuine exception to the reason the Pomodoro Block exists — "a
timer that ends on its own can't be left running overnight" — so it is paid for in the interface
rather than with a cap: the titlebar pill and the tray tooltip *say paused* instead of showing a
countdown that has stopped moving. A still clock is the one state of this app that reads as a bug. If
the process dies while paused, the next launch asks about the block exactly as it would after any other
death, offering only the minutes actually worked.

## Consequences

- A paused block's entry spans longer than its duration: pause 20 minutes inside a 25-minute block and
  it reads `09:00–09:45` with `25 min`. Accepted — that is what happened. Durations are what reports
  add up; the window is descriptive. The alternative was one entry per segment, which would put three
  rows in today's list for one block and fight "a Pomodoro Block becomes *a* TimeEntry".
- `outcomeAt` had to learn about pauses in one more place than expected: a completed block ran out
  `planned` minutes of *work* after it began, so its end instant is `start_at + planned + paused_seconds`.
  Getting that wrong would log an `end_at` earlier than the block really ended.
- The auto-stop effect is inert while paused for free, because elapsed stops advancing. No guard needed.
- The dial grew a second button. The big one is now always "the obvious next thing" — Start, Pause,
  Resume — and **Stop is a smaller button beside it**. That asymmetry is deliberate: stopping writes
  hours and is rarer, and giving it the same weight as pausing invites the mistake ADR-less #34 exists
  to catch.
- Two new commands, `pause_running_timer` and `resume_running_timer`, both returning the re-read row so
  the frontend never keeps its own idea of how long a pause has lasted.
- The tray menu does **not** gain a Pause item here. That is #36: it means a fourth entry, a new event,
  and the string assertions Rust makes against the catalogues.
- Cost: `running_timer` is no longer readable at a glance. Two columns and a rule replace one column and
  none, and every place that measures a block has to go through `elapsedSeconds` rather than subtracting
  for itself. That was already the rule; it is now load-bearing.
