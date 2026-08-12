//! Schema history.
//!
//! Every table arrives as a numbered `MigrationKind::Up` entry, never edited in
//! place (ADR-0001). The same SQL text is what the unit tests run against
//! in-memory SQLite, so tests can never drift from what ships.

use tauri_plugin_sql::{Migration, MigrationKind};

/// Migration 1 — clients, projects, time entries, settings.
///
/// No `user_id` columns anywhere (ADR-0003): this app has exactly one user and
/// a column nobody fills is a column somebody eventually trusts.
pub const V1_INITIAL_SCHEMA: &str = r#"
CREATE TABLE clients (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    notes       TEXT,
    archived_at TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE projects (
    id          INTEGER PRIMARY KEY,
    client_id   INTEGER NOT NULL REFERENCES clients(id),
    name        TEXT NOT NULL,
    hourly_rate REAL,
    archived_at TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX projects_client_id ON projects(client_id);

CREATE TABLE time_entries (
    id               INTEGER PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects(id),
    date             TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    start_at         TEXT,
    end_at           TEXT,
    note             TEXT,
    source           TEXT NOT NULL CHECK (source IN ('manual', 'timer')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

CREATE INDEX time_entries_date ON time_entries(date);
CREATE INDEX time_entries_project_id ON time_entries(project_id);

CREATE TABLE settings (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    theme             TEXT NOT NULL,
    follow_system     INTEGER NOT NULL,
    language          TEXT NOT NULL,
    pomodoro_minutes  INTEGER NOT NULL CHECK (pomodoro_minutes > 0),
    break_minutes     INTEGER NOT NULL CHECK (break_minutes > 0),
    updated_at        TEXT NOT NULL
);

INSERT INTO settings (id, theme, follow_system, language, pomodoro_minutes, break_minutes, updated_at)
VALUES (1, 'walnut', 0, 'nl', 25, 5, '1970-01-01T00:00:00Z');
"#;

/// Migration 2 — the Running Timer.
///
/// `CHECK (id = 1)` makes "at most one in-flight Pomodoro Block" a fact the
/// database enforces rather than a rule the UI is trusted to remember.
///
/// Only the start instant is stored. Elapsed time is derived from the wall
/// clock, so there is nothing here to keep up to date while a block runs — and
/// nothing to be stale after a crash.
pub const V2_RUNNING_TIMER: &str = r#"
CREATE TABLE running_timer (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    project_id      INTEGER NOT NULL REFERENCES projects(id),
    start_at        TEXT NOT NULL,
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0)
);
"#;

/// Migration 3 — the rest of what the Settings screen edits.
///
/// Added rather than folded into migration 1, which has already shipped
/// (ADR-0001). Every column carries a default, so the row seeded by migration 1
/// is complete the moment this runs and `get` still cannot miss.
///
/// The defaults are the answers a first-time user would want: the chime and the
/// notification are the point of a Pomodoro timer, and an app that adds itself
/// to Windows startup without being asked is a nuisance.
///
/// `backup_folder` is nullable, and NULL means "wherever the app keeps its
/// data" — a default path resolved at runtime, not a string frozen into the
/// schema on the machine that happened to run the migration.
pub const V3_SETTINGS_PREFERENCES: &str = r#"
ALTER TABLE settings ADD COLUMN chime_enabled         INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN autostart             INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN backup_folder         TEXT;
"#;

/// Migration 4 — the single local account.
///
/// `CHECK (id = 1)` again: there is one user, and ADR-0003 keeps it that way —
/// no `user_id` columns, no second row for one to point at.
///
/// The row is **not** seeded. Its absence is what "this install has never been
/// set up" means, and it is the only thing the first-run wizard is triggered
/// by. A seeded row with an empty hash would be an account with no password.
///
/// Both hashes are Argon2 PHC strings, salt included. Neither the password nor
/// the recovery phrase is stored, and neither can be read back out — the door
/// is checked by hashing what was typed and comparing (ADR-0003).
///
/// `remembered_token_hash` is "remember me for 30 days": a random token lives
/// in the webview, its hash lives here, and `remembered_until` is when it stops
/// being accepted. Hashed like the rest, so a stolen database file is not a
/// stolen session — though the same file is readable anyway, which is the
/// trade ADR-0003 makes out loud.
pub const V4_ACCOUNT: &str = r#"
CREATE TABLE account (
    id                    INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash         TEXT NOT NULL,
    recovery_phrase_hash  TEXT NOT NULL,
    remembered_token_hash TEXT,
    remembered_until      TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
"#;

/// Migration 5 — pausing a Pomodoro Block.
///
/// Two columns rather than one, and deliberately not the cheaper trick of
/// shifting `start_at` forward on resume. The logged TimeEntry takes its
/// `start_at` from this row, and that column exists because it is *true*:
/// shifting it would report that the work began later than it did.
///
/// So elapsed becomes `(paused_at ?? now) - start_at - paused_seconds`, which is
/// still two wall-clock readings and a stored total. Nothing ticks, and a laptop
/// that slept through a pause is still a non-event.
///
/// `paused_at` is null while running, which is the normal state. `paused_seconds`
/// defaults to zero, so every row migration 2 left behind is already complete
/// and `get` still cannot miss (ADR-0011).
pub const V5_PAUSE_RUNNING_TIMER: &str = r#"
ALTER TABLE running_timer ADD COLUMN paused_at TEXT;
ALTER TABLE running_timer ADD COLUMN paused_seconds INTEGER NOT NULL DEFAULT 0
    CHECK (paused_seconds >= 0);
"#;

/// Every migration, in application order.
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: V1_INITIAL_SCHEMA,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "running timer",
            sql: V2_RUNNING_TIMER,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "settings preferences",
            sql: V3_SETTINGS_PREFERENCES,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "account",
            sql: V4_ACCOUNT,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "pause running timer",
            sql: V5_PAUSE_RUNNING_TIMER,
            kind: MigrationKind::Up,
        },
    ]
}

/// The highest migration this build knows how to apply.
///
/// A restore candidate stamped higher than this comes from a later version of
/// TimeBuddy, and is refused: the plugin migrates forward, never back, so a
/// database from the future would be opened by code that does not know its
/// columns (ADR-0008).
pub fn latest_version() -> i64 {
    migrations()
        .iter()
        .map(|migration| migration.version)
        .max()
        .expect("there is at least one migration")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_latest_version_is_the_highest_migration_there_is() {
        assert_eq!(latest_version(), migrations().len() as i64);
    }

    #[test]
    fn migrations_are_versioned_upwards_without_gaps_or_repeats() {
        let mut versions: Vec<i64> = migrations().iter().map(|m| m.version).collect();
        let count = versions.len();
        versions.sort_unstable();
        versions.dedup();

        assert_eq!(versions.len(), count, "duplicate migration version");
        for (index, version) in versions.iter().enumerate() {
            assert_eq!(
                *version,
                index as i64 + 1,
                "migration versions must start at 1 and be contiguous"
            );
        }
        assert!(migrations()
            .iter()
            .all(|m| matches!(m.kind, MigrationKind::Up)));
    }
}
