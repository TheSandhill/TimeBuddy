# ADR-0001: Tauri 2 desktop app with a local SQLite database

- **Status**: Accepted
- **Date**: 2026-08-07
- **Expanded by**: ADR-0009 — the distribution bullet, in full: what is signed, what is not, and why
  shipping is a `git tag`. Everything here stands.

## Context

TimeBuddy is used by one non-technical person on her own Windows laptop to track billable hours.
There is no server, no second user, and no requirement for remote access.

The candidate shapes were: a local web app started from a terminal, a hosted web app, or a native
desktop application.

## Decision

Build a **Tauri 2** desktop application with a React 19 + TypeScript + Vite frontend and a
**local SQLite** database stored in the app data directory.

Schema is managed by `tauri-plugin-sql`'s migration runner (`Migration` / `MigrationKind::Up`,
registered in the Rust builder).

## Consequences

- She double-clicks an icon. No terminal, no `npm run dev`, no browser tab that must stay open.
- The app can own a tray icon, OS notifications, autostart and a running timer that survives a
  closed window — none of which a browser tab can do well.
- Data is a single file, which makes backups trivial (ADR sibling: automatic daily copies) and
  loss total if unbacked-up. Hence backups being in v1 rather than "later".
- Distribution needs a real installer and an update path: NSIS installer, unsigned, with Tauri's
  updater pointed at GitHub Releases. Unsigned means a one-time Windows SmartScreen warning —
  accepted rather than paying for a code signing certificate for an audience of one.
- The frontend is ordinary web tech, so nothing here blocks a future web version if the
  requirements ever change.
