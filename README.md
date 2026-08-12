# TimeBuddy

A Windows desktop app for tracking hours spent on client work done from home. One person uses it, on
her own laptop, and everything is local: a Pomodoro timer, manual hours, clients and projects, weekly
and monthly reports, an Excel export, and a daily backup.

What each of those words means is written down in [CONTEXT.md](CONTEXT.md), and why it works the way it
does in [docs/adr](docs/adr).

## Installing it

1. Open the [latest release](https://github.com/TheSandhill/TimeBuddy/releases/latest).
2. Download `TimeBuddy_<version>_x64-setup.exe` and run it.
3. **Windows will say the publisher is unknown.** Click **More info**, then **Run anyway**.
4. TimeBuddy asks for a password and a recovery phrase, a backup folder, and a first client and
   project. After that it works.

### About that warning

TimeBuddy is not code-signed. A certificate costs money every year and buys exactly one thing here:
the absence of that prompt. So the prompt stays and this paragraph exists instead.

It happens **once**, on the first install. Windows SmartScreen shows it for any installer it has not
seen before from a publisher it cannot name — it is not a virus warning, and it is not a sign that
anything went wrong. Later updates do not show it, because by then TimeBuddy is an app Windows has
already been told to run.

What *is* checked, every time: updates are signed, and TimeBuddy refuses to install one whose signature
does not match the key built into it. See [ADR-0009](docs/adr/0009-unsigned-installer-signed-updates-from-github-releases.md).

## Updating it

TimeBuddy checks for a newer version each time it starts, and offers it in a bar across the top of the
window. **Update now** downloads it, installs it, and restarts the app; **Later** puts the bar away
until next time.

There is also a **Check for updates** button on the Settings screen, under *Updates*, next to the
version you are running. That is where you can also see that a check could not be made at all — on a
laptop with no network, TimeBuddy says nothing about it anywhere else.

If a Pomodoro block is running when the app restarts, the next start asks whether to keep the time that
had passed. Nothing is lost either way.

## Developing it

```sh
npm install
npm run tauri dev     # the app, with the frontend hot-reloading
npm run typecheck     # tsc --noEmit
npm test              # the frontend suite
cargo test --manifest-path src-tauri/Cargo.toml

npm run e2e:build     # a release build with a debugging port; minutes, not seconds
npm run test:e2e      # the real window, driven through Windows
```

The e2e suite is the one that can tell whether the window actually drags, closes and hides —
everything jsdom has no answer for. It needs a built binary, msedgedriver, and a desktop that is
logged in, so it is kept apart from `npm test` and runs as a CI job of its own. See
[e2e/README.md](e2e/README.md) and
[ADR-0012](docs/adr/0012-e2e-tests-drive-a-real-window-not-the-dom.md).

The frontend is React 19 + TypeScript + Vite; the backend is Rust. All SQL lives in Rust behind typed
commands ([ADR-0002](docs/adr/0002-sql-lives-in-rust.md)) and every UI string goes through i18next —
Dutch is the default, English is shipped, and a hardcoded string fails the suite.

## Releasing it

Shipping is a tag. Everything else is [the release
workflow](.github/workflows/release.yml)'s job.

```sh
# 1. Bump the version in all three files. They must agree, or the tests fail:
#      package.json          src-tauri/Cargo.toml          src-tauri/tauri.conf.json
# 2. Commit it.
git commit -am "Release 0.2.0"

# 3. Tag it with the same number, prefixed with v. The workflow checks this too.
git tag v0.2.0
git push origin main v0.2.0
```

The workflow builds the NSIS installer, signs the update, and publishes a GitHub Release with
`latest.json` beside it. Installed copies read that file from
`releases/latest/download/latest.json`, which is why the release is published rather than drafted: a
draft is invisible to that URL, so a drafted release would look like a successful ship and update
nobody.

### One-time setup

Two repository secrets, from a minisign keypair generated once with `npx tauri signer generate`:

| Secret | What it is |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | the contents of the private key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password, empty if it was generated without one |

The public half is already in `src-tauri/tauri.conf.json` as `plugins.updater.pubkey`. **Back the
private half up** — it is a single small file, and losing it means every installed copy stops being
updatable until it is replaced by hand.

The release assets also have to be readable **without credentials**: the updater cannot hold a token,
because a token compiled into a build is a token given away. On a private repository, release downloads
answer 404 to an anonymous request — which is why this repository is public. Making it private again
would silently stop every installed copy from updating, and nothing in the app would say so.
