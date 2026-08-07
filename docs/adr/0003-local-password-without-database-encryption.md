# ADR-0003: A local password, but no database encryption

- **Status**: Accepted
- **Date**: 2026-08-07

## Context

The app should not open straight into her billing data — visitors and family use the same laptop.
That argues for a lock screen.

Encrypting the SQLite file (SQLCipher) was considered alongside it. It is cheap to add at the start
and painful to add later.

## Decision

A **single local account**: password hashed with Argon2, stored in SQLite, unlock screen at launch,
"remember me for 30 days".

The database is **not encrypted**. A forgotten password is recoverable: the unlock screen offers
"Wachtwoord vergeten?", which requires confirming a recovery phrase chosen during first-run setup,
then allows setting a new password.

## Consequences

- The threat model is stated honestly: this is a door, not a vault. Anyone with file access can
  read `timebuddy.db`.
- In exchange, no single forgotten string can destroy years of billing records. With SQLCipher the
  password *is* the key and loss is unrecoverable — a far larger risk than local snooping for a
  personal hours tracker.
- Recovery is implementable entirely offline, with no email, no server, no reset link.
- Schema stays single-tenant: **no `user_id` columns anywhere**. If real multi-user is ever needed,
  that is a deliberate migration made against real requirements, not speculative columns carried
  from day one.
- If the laptop's disk needs at-rest protection, that is BitLocker's job, not the app's.
