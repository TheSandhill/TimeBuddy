# ADR-0009: An unsigned installer, signed updates, and `git tag` as the ship

- **Status**: Accepted
- **Date**: 2026-08-11
- **Expands**: ADR-0001, which chose NSIS + GitHub Releases in a single bullet

## Context

ADR-0001 settled the shape of distribution in one line: NSIS installer, unsigned, Tauri's updater
pointed at GitHub Releases. That line hides three separate decisions and one problem, and the problem
is the reason this ADR exists.

The audience is one non-technical person on her own laptop. She will not read release notes, will not
visit a downloads page, and cannot be talked through a build. Whatever the update path is, it has to
be a thing that appears in front of her and is finished by one click.

The developer is one person too, working in short evenings. Whatever the release path is, it has to be
something that cannot be half-done — a checklist with four manual steps is a checklist that gets three
of them.

## Decision

### The installer is not code-signed, and the update is

An Authenticode certificate costs money every year and buys one thing here: the absence of a
SmartScreen prompt on first install. For an audience of one that prompt is a sentence in a README,
answered once, ever. It is not worth an annual invoice.

But "unsigned" cannot extend to the updates. Every build carries **one public URL** and downloads an
installer from it and runs it. Unverified, that URL is a way to install anything at all on her laptop
to anyone who can answer for it — a hijacked account, a stale DNS answer on a café network, a typo in
a config that points somewhere else.

So the two signatures are separated. The installer she runs by hand is **unsigned**, and Windows says
so once. Every update the app installs on its own is signed with a **minisign** keypair whose public
half is compiled into the build; an artifact whose signature does not verify against it is refused
before it is executed. The private half exists in exactly two places: the developer's
`%USERPROFILE%\.tauri\` and the repository's Actions secrets.

This is the right way round. The prompt is on the install a human is watching, and the verification is
on the install nobody is watching.

### Shipping is `git tag`, and the tag is the version

A push of `v*` builds the installer, signs the update, and publishes a GitHub Release with
`latest.json` beside it. There is no manual step, so there is no manual step to forget.

That makes the version number live in **four** places: `package.json`, `Cargo.toml`,
`tauri.conf.json`, and the tag. Only the third is the one the updater compares. A tag pushed against a
tree whose `tauri.conf.json` was not bumped publishes an update that installs the version already
running — the failure that looks most like success, and the one hardest to diagnose from the outside.

So the numbers are checked rather than trusted: a Rust test fails when the three files disagree, and
the workflow's first step fails when the tag disagrees with them.

### The release is published, never drafted

Every installed copy reads `releases/latest/download/latest.json`, and that URL does not see drafts. A
drafted release would be a green build, a tag, an installer on GitHub — and not one laptop updated.
So `releaseDraft` is off, and a bad release is fixed by tagging a better one rather than by editing a
draft.

### The check happens once per launch, and the offer can be waved off

The same reasoning as the daily backup (ADR-0007): a scheduler in a program that spends the night
switched off never fires, so the launch is the schedule. The check is mounted behind the lock screen,
because that is where its answer has somewhere to appear, and it does not retry — the one thing that
fixes a check that could not be made is a network that came back, and nothing in the app can tell
when that happened.

The **offer** is a bar across the top of every screen, like a failed backup and unlike it in two ways:

- It is a `status`, not an `alert`. Nothing is wrong. Dressing an offer as an alarm is how alarms stop
  being read.
- It **can** be dismissed, for one launch, keyed on the version it was said "later" to. The backup
  warning cannot be, because that one is about losing a year of work; this one is about a version
  number, and an offer that could not be got rid of would just be furniture. One launch is the honest
  lifetime: a dismissal kept on disk would be a preference nobody chose and would have to be found
  again to undo.

A **failed check** is not announced at all. It is read on the Settings screen, next to the version
number and the button that asks again — the same split ADR-0007 drew between a backup that failed
(announced) and a folder that is merely stale (read). Nothing is at risk, and there is nothing to do
about it from wherever she happens to be standing.

A **failed install** is announced, on the bar, with the offer still standing: she pressed a button and
is still looking at the old version.

### Installing restarts the app, and says so first

`installMode: passive` shows a progress window and asks nothing. Afterwards the app relaunches itself
— through `process:allow-restart`, which exits the process rather than closing the window, because
closing the window hides it (ADR-0004).

The bar says the restart is coming before the button that causes it, for the same reason the first
hide-to-tray explains itself: a window that vanishes and comes back unannounced reads as a crash.

If a Pomodoro Block is running when this happens, the next launch asks whether to keep the elapsed
time, exactly as it does after any other death. That is not special-cased. The question is the right
one, the answer is not lost either way, and a rule like "no updating while the timer runs" would be a
second thing that can be wrong.

## Consequences

- **The release assets must be publicly readable, and the repository is currently private.** The
  updater fetches `latest.json` and the installer with no credentials — it cannot have any, because a
  token compiled into a build is a token given away. A private repository's release assets answer 404
  to an anonymous request, so the update path does not work until either the repository is public or
  releases are published somewhere that is. This is the one part of the feature that cannot be settled
  in code, and nothing about the app has to change when it is settled.
- She sees the "unknown publisher" prompt on the first install, and never again — updates are
  installed by an app that is already trusted to run. It is written down in the README, and the
  Settings screen warns about it before it appears.
- Losing the private key means updates stop working for every installed copy. The public half is
  compiled in, so a new key means a new build, which can only be installed by hand. It is a single
  file worth backing up like a password.
- The updater adds `reqwest` and a TLS stack to the binary. For a local-only app that is a real
  increase in surface for one URL's worth of function — accepted, because the alternative is an app
  that can never be fixed after it is installed.
- Two versions of the app can be running the check at once on a laptop that was left open across a
  release. Nothing coordinates them, and nothing needs to: the loser installs an update it already
  has, and the plugin compares versions before downloading anything.
- Rolling *back* is not a feature. Downgrading is installing an older release by hand, and the data
  side of going backwards is already answered by Restore (ADR-0008).
