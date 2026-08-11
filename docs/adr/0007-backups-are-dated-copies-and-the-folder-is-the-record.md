# ADR-0007: Backups are dated copies, and the folder is the record

- **Status**: Accepted
- **Date**: 2026-08-11
- **Amended by**: ADR-0008 — there *is* a restore. Everything else here stands, and the restore is
  built on all of it.

## Context

Everything TimeBuddy knows is one SQLite file on one laptop (ADR-0001, ADR-0003). A failed disk, a
stolen bag or a bad shutdown takes a year of billing history with it, and there is no server holding
a second copy. This is the highest value-per-line feature in the app.

Three questions had to be answered:

1. **How is the copy taken?** The database is open and being written to while the app runs.
2. **Where is "when did the last backup succeed" kept?**
3. **When does a backup happen**, in an app that spends most of its life switched off?

## Decision

### The copy is `VACUUM INTO`, not a file copy

SQLite's own `VACUUM INTO '<path>'` writes a consistent, compacted snapshot of the live database.
A `std::fs::copy` of an open database can catch a write half-finished and produce a file that
restores into a corrupt database — silently, because the bytes are all there.

The pool the app already queries through takes the snapshot; nothing else touches the file.

### The folder is the record

There is **no `last_backup_at` column**. The newest file in the backup folder is when the last
backup succeeded, because that is what "the last backup succeeded" means. Files are named
`timebuddy-YYYYMMDDTHHMMSSZ.db`, in UTC, and the stamp is parsed back out of the name.

### Rotation keeps seven, and only touches its own files

The eighth backup deletes the oldest. The candidates are only files whose names match the pattern
above — the recommended folder is a synced one (OneDrive, Dropbox), which is a folder with other
things in it.

Sweeping up is **best effort**. A copy that cannot be deleted — a sync client holding the oldest file
open, on a folder recommended precisely because it syncs — does not turn a backup that worked into a
backup that failed.

### Daily means "on launch, if today's has not been made"

There is no scheduler. A scheduler in a program that is closed at midnight is a scheduler that never
fires. The app shell asks Rust whether one is owed — no backup dated today — and makes it if so, once
per launch.

## Consequences

- A row and a folder can never disagree about whether the data is safe. Deleting the backups is
  understood by the app immediately, because there was never a second place recording that they had
  existed.
- ~~Restoring is copying one file back by hand and renaming it. There is no restore feature, and that
  is deliberate: a restore button is a delete-everything button with a nicer label, and the manual
  version is a thing one person can do on one laptop without the app's help.~~ **Reversed by
  ADR-0008.** The mechanism was described correctly and the person was not: by hand it also means
  knowing to quit from the tray first, and the one doing it has already lost something.
- A folder that has stopped shedding old copies is visible rather than merely tolerated: the count
  the Settings screen shows is the number of files actually there, not the seven that were intended.
- The stamp is UTC while the reader is in Amsterdam, so `momentLabel` converts at the edge. Whether
  a backup landed either side of local midnight changes nothing about whether the data is safe, so
  "one a day" is a UTC day.
- `VACUUM INTO` refuses to overwrite an existing file. Two backups inside the same second — "Back up
  now" pressed twice — is not an error: the file that would be written is the one already there.
- **`VACUUM INTO` is a silent no-op on `sqlite::memory:`** — it reports success and writes nothing.
  The backup tests therefore run against a database in a real file (`db::test_file_pool`), not the
  in-memory pool the rest of the suite uses. A test on the in-memory pool would have passed while
  testing nothing.
- A failed attempt raises a banner across the top of every screen, with the retry on it, and says
  which copy is still good. Staleness on its own does **not**: every stale folder is also a folder
  that owes a backup, and every launch attempts the one it owes — so "the last one is old" and "the
  last one failed" are the same news, and only the second says why. Staleness is shown on the
  Settings screen instead, where it is read rather than announced.
- The default folder is `backups` under the app's own data directory — resolved at runtime, never
  frozen into a row (`CONTEXT.md`). Setup nudges towards a synced folder, because that is what makes
  a broken laptop something other than a lost year, and it costs nothing.
