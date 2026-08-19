# TimeBuddy — Context

A single-user Windows desktop app for tracking hours spent on client work done from home.
One person uses it: the owner of the laptop it runs on. Everything is local.

## Ubiquitous language

### Client

A person or organisation the work is done for. Has a name and optional contact notes.

A Client is **never deleted** — only archived. Once hours exist against a Client's Projects,
deleting it would silently rewrite history. Archiving hides it from pickers and keeps it in reports.

On screen, Clients are an **exclusive accordion**: one row per Client, and opening one closes the
last. Its Projects live inside it. This replaces a master list beside a detail pane, which asked a
420px-wide window to hold two columns and got two unreadable ones — names truncated and the actions
on every row spent what was left. Containment says what the pane was there to say, so the layout is
now the sentence "a Project only means anything under a Client" rather than a caption under it.

**Nothing is open on arrival**, and which row was open is forgotten on the way out. The screen's
first answer is the list of names, and a Client picked for you is a claim the screen has no way to
make honestly.

### Project

A named piece of work belonging to exactly one Client. Carries an optional `hourly_rate` that
nothing reads yet — it exists so billing can be added without a migration.

Like Client, a Project is **archived, never deleted**. Archiving a Client also takes its Projects
out of the pickers without touching their own `archived_at` — the work is unofferable because the
Client is gone, so restoring the Client is what brings them back. See ADR-0005.

A Project under an archived Client therefore wears **no badge of its own**. It used to: with the two
lists side by side there was nothing on a Project's row to say why it was out of the pickers, so each
one carried the reason. Inside the accordion the Client's own row is directly above it wearing
ARCHIVED, and repeating that on every child is the same wall of small grey capitals the redesign
exists to remove. The containment is the explanation.

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

It can also be **held**. Pausing stops the countdown without ending the block, for the interruption
that is neither work nor a reason to throw the block away. A held block is the one exception to
"ends on its own": it waits indefinitely, so the pill and the tray tooltip say *paused* rather than
showing a clock that has stopped — a still countdown is the one thing here that reads as a crash.
Held time is never work, and never logged. See ADR-0011.

Its length is offered as four **presets** on the Timer screen — 15, 25, 45, 60 — because "a
quarter of an hour, now" should not be a trip to Settings. Picking one saves it as the block length
from then on; there is no one-off override. A fixed four, not an editable set: an editable one would
need somewhere of its own to live, and being quicker than the screen that already exists is the whole
reason these are here.

A block's length is **frozen when it starts**. Raising the default — from either screen — must never
move the finish line of a block already under way, so the presets go dead while one is running rather
than change something the user cannot see. Dead **and saying nothing**: the rule here used to be that
a control which stops answering has to explain itself, and on this screen it earns nothing — the dial
directly above the four is visibly counting down, which is the explanation, and a sentence under them
was one more grey line on a screen whose whole redesign was subtraction. The rule still holds wherever
a dead control has no such neighbour.

The Timer screen carries five things — the dial, the presets, the Break banner, the Project picker and
today's entries — and the **dial owns it**. Flat, they read as a settings page with a large circle on
it. So the dial and its Mug take the top of the screen and everything else is visibly secondary: the
presets are the second thing touched, not the second thing seen.

A completed block logs its full length. A block stopped early logs the **actual elapsed time**,
never the nominal length.

Stopping one by hand is **deferred five seconds**, not undone afterwards: the block is presented as
stopped and the row is left alone until the window closes, so taking it back costs nothing and needs
no second write to succeed. What it is worth is fixed the moment Stop is pressed — those five seconds
are the app hesitating, not work. A block that ran less than a whole minute skips the window
entirely: nothing is written for it either way, so there is nothing to offer back.

A Pomodoro Block is not a separate entity. When it ends, it becomes a TimeEntry with
`source = 'timer'`.

### Break

The countdown between blocks. A Break is **never stored** — it produces a chime and a countdown,
nothing else. Breaks are not work, so they are not hours.

It belongs to the app rather than to a screen, like the Pomodoro Block it follows: walking off to
another screen does not end one, and its chime still sounds wherever the user is. Never stored is
about the database, not about how long it lives — a Break dies with the process, and a crash takes it
with it. Only the **banner** is the Timer screen's, because the banner carries Skip and a control
that acts on the timer belongs on the timer's screen.

### Running Timer

The at-most-one in-flight Pomodoro Block. Its start instant is persisted, and elapsed time is
derived from wall clock — not from a counting interval — so laptop sleep is a non-event.

A pause is stored too, as the instant the current one began plus the total of those already finished.
The **start instant is never moved** to account for one: it is what the logged entry reports as the
moment work began, and that has to stay true. So a held block's entry spans longer than it lasted —
`09:00–09:45` for 25 minutes — and that is honest rather than a rounding error. Durations are what
reports add up; the window only describes.

Asking twice is harmless in both directions. Pausing a held block does nothing at all, because
rewriting the instant would move what elapsed is measured to and hand the block minutes nobody
worked.

If the app dies with a Running Timer present, the next launch **asks** whether to keep the elapsed
time. Silently discarding loses real work; silently logging invents it.

Its lifecycle belongs to the app and not to a screen — what a stopped block is worth, when one ends,
and what follows it are decided in one place that no navigation can unmount. See ADR-0010.

### Orphaned Block

A Running Timer row that **the running process did not create**: the block a death left behind, and
the only thing the recovery question is ever asked about.

Worth its own word because two definitions of it once coexisted — "not started by this process" and
"not started by this screen" — and the second one offered to throw away work that was still being
done.

What it is worth is **frozen at the instant it was found**, so the question cannot answer itself while
it waits. The answer is keep or discard; there is no third answer that resumes it, because resuming
would mean vouching for minutes nobody watched.

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

A Theme covers **colour, shape, type and Motion**. A duration written into a component is the same
defect as a hex written into one, and if motion lived outside the Theme then two documents would answer
the question "what is a theme made of". So the radii, the font family, the durations, the easings and
the two looping animations are all token sets a Theme carries, and a Theme is allowed to vary any of
them — High-contrast turns the motion down, which is the concrete reason this had to be one decision
rather than two.

Two colour tokens exist to *remove* lines rather than draw them: a **soft raised fill** groups content
where a border would otherwise outline it, and a **hairline** is what a line becomes where one is
genuinely unavoidable. A hard border survives only where a line carries meaning — a failure, or the
frame of the window. The treatments that use them are the app's **control vocabulary**: one file of
buttons and one of fields, labels and quiet headings, which every screen imports and no screen
re-decides (ADR-0004). Labels are sentence case; the wall of tracked capitals is gone.

A Theme may also change an asset's **fidelity and not only its hue**, which is why a themed asset is
a token set rather than a file: High-contrast wants an outline where Walnut wants something soft, and
recolouring a soft thing to yellow would honour the token while breaking the promise. Nothing
exercises that yet — see [Mug](#mug).

Shipped: **Walnut** (dark, default), **Sand** (light), **High-contrast**, plus an opt-in
"follow system".

Every shipped theme passes a WCAG AA contrast check on body text before it ships. A theme that
fails is not a matter of taste.

While "follow system" is on it is the **only** thing choosing, so the picker is disabled rather
than left showing a choice nothing acts on. The chosen theme is kept in the row regardless, so
turning "follow system" back off restores it.

### Tab bar

How the five screens are reached: a **floating pill**, bottom centre, with the content scrolling
underneath it. Bottom rather than top because the top of the window is already spoken for — the
titlebar, and the three banners a failed backup, a failed restore or an offered update put across
every screen. A bar floating up there would collide with all three.

Its order is fixed — Timer, Entries, Clients, Reports, Settings — and that order is what gives a route
change a direction.

Only the **active tab wears its label**; the rest are their icons. The pill widens to fit the label
and its neighbours slide aside, so the one animation the bar has is driven by which screen is open
rather than added on top of it. It also settles the language: "Tijdregistratie" and "Instellingen"
never have to fit beside each other, because only one label is ever on screen.

### Motion

How the app moves between one state and the next. Part of the Theme, for the reason above.

Five **durations**, and a sixth is a sign one of these should have been reused: `quick` for hover,
colour and focus; `base` for disclosure — the accordion, a form opening, the tab indicator; `bounce`
for anything on an overshoot curve; `page` for a route change; `deliberate` for the one animation
allowed to be slow enough to notice, the Mug pouring out when a block is stopped by hand.

`bounce` is a tier of its own rather than a use of `base` because an overshoot inside 220ms has no
room for its return leg and reads as a glitch rather than as spring.

Five **easings** — soft out for arrivals, quick in for departures, soft in-out for the breath, and
two overshoots: soft for a panel, snappier for a control. A route change also carries a **travel**,
the short distance it moves along the tab bar's order; it is a length rather than a duration, but it
is turned down by the same hands.

The **spring is not a token**. The floating tab bar's active pill widens to fit its label and its
neighbours slide aside, and that is a spring, which is not a cubic-bézier and cannot be a CSS
variable. It is one config in TypeScript, imported wherever it is needed. A token only one library can
read would be a token in name.

**Three motion systems, named as three**: CSS for state transitions, the motion library for anything
that has to outlive its condition, and the platform's own view transitions for a route change. The
third was the last to arrive and had to earn its place by *removing* code — see ADR-0015, which also
records why form disclosures did not follow the route change onto it.

**Transient UI arrives and leaves.** The undo toast and the three banners across the top — a failed
Backup, a failed staged Restore, an offered Update — animate on the way out as well as in, which is
the thing plain CSS cannot do: an element that animates as it goes has to outlive the condition that
raised it. That is what the motion library is for, and those four are its first consumers. Banners
open and close on their height, the toast on an overshoot, because five seconds is not long to be
noticed in.

A **departure never delays what it describes.** The delete still commits on its own schedule and the
undo window is still five seconds; the element is only seeing itself out. Nothing waits for it — and
what is leaving is a *picture* of itself: out of the accessibility tree and out of reach the moment
it starts to go, because the condition is already over. Undo pressed on a toast that has run out
would do nothing, and a control that quietly does nothing is worse than one that is plainly gone.

The library **reads the tokens at runtime** rather than restating them in TypeScript — a transition
in JavaScript wants seconds and four control points, and `var(--motion-base)` means nothing to it.
Restating them would give High-contrast and reduced motion a second place to be turned down, and a
second place to be forgotten. So there is no reduced-motion branch in any component: the cascade has
already answered by the time the value is read.

Two **loops**, and only two: the Mug's steam, and the dial ring's breath. They run at deliberately
different periods — two things breathing in step read as machinery. The breath is slow, near four and
a half seconds, because a heartbeat cadence means urgency and this is a tool for twenty-five
uninterrupted minutes.

**Nothing is on the titlebar.** The countdown pill is on every screen, so an animation there would be
in the corner of the eye permanently and become the thing the app is remembered for.

**No state is ever signalled by motion alone.** This is the rule that makes the rest safe. Reduced
motion — the operating system's, or High-contrast's own token values — sets the loops to `none` and
collapses the durations to a millisecond, and *nothing is lost*, because the digits, the Mug's coffee
level and the word *paused* each say it without moving. The loops go to `none` rather than to a
millisecond: a breath that fast is a flicker, which is worse than stillness. Enforced by a test, the
way the string catalogues are — a rule about what may not appear in a component is worth exactly what
it costs to break it.

Route changes move **along the tab bar's order**: leftward for a leftward tab, a short distance
rather than a full page turn, because a screen crossed five times a minute should not feel crossed. A
navigation nobody walked — the tray's Start/Stop pulling the Timer up — gets the neutral crossfade
instead. It has no direction, so it is not given one.

That direction is decided **once, on the router**, and spent entirely in CSS: it travels to the
stylesheet as a view-transition *type*, and the screen leans by the sign it puts on
`--motion-page-travel`. Only the screen is snapshotted — the titlebar, the banners and the floating
tab bar are never frozen into it, which matters most for the tab bar, whose indicator is a spring still
in flight while the screen underneath it slides. They are not *above* it either: a snapshot is painted
in the top layer and the page cannot reach over it, so the screen is clipped back to its own box on the
way past.

### Mug

The app's intended face: a smiling coffee mug. **Deferred, not abandoned** — three prototype attempts
at drawing one as hand-authored SVG were all rejected, the last because the mouth ellipse was nearly
as wide as the body and the thing read as a bowl of coffee with a face on it. Getting a mark that
carries the app's name needs a different method than an agent drawing paths blind, so nothing about it
is settled and the app currently ships no mark at all.

What survives the deferral, because it was never really about the mug:

- The **titlebar's left cell** is the wordmark alone. A mark joins it when there is one worth having.
- The **dial's centre** is the digits, and whatever goes under them must never grow enough to compete
  with them. That was the rule that killed the largest of the prototype variants.
- A **held** block is currently the word *paused* in the pill and the tray tooltip, plus a flat muted
  ring. That is enough, and the word is not motion — but it is two signals where there were five, so
  there is no spare. Whatever replaces the mug should carry one.
- The **tray icon is fixed** whatever it becomes. A live one would mean redrawing and re-registering a
  bitmap on a timer, for sixteen pixels, and the tooltip already carries the minutes.

The idea worth keeping from the attempts: the mug's **coffee level** as a static state indicator —
static being the point, since a level survives reduced motion where a movement does not. It was never
a gauge, only something a glance gets, and the ring and the digits carried the truth throughout.

The tagline — *good time, great work* — appears **once**, on the first step of the first-run wizard.
That is the only moment the app is introducing itself; anywhere else it is a slogan in the way.

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

It is **saved as a unit**. A partial update would only invite half-applied states, so there is one
`UPDATE` and the whole row goes back with it.

The Settings screen is where it is *edited*, but not the only screen that writes it: the Timer's
duration presets save `pomodoro_minutes` the same way, by sending the whole row with that one field
different. Which is the point — a preset is not a second place a block length can live, so the dial
and the number on the Settings screen cannot come to disagree.

The screen holds twelve controls, so it is read in **four named groups** rather than as one scroll:
*Appearance* (theme, follow system, language), *Timer* (block and break length, chime, OS
notifications), *System* (autostart), and *Data and version* (backup folder, staleness, Restore,
version, the button that checks again). The split is not tidiness — the last group is the only one
whose contents can **fail**, and everything else on the screen is a preference that cannot.

**Restore is set apart inside its group**, bordered and stated plainly. It is the only control here
that replaces the database, re-locks the app and needs a relaunch, and giving it the same weight as a
language dropdown would be lying about that.

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
can be quit from: Show, Start/Stop timer, Pause/Resume timer, Quit. See ADR-0004.

Pause is an item of its own rather than being folded into the first one the way the dial folds it
into its big button. A menu has no sizes to say which act is the consequential one, so what it has
instead is one line per act: Stop always says Stop, and the item beside it says either Pause or
Resume. It is **greyed while there is nothing it may hold**, not removed — Quit staying where it was
last time is worth more than a menu with no dead lines in it, and an item that answers a click by
doing nothing reads as a bug. An Orphaned Block counts as nothing it may hold: the tooltip still
counts that block down, but holding one would be a third answer to a question with two.

Whether a close hides or closes is decided in **one place, in Rust** — every close arrives there,
the titlebar button and Alt+F4 alike, or the two would mean different things. The first hide
explains itself with a Windows notification, for the same reason: a window that vanishes in
silence reads as a crash.

If no tray icon can be created, close closes. A window hidden with nothing left behind is lost,
not minimised.

Its words come from the catalogues like every other string, so the frontend hands them to Rust
rather than Rust spelling them. Both items are answered wherever the Running Timer's lifecycle lives,
which is above every screen (ADR-0010) — so the menu works whatever is open, and what a stopped block
is worth is still decided once. Neither pulls the window back up — acting without the window is
the point, and the menu's own label and the tooltip are the answer. Start/Stop still brings the Timer
screen up behind the scenes, because a stop puts its undo there; **Pause brings up nothing at all**,
having nothing to show.

It never answers the Orphaned Block question. That is a question, and a menu item must not answer it
on the user's behalf in either direction.

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
