//! The connection pool the command layer reads and writes through.
//!
//! `tauri-plugin-sql` owns migrating the file (ADR-0002); this pool owns every
//! query. Both point at the same SQLite file.

use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

/// Managed Tauri state. A newtype so `State<'_, Db>` reads as intent rather
/// than as "some pool that happens to be in scope".
pub struct Db(pub SqlitePool);

/// Foreign keys are off by default in SQLite and are enabled per connection,
/// not per database — so it has to happen in the pool options.
fn options(path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
}

/// Opens the application pool. The file is expected to already exist and be
/// migrated by the plugin; `create_if_missing` only covers a first launch race.
pub async fn connect(path: &Path) -> Result<SqlitePool, sqlx::Error> {
    SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options(path))
        .await
}

/// A migrated, empty, in-memory database for tests.
///
/// Capped at one connection: `sqlite::memory:` gives every *connection* its own
/// database, so a larger pool would hand out empty ones. Idle reaping is
/// disabled for the same reason — a closed connection is a dropped schema.
#[cfg(test)]
pub async fn test_pool() -> SqlitePool {
    use crate::schema::migrations;
    use std::str::FromStr;

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(
            SqliteConnectOptions::from_str("sqlite::memory:")
                .expect("valid in-memory url")
                .foreign_keys(true),
        )
        .await
        .expect("in-memory sqlite");

    // Every shipped migration, in order — so a table added in migration 2 is
    // as real to the tests as one added in migration 1.
    for migration in migrations() {
        let version = migration.version;
        sqlx::raw_sql(migration.sql)
            .execute(&pool)
            .await
            .unwrap_or_else(|error| panic!("migration {version} applies: {error}"));
    }

    pool
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_pool_applies_the_shipped_schema() {
        let pool = test_pool().await;

        let tables: Vec<(String,)> =
            sqlx::query_as("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .unwrap();
        let names: Vec<&str> = tables.iter().map(|(n,)| n.as_str()).collect();

        assert!(names.contains(&"clients"));
        assert!(names.contains(&"projects"));
        assert!(names.contains(&"time_entries"));
        assert!(names.contains(&"settings"));
        assert!(names.contains(&"running_timer"));
    }

    #[tokio::test]
    async fn foreign_keys_are_enforced() {
        let pool = test_pool().await;

        let orphan = sqlx::query(
            "INSERT INTO projects (client_id, name, created_at, updated_at)
             VALUES (999, 'orphan', '', '')",
        )
        .execute(&pool)
        .await;

        assert!(orphan.is_err(), "a project may not outlive its client");
    }

    #[tokio::test]
    async fn settings_holds_exactly_one_row() {
        let pool = test_pool().await;

        let second = sqlx::query(
            "INSERT INTO settings (id, theme, follow_system, language, pomodoro_minutes, break_minutes, updated_at)
             VALUES (2, 'sand', 0, 'en', 25, 5, '')",
        )
        .execute(&pool)
        .await;

        assert!(second.is_err(), "settings is a single-row table");
    }
}
