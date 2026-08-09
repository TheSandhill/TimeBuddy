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
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

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
