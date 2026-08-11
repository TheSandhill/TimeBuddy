# TimeBuddy — Context

A single-user Windows desktop app for tracking hours spent on client work done from home.
One person uses it: the owner of the laptop it runs on. Everything is local.

## Ubiquitous language

### Client

A person or organisation the work is done for. Has a name and optional contact notes.

A Client is **never deleted** — only archived. Once hours exist against a Client's Projects,
deleting it would silently rewrite history. Archiving hides it from pickers and keeps it in reports.

### Project

A named piece of work belonging to exactly one Client. Carries an optional `hourly_rate` that
nothing reads yet — it exists so billing can be added without a migration.

Like Client, a Project is **archived, never deleted**. Archiving a Client also takes its Projects
out of the pickers without touching their own `archived_at` — the work is unofferable because the
Client is gone, so restoring the Client is what brings them back. See ADR-0005.

### TimeEntry

The atomic record of work: one Project, one `date`, one `duration_minutes`, an optional free-text
`note`. This is the only table hours are ever read from.

`start_at` / `end_at` are **nullable** and only populated when the entry came from the Timer.
A manually entered "2 hours on Tuesday" has no start time, and inventing one would be a lie.

`source` distinguishes `manual` from `timer`. Both kinds live in the same table — a timer block
is not a special kind of record, it is a TimeEntry that happens to know when it started.

Entries **may overlap in time**. Only timer entries have times at all, and refusing "2h on A and
1h on B on Tuesday" would fight the user for no gain.

Validation is limited to what is genuinely wrong: `duration_minutes > 0`, `<= 24h`, `date` not in
the future.

A TimeEntry **is** hard-deletable, behind a 5-second undo.

### Pomodoro Block

A timed working interval — default 25 minutes, configurable — that stops itself. The user restarts
it deliberately, which is the point: a timer that ends on its own can't be left running overnight.

A completed block logs its full length. A block stopped early logs the **actual elapsed time**,
never the nominal length.

A Pomodoro Block is not a separate entity. When it ends, it becomes a TimeEntry with
`source = 'timer'`.

### Break

The countdown between blocks. A Break is **never stored** — it produces a chime and a countdown,
nothing else. Breaks are not work, so they are not hours.

### Running Timer

The at-most-one in-flight Pomodoro Block. Its start instant is persisted, and elapsed time is
derived from wall clock — not from a counting interval — so laptop sleep is a non-event.

If the app dies with a Running Timer present, the next launch **asks** whether to keep the elapsed
time. Silently discarding loses real work; silently logging invents it.

### Report

An aggregation of TimeEntries over a date range, grouped by Client or Project. Weeks start
**Monday** (ISO). Durations are stored as truth and rounded only at presentation, never on write.

Archived Clients and Projects still appear: archiving hides something from the pickers, not from
history.

### Period

Which stretch of days a Report is about: **this week**, **last week**, **this month**,
**last month**, or a custom range. A preset is a name, not a range — it is resolved against today
in Rust, so "last week" is the same Monday-to-Sunday on screen and in the export, including over a
year boundary.

A range that is exactly one Monday-to-Sunday week carries its **ISO week number**, and the ISO year
with it: the week of 28 December 2026 runs into January and is still 2026 week 53.

### Export

A Report's TimeEntries written out as an `.xlsx` — one sheet, one row per entry, scoped to the
range on screen, saved wherever the native dialog says. **No CSV.** See ADR-0006.

### Backup

A dated copy of the whole database, written with SQLite's own `VACUUM INTO` — never a file copy of a
database that is open and being written to. See ADR-0007.

The **newest seven** are kept. The eighth evicts the oldest, and only files TimeBuddy named are ever
candidates: the recommended folder is a synced one, which is a folder with other things in it.

There is **no `last_backup_at` column**. The newest file's own name is when the last backup
succeeded — the folder is the record, so a row and a folder can never disagree about whether the data
is safe.

**Daily means "on launch, if today's has not been made".** There is no scheduler: one in a program
that is closed at midnight would never fire.

A backup that **fails** is announced across the top of every screen, with the retry on it, and says
which copy is still good. A backup that is merely **stale** is not: every stale folder is also one
that owes a backup, and every launch attempts the one it owes — so the two are the same news and only
the failure says why. Staleness is shown on the Settings screen, where it is read rather than
announced.

### Restore

Going back to a Backup: the whole database, replaced by the copy from a chosen day.

ADR-0007 said there would be none, on the grounds that copying one file back is a thing a person can
do unaided. ADR-0008 amends it — by hand it means renaming a UTC stamp under `%APPDATA%` and knowing
to quit from the Tray first, because close only hides. That is the one moment the app cannot afford to
be absent.

A restore is **two launches**. Choosing one *stages* it: the file is verified and copied beside the
database, and nothing is destroyed. The next launch swaps it in **before the pool opens** — a process
may not overwrite the file its own pool holds. So the honest end state of the button is "prepared",
never "done", and the screen says so.

The **file's presence is the record**, like the Backup folder is: no `restore_pending` column, because
a row and a file could disagree about whether a restore is owed.

Before the swap, the database being replaced is copied aside — as an **ordinary Backup**, under the
same naming, counting against the same seven. A second convention would be a second thing rotation
has to understand, and it has a better consequence this way: the safety copy is itself restorable, so
undoing a restore is the same act as making one. Without it a restore could only be run once
correctly.

The chosen file is **verified twice** — once when it is chosen, so the answer is immediate, and again
at launch before anything is overwritten, because a synced folder can rot overnight. A file whose
schema is *newer* than this build is refused: nothing migrates backward.

A restore **re-locks the app**. The Account row travels with the database, so the password that opens
the door afterwards is the one from the day that Backup was made — and the lock screen says so, rather
than leaving a person to discover it.

Whole file only. There is no partial restore: merging one Client's hours is a different feature with
different rules, and it does not belong behind the same button.

A staged restore that **fails** is announced across the top of every screen, and says the current
database was left alone. Opening on old data in silence would read as the restore having worked.

### Update

A newer TimeBuddy, published as a GitHub Release and offered to the copy that is running. Shipping is
a `git tag`; updating is one click. See ADR-0009.

The installer is **unsigned** — Windows says "unknown publisher" once, on the first install, and the
README says it will. Every **update** is signed with a minisign key and verified against the public
half compiled into the build: the app downloads and runs an installer from one URL without anyone
watching, so that URL cannot be trusted on its own.

The version number lives in four places — `package.json`, `Cargo.toml`, `tauri.conf.json`, the tag —
and only `tauri.conf.json`'s is the one the updater compares. They are **checked against each other**
rather than trusted: a tag pushed against an unbumped tree would offer an update that installs the
version already running, which is the failure that looks most like success.

**Checked once per launch**, like a Backup, and for the same reason: a scheduler in a program that is
closed at midnight would never fire. A check that **could not be made** is not announced — a laptop
with no network puts nothing at risk — it is read on the Settings screen, beside the version and the
button that asks again. This is the same split Backup draws between failed and merely stale.

An available update is offered **across the top of every screen**, as a status rather than an alarm:
nothing is wrong. It **can** be waved off, unlike a failed Backup, for the launch it was waved off in
and for that version only. A failed **install** is announced, with the offer still standing.

Installing restarts the app, and the offer says so before the button that does it. If a Pomodoro Block
is running, the next launch asks about it exactly as it would after any other death — the same
question, and not a special case.

### Theme

A named set of design tokens (`--color-surface`, `--color-ink`, `--color-accent`, …). Components
reference tokens, **never raw hex** — that is what makes user-authored themes a later addition
rather than a rewrite.

Shipped: **Walnut** (dark, default), **Sand** (light), **High-contrast**, plus an opt-in
"follow system".

Every shipped theme passes a WCAG AA contrast check on body text before it ships. A theme that
fails is not a matter of taste.

While "follow system" is on it is the **only** thing choosing, so the picker is disabled rather
than left showing a choice nothing acts on. The chosen theme is kept in the row regardless, so
turning "follow system" back off restores it.

### Account

The single local account. One password, hashed with Argon2; no `user_id` anywhere. See ADR-0003.

It is **a door, not a vault**: the database is deliberately unencrypted, and anyone with file
access can read it. What the door buys is that the app does not open straight into someone's
billing data on a laptop other people use.

Nothing is stored that can be read back. The password and the **recovery phrase** are both Argon2
hashes, and the phrase is normalised before hashing — case is folded and runs of whitespace are
collapsed, so a phrase written down one way still opens the door when typed back another. What
the words *are* is not forgiven. A password is never normalised; every character of one is
deliberate, spaces included.

The phrase is shown while it is being chosen — it has to be, to be written down — and masked
wherever it is typed back in.

The row's **absence** is what "never set up" means, which is what raises the first-run wizard.
There is no seeded row: a row with an empty hash would be an account with no password.

"Remember me for 30 days" is a random token, kept by the webview and stored here only as a hash,
with the deadline beside it — so the side holding the token is not the side deciding whether it
has expired. Unticking the box revokes what was there, and a password reset revokes it too: a
reset that left yesterday's session open would be one in name only.

### First run

Three steps — password and recovery phrase, backup folder, first Client and Project — and then an
app that already works. A fresh install must never show five empty screens.

Each step **commits as it is finished**, so a wizard abandoned halfway leaves an install set up as
far as it got, not one that has to be started over.

Which means the account row cannot be what says setup is *done* — it is written by step one. The
first **Client** is: Clients are archived and never deleted, so "none at all" can only mean step
three was never reached. An install with an account and no Clients unlocks and then resumes the
wizard, rather than landing on empty screens.

Until the door is open, the window frame says nothing about the work — no countdown on the
titlebar, no minutes in the tray tooltip. A block keeps running behind the lock screen; it just
does not announce itself to whoever is looking at the laptop.

### Settings

The single row every preference lives in — theme, "follow system", language, Pomodoro and Break
length, the chime and OS-notification toggles, autostart, and the backup folder. Created by the
migration, never absent, so reading it can never miss.

It is edited on one screen and **saved as a unit**. A partial update would only invite
half-applied states, so there is one Save and one `UPDATE`.

A blank backup folder is stored as **absent**, not as `""`, and absent means `backups` under the
app's own data directory — a path resolved at runtime rather than frozen into a row on whichever
machine ran the migration.

**Autostart is the one setting that does not live in the database.** Windows keeps its own copy in
the registry, and a person can change it from Task Manager without this app hearing about it. The
two are reconciled explicitly, and **this row wins**: Windows is written first on save — so a
refusal means nothing was saved anywhere — and the row is re-asserted onto Windows at every launch.
A change made from Task Manager therefore lasts until TimeBuddy next starts. That direction is the
choice: one of the two has to be authoritative, and it is the one the checkbox reads.

### Tray

The icon TimeBuddy leaves in the notification area. Its tooltip is the running block's
remaining time, in whole minutes.

**Close minimises here and the block keeps running**, so the tray menu is the only place the app
can be quit from: Show, Start/Stop timer, Quit. See ADR-0004.

Whether a close hides or closes is decided in **one place, in Rust** — every close arrives there,
the titlebar button and Alt+F4 alike, or the two would mean different things. The first hide
explains itself with a Windows notification, for the same reason: a window that vanishes in
silence reads as a crash.

If no tray icon can be created, close closes. A window hidden with nothing left behind is lost,
not minimised.

Its words come from the catalogues like every other string, so the frontend hands them to Rust
rather than Rust spelling them. Start/Stop is answered by the Timer screen, for the same reason
the Timer screen owns the arithmetic: what a stopped block is worth is decided once. It does not
pull the window back up — acting without the window is the point, and the menu's own label and
the tooltip are the answer.

## Deliberate non-goals (v1)

- **No invoicing.** Rates are stored, never used.
- **No multi-user.** No `user_id` anywhere. The lock screen guards one person's data on one machine.
- **No database encryption.** See ADR-0003.
- **No code signing.** The installer is unsigned; the updates are signed. See ADR-0009.
- **No time rounding rules.** Store truth.
- **No cross-platform.** Windows only.

## Language

UI is Dutch (`nl`, default) and English (`en`) via i18next. Code, identifiers, schema, and these
docs are English. No hardcoded UI strings, from the first commit.
