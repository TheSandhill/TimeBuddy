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

Like Client, a Project is **archived, never deleted**.

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

### Theme

A named set of design tokens (`--color-surface`, `--color-ink`, `--color-accent`, …). Components
reference tokens, **never raw hex** — that is what makes user-authored themes a later addition
rather than a rewrite.

Shipped: **Walnut** (dark, default), **Sand** (light), **High-contrast**, plus an opt-in
"follow system".

## Deliberate non-goals (v1)

- **No invoicing.** Rates are stored, never used.
- **No multi-user.** No `user_id` anywhere. The lock screen guards one person's data on one machine.
- **No database encryption.** See ADR-0003.
- **No time rounding rules.** Store truth.
- **No cross-platform.** Windows only.

## Language

UI is Dutch (`nl`, default) and English (`en`) via i18next. Code, identifiers, schema, and these
docs are English. No hardcoded UI strings, from the first commit.
