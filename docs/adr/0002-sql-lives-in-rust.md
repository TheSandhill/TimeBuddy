# ADR-0002: SQL lives in Rust behind typed commands

- **Status**: Accepted
- **Date**: 2026-08-07

## Context

`tauri-plugin-sql` exposes a JS `Database.load()` API that lets the frontend execute SQL strings
directly. It is the fastest possible way to get data on screen.

The alternative is `#[tauri::command]` functions in Rust over `sqlx`, with the frontend calling
typed commands and never seeing SQL.

## Decision

**All SQL lives in Rust**, reachable only through typed commands (`list_projects`,
`create_time_entry`, `report_by_project`, …). The frontend never writes a query.

`tauri-plugin-sql` is still used — but only for its migration runner.

## Consequences

- Every invariant has exactly one home. Duration validation, the at-most-one-running-timer rule,
  archive-instead-of-delete, and report aggregation cannot be bypassed by a component that
  assembles its own query.
- Aggregation happens in SQL, in one place, and gets unit-tested against in-memory SQLite. Report
  arithmetic is the part of this app where a silent bug costs real money.
- The frontend gets generated-ish types at the command boundary instead of `any[]` rows.
- Cost: roughly 30 lines of Rust per entity, and a round trip through `invoke` for every read.
  At this data volume that is free.
- Anything the UI needs must be added as a command. That friction is intentional — it keeps the
  data layer a designed surface rather than an open connection.
