# ADR-0008: Restore is staged, verified, and swapped at launch

- **Status**: Accepted
- **Date**: 2026-08-11
- **Amends**: ADR-0007, which said there would be no restore feature

## Context

ADR-0007 shipped the backups and argued restoring was "copying one file back by hand", so the app
needed no restore of its own. That reasoning was sound about the *mechanism* and wrong about the
*person*. By hand, on Windows, it means: find `%APPDATA%\<identifier>`, pick the right file out of
seven whose names are UTC stamps, rename it to `timebuddy.db`, and — the part nobody knows — quit
TimeBuddy **from the tray** first, because close only hides (ADR-0004). Someone who closes the window
and swaps the file is swapping a file SQLite still has open, with a running WAL beside it.

That is the one moment the app cannot afford to be absent: the person doing it has already lost
something.

A restore also cannot be one command. The live database is open, and a process may not overwrite the
file its own pool holds.

## Decision

### The swap happens at launch, before anything opens the file

Choosing a backup **stages** it: the chosen file is verified, then copied to `restore-pending.db`
beside the database. Nothing else is written, and nothing is destroyed. The next launch finds that
file and performs the swap before the pool opens and before `tauri-plugin-sql` migrates anything.

The file's **presence is the record**, exactly as the backup folder is the record in ADR-0007. There
is no `restore_pending` column, because a row and a file could disagree about whether a restore is
owed.

This inverts one thing ADR-0007's implementation relied on: the sql plugin is now registered from
inside the app's `setup` hook, *after* the swap, rather than on the builder. Plugin `setup` hooks run
before the builder's own, so a plugin registered on the builder would have migrated the database this
restore is about to replace.

### The present is copied aside first, as an ordinary backup

Before the swap, the current database is copied into the backup folder under the ordinary
`timebuddy-<stamp>.db` name, with `VACUUM INTO` like every other backup — and it **counts against the
seven** that rotation keeps.

It is not given a name of its own. A second naming convention would be a second thing rotation has to
understand, and a copy exempt from rotation is a folder that grows without limit. Naming it like what
it is has a better consequence too: the safety copy is itself restorable, so undoing a restore is the
same act as making one, from the same list.

This is what makes the feature runnable twice. A restore that discarded the present to recover the
past could only ever be run once correctly.

### The file is verified before the present is touched

A backup in a half-synced OneDrive folder can be a truncated file whose name is perfectly good. So a
candidate is opened and checked — `PRAGMA integrity_check`, the tables the app reads, and a schema
version this build knows how to migrate forward — **twice**: once when it is staged, so the answer is
immediate, and again at launch before the swap, because a synced folder can rot in between.

A candidate whose schema is **newer** than this build is refused. Migrating forward is something the
plugin does; migrating backward is not, and a database from a later version would be opened by code
that does not know its columns.

Verification failing at launch deletes the staged copy and reports it. Keeping a file that is known
bad would be a restore that fails on every launch forever.

### A restore re-locks the app

The account row travels with the database (ADR-0003), so a backup from before a password change
carries the old password with it. After a swap, the password that opens the door is the one from the
day the backup was made.

The remembered-token hash travels too, so a "remember me" webview token would stop matching and land
on the lock screen anyway. This makes that explicit rather than incidental: the session is dropped on
a swap, and the notice says which day's password is now the one that works. A door that silently
reverted to an older key would be the worst kind of surprise.

### Whole file only

There is no partial restore — no "this client's hours". That is a merge, not a restore: it needs
conflict rules for rows edited on both sides, and identity for rows whose `id` has since been reused.
A feature with different semantics does not belong behind the same button.

### The failure is never silent

A staged restore that could not be completed raises the same banner across the top of every screen
that a failed backup does, and says the current database was left alone. Opening on old data with no
explanation would read as the restore having worked.

## Consequences

- Restoring costs a relaunch, and the UI says so before it stages anything. This is the honest
  version: the alternative is a process that overwrites a file it has open.
- The safety copy consumes one of the seven slots, so a restore shortens backup history by a day. That
  is the right trade — the copy protecting the present is worth more than the seventh-oldest past.
- Two verifications of the same file is deliberate duplication. The first is for the person choosing;
  the second is the one that actually guards the swap.
- The pre-restore copy is taken through a short-lived pool that is closed before the swap, so the file
  being replaced is not open at the moment it is replaced.
- `restore-pending.db` sits beside the database in the app config directory, not in the backup folder.
  The backup folder is often synced, and staging a file into a folder something else is uploading is
  asking for the swap to read a partial copy.
- The swap is a rename, not a copy: on the same volume it is atomic, so an interrupted restore leaves
  either the old database or the new one, never half of each. The WAL and shared-memory sidecars of
  the replaced database are removed with it, because a WAL from a different database is not a
  recovery, it is corruption.
- ADR-0007's "there is no restore" consequence no longer holds. The rest of it — `VACUUM INTO`, the
  folder as the record, rotation keeping seven of its own files — is untouched, and this feature is
  built on all of it.
