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

Choosing a backup **stages** it: the chosen file is verified, then copied beside the database as
`restore-pending-<stamp>.db`, carrying the stamp of the backup it holds. Nothing else is written, and
nothing is destroyed. The next launch finds that file and performs the swap before the pool opens and
before `tauri-plugin-sql` migrates anything.

The file's **presence is the record**, exactly as the backup folder is the record in ADR-0007. There
is no `restore_pending` column, because a row and a file could disagree about whether a restore is
owed. The stamp is in the name for the same reason, and it is load-bearing rather than decorative:
the original file name is gone once the copy is made, so the name is the only thing left that knows
which day the restore is from — which is what the swap has to say afterwards.

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

The re-lock is owed **once per launch**, and Rust hands it out once — a separate command from the one
that reports the outcome. The two look like the same question and are not: the outcome is a *fact*
about the launch and is read repeatedly, by the notice and by the Settings screen, while the re-lock is
an *event*. Conflating them means a webview reload is told to re-lock again and throws away the token
the restored database has just issued, so "remember me" could never survive a restore.

### Whole file only

There is no partial restore — no "this client's hours". That is a merge, not a restore: it needs
conflict rules for rows edited on both sides, and identity for rows whose `id` has since been reused.
A feature with different semantics does not belong behind the same button.

### A staged restore can be called off, and a finished one is on the record

Two small things the scope did not ask for, both of which fall out of the staging being a two-launch
act rather than one:

- **Cancelling.** Staging is a decision that takes effect later, so without a way to undo it the
  Settings screen would be a trap: the only way out of a restore chosen by accident would be to let it
  happen. Clearing the staged file is the whole implementation.
- **Saying what the last restore was.** The safety copy is only useful as an undo if the user can name
  it, and the file is one of seven UTC stamps in a folder. So the restore that happened is *read* on
  Settings — never announced there, which is the split ADR-0007 already drew for backup staleness.

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
- The pre-restore copy is taken through a **single short-lived connection**, closed before the swap, so
  the file being replaced is not open at the moment it is replaced. It was originally a short-lived
  *pool*, which does not buy this: `SqlitePool::close` waits for the pool to be done with its
  connections, but sqlx defers closing the connections themselves to tasks it spawns as each is
  dropped, so on a busy machine SQLite still held the file when the swap tried to rename it. Windows
  refuses a rename on an open handle, and the restore failed with `SwapFailed` — see #46. Only
  `SqliteConnection::close` waits for the handle to actually go.
- The staged file sits beside the database in the app config directory, not in the backup folder.
  The backup folder is often synced, and staging a file into a folder something else is uploading is
  asking for the swap to read a partial copy.
- The swap is a rename, not a copy: on the same volume it is atomic, so an interrupted restore leaves
  either the old database or the new one, never half of each. The WAL and shared-memory sidecars of
  the replaced database are removed with it, because a WAL from a different database is not a
  recovery, it is corruption.
- ADR-0007's "there is no restore" consequence no longer holds. The rest of it — `VACUUM INTO`, the
  folder as the record, rotation keeping seven of its own files — is untouched, and this feature is
  built on all of it.
