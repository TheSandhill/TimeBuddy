//! The Running Timer — the at-most-one in-flight Pomodoro Block.
//!
//! Only the start instant is stored (`CONTEXT.md`). Elapsed time is derived
//! from the wall clock by whoever is watching, so there is no counter here to
//! keep up to date, nothing to tick, and nothing that can be stale after the
//! process dies mid-block.
//!
//! That death is the reason this table exists at all: if the app stops with a
//! block in flight, the next launch finds the row and **asks** whether to keep
//! the elapsed time. Silently discarding loses real work; silently logging
//! invents it.

use chrono::{DateTime, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};
use crate::projects;
use crate::time_entries::{self, NewTimeEntry, Source, TimeEntry};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RunningTimer {
    pub project_id: i64,
    pub start_at: DateTime<Utc>,
    /// The block's nominal length, frozen at start. Raising the default in
    /// Settings must not move the finish line of a block already under way.
    pub planned_minutes: i64,
}

const SELECT: &str = "SELECT project_id, start_at, planned_minutes FROM running_timer WHERE id = 1";

/// What the caller decided a stopped block is worth.
///
/// Deliberately not a whole entry: the project and the start instant are facts
/// this module already holds, and re-accepting them would let a caller log a
/// block against a project it never ran on.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopTimer {
    /// The day the work belongs to, in the user's own timezone.
    pub date: NaiveDate,
    /// Full nominal length for a completed block, actual elapsed for one
    /// stopped early — never the nominal length for the latter.
    pub duration_minutes: i64,
    /// When the block ended, which for a completed block is when it ran out
    /// rather than when anyone noticed.
    pub end_at: DateTime<Utc>,
    pub note: Option<String>,
}

/// The in-flight block, or `None`. Absence is the normal state, not an error.
pub async fn get(pool: &SqlitePool) -> Result<Option<RunningTimer>> {
    Ok(sqlx::query_as(SELECT).fetch_optional(pool).await?)
}

/// Begins a Pomodoro Block.
///
/// Refuses to start over an in-flight one. The UI never offers it, but making
/// it an error rather than an upsert means a double-click cannot quietly throw
/// away the minutes already earned.
pub async fn start(
    pool: &SqlitePool,
    project_id: i64,
    planned_minutes: i64,
    now: DateTime<Utc>,
) -> Result<RunningTimer> {
    if planned_minutes <= 0 {
        return Err(Error::validation(ValidationCode::DurationSettingNotPositive));
    }
    if get(pool).await?.is_some() {
        return Err(Error::validation(ValidationCode::TimerAlreadyRunning));
    }
    projects::get(pool, project_id).await?;

    sqlx::query(
        "INSERT INTO running_timer (id, project_id, start_at, planned_minutes)
         VALUES (1, ?, ?, ?)",
    )
    .bind(project_id)
    .bind(now)
    .bind(planned_minutes)
    .execute(pool)
    .await?;

    get(pool)
        .await?
        .ok_or_else(|| Error::not_found("runningTimer", 1))
}

/// Ends the block, logging it as a TimeEntry with `source = 'timer'`.
///
/// The write and the clear share one transaction. Split in two, a crash
/// between them would either lose the entry or leave a spent block in flight
/// for the next launch to offer back a second time.
pub async fn stop(
    pool: &SqlitePool,
    stop: StopTimer,
    today: NaiveDate,
    now: DateTime<Utc>,
) -> Result<TimeEntry> {
    let running = get(pool)
        .await?
        .ok_or_else(|| Error::not_found("runningTimer", 1))?;

    time_entries::validate(stop.duration_minutes, stop.date, today)?;
    projects::get(pool, running.project_id).await?;

    let entry = NewTimeEntry {
        project_id: running.project_id,
        date: stop.date,
        duration_minutes: stop.duration_minutes,
        note: stop.note,
        source: Source::Timer,
        start_at: Some(running.start_at),
        end_at: Some(stop.end_at),
    };

    let mut tx = pool.begin().await?;
    let id = time_entries::insert(&mut *tx, &entry, now).await?;
    sqlx::query("DELETE FROM running_timer WHERE id = 1")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    time_entries::get(pool, id).await
}

/// Throws the block away without logging anything.
///
/// Deliberately forgiving about there being nothing to discard: this is what
/// the recovery prompt's "discard" button calls, and a second click landing
/// after the first succeeded is not something to show the user an error for.
pub async fn discard(pool: &SqlitePool) -> Result<()> {
    sqlx::query("DELETE FROM running_timer WHERE id = 1")
        .execute(pool)
        .await?;
    Ok(())
}

// -- Command layer ----------------------------------------------------------

/// Today in the user's own timezone, matching `time_entries`.
fn today() -> NaiveDate {
    Local::now().date_naive()
}

#[tauri::command]
pub async fn get_running_timer(db: State<'_, Db>) -> Result<Option<RunningTimer>> {
    get(&db.0).await
}

#[tauri::command]
pub async fn start_running_timer(
    db: State<'_, Db>,
    project_id: i64,
    planned_minutes: i64,
) -> Result<RunningTimer> {
    start(&db.0, project_id, planned_minutes, Utc::now()).await
}

#[tauri::command]
pub async fn stop_running_timer(db: State<'_, Db>, stop: StopTimer) -> Result<TimeEntry> {
    self::stop(&db.0, stop, today(), Utc::now()).await
}

#[tauri::command]
pub async fn discard_running_timer(db: State<'_, Db>) -> Result<()> {
    discard(&db.0).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients;
    use crate::db::test_pool;
    use crate::test_support::{at, day, now, today as fixed_today};
    use crate::time_entries::EntryFilter;

    async fn a_project(pool: &SqlitePool) -> i64 {
        let client = clients::create(pool, "Acme", None, now()).await.unwrap();
        projects::create(pool, client.id, "Website", None, now())
            .await
            .unwrap()
            .id
    }

    fn stopped(minutes: i64, end_at: &str) -> StopTimer {
        StopTimer {
            date: fixed_today(),
            duration_minutes: minutes,
            end_at: at(end_at),
            note: None,
        }
    }

    #[tokio::test]
    async fn a_fresh_database_has_nothing_in_flight() {
        let pool = test_pool().await;

        assert_eq!(get(&pool).await.unwrap(), None);
    }

    #[tokio::test]
    async fn starting_remembers_the_instant_and_the_agreed_length() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        let running = start(&pool, project_id, 25, now()).await.unwrap();

        assert_eq!(running.project_id, project_id);
        assert_eq!(running.start_at, now());
        assert_eq!(running.planned_minutes, 25);
        assert_eq!(get(&pool).await.unwrap(), Some(running));
    }

    #[tokio::test]
    async fn a_second_block_cannot_start_over_a_running_one() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, now()).await.unwrap();

        let error = start(&pool, project_id, 25, at("2026-08-05T12:10:00Z"))
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::TimerAlreadyRunning
            }
        ));
        assert_eq!(
            get(&pool).await.unwrap().unwrap().start_at,
            now(),
            "the block already under way is untouched"
        );
    }

    #[tokio::test]
    async fn a_block_of_no_length_is_rejected() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        let error = start(&pool, project_id, 0, now()).await.unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::DurationSettingNotPositive
            }
        ));
        assert_eq!(get(&pool).await.unwrap(), None);
    }

    #[tokio::test]
    async fn starting_reports_a_missing_project_as_not_found() {
        let pool = test_pool().await;

        let error = start(&pool, 404, 25, now()).await.unwrap_err();

        assert!(matches!(
            error,
            Error::NotFound {
                entity: "project",
                id: 404
            }
        ));
    }

    #[tokio::test]
    async fn stopping_logs_a_timer_entry_and_clears_the_block() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, now()).await.unwrap();

        let entry = stop(
            &pool,
            stopped(25, "2026-08-05T12:25:00Z"),
            fixed_today(),
            now(),
        )
        .await
        .unwrap();

        assert_eq!(entry.source, Source::Timer);
        assert_eq!(entry.project_id, project_id);
        assert_eq!(entry.duration_minutes, 25);
        assert_eq!(entry.start_at, Some(now()), "the block's own start instant");
        assert_eq!(entry.end_at, Some(at("2026-08-05T12:25:00Z")));
        assert_eq!(get(&pool).await.unwrap(), None, "nothing left in flight");
    }

    #[tokio::test]
    async fn stopping_early_logs_what_the_caller_measured() {
        // The nominal 25 minutes never reaches the database: a block stopped
        // after ten minutes is ten minutes of work.
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, now()).await.unwrap();

        let entry = stop(
            &pool,
            stopped(10, "2026-08-05T12:10:00Z"),
            fixed_today(),
            now(),
        )
        .await
        .unwrap();

        assert_eq!(entry.duration_minutes, 10);
    }

    #[tokio::test]
    async fn stopping_nothing_is_not_silently_fine() {
        let pool = test_pool().await;

        let error = stop(
            &pool,
            stopped(25, "2026-08-05T12:25:00Z"),
            fixed_today(),
            now(),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            Error::NotFound {
                entity: "runningTimer",
                ..
            }
        ));
    }

    #[tokio::test]
    async fn a_rejected_stop_leaves_the_block_running() {
        // The entry rules apply here too, and failing halfway would be the one
        // outcome worse than either: work logged with the timer still going.
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, now()).await.unwrap();

        let error = stop(
            &pool,
            stopped(0, "2026-08-05T12:00:10Z"),
            fixed_today(),
            now(),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::DurationNotPositive
            }
        ));
        assert!(get(&pool).await.unwrap().is_some());
        assert!(time_entries::list(&pool, EntryFilter::default())
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn discarding_writes_no_hours() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, now()).await.unwrap();

        discard(&pool).await.unwrap();

        assert_eq!(get(&pool).await.unwrap(), None);
        assert!(time_entries::list(&pool, EntryFilter::default())
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn discarding_nothing_is_harmless() {
        let pool = test_pool().await;

        discard(&pool).await.unwrap();
        discard(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn a_block_survives_the_process_that_started_it() {
        // The crash-recovery case: whatever happens to the app, the next
        // launch reads back the instant the block began.
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, now()).await.unwrap();

        let relaunched = get(&pool).await.unwrap().unwrap();

        assert_eq!(relaunched.start_at, now());
        assert_eq!(relaunched.planned_minutes, 25);
    }

    #[tokio::test]
    async fn only_one_block_can_ever_be_stored() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, now()).await.unwrap();

        let second = sqlx::query(
            "INSERT INTO running_timer (id, project_id, start_at, planned_minutes)
             VALUES (2, ?, '2026-08-05T13:00:00Z', 25)",
        )
        .bind(project_id)
        .execute(&pool)
        .await;

        assert!(second.is_err(), "running_timer is a single-row table");
    }

    #[tokio::test]
    async fn the_logged_day_is_the_one_the_caller_names() {
        // A block started before midnight and stopped after it belongs to the
        // day the work happened, which only the caller's timezone knows.
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        start(&pool, project_id, 25, at("2026-08-04T23:50:00Z"))
            .await
            .unwrap();

        let entry = stop(
            &pool,
            StopTimer {
                date: day("2026-08-04"),
                ..stopped(25, "2026-08-05T00:15:00Z")
            },
            fixed_today(),
            now(),
        )
        .await
        .unwrap();

        assert_eq!(entry.date, day("2026-08-04"));
    }
}
