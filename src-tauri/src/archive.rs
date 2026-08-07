//! Archive-instead-of-delete, shared by clients and projects.
//!
//! Both entities have the identical `archived_at` column and the identical
//! rule, so the rule lives once. Table and entity names are `&'static str`
//! supplied by the calling module, never by a caller from outside Rust.

use chrono::{DateTime, Utc};
use sqlx::SqlitePool;

use crate::error::{Error, Result};

/// Sets or clears `archived_at`.
///
/// Archiving is idempotent and keeps the *first* instant: it records when work
/// on the thing stopped, not when the button was last pressed. Restoring clears
/// the column outright.
pub async fn set_archived(
    pool: &SqlitePool,
    table: &'static str,
    entity: &'static str,
    id: i64,
    archived_at: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Result<()> {
    let affected = match archived_at {
        Some(instant) => {
            sqlx::query(&format!(
                "UPDATE {table} SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?"
            ))
            .bind(instant)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?
            .rows_affected()
        }
        None => {
            sqlx::query(&format!(
                "UPDATE {table} SET archived_at = NULL, updated_at = ? WHERE id = ?"
            ))
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?
            .rows_affected()
        }
    };

    if affected == 0 {
        return Err(Error::not_found(entity, id));
    }
    Ok(())
}
