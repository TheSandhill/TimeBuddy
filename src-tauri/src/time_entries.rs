//! Time entries — the only table hours are ever read from.
//!
//! Validation is limited to what is genuinely wrong (`CONTEXT.md`):
//! `duration_minutes > 0`, `<= 1440`, and a `date` that is not in the future.
//! Everything else the user types is accepted, including entries that overlap
//! in time.
//!
//! Unlike clients and projects, a time entry **is** hard-deletable — the undo
//! window that makes that safe lives in the UI.

use chrono::{DateTime, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};
use crate::projects;
use crate::text;

/// The longest a single entry may be: one full day.
const MAX_DURATION_MINUTES: i64 = 1440;

/// Where the entry came from. A timer block is not a separate kind of record —
/// it is a time entry that happens to know when it started.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
pub enum Source {
    Manual,
    Timer,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: i64,
    pub project_id: i64,
    pub date: NaiveDate,
    pub duration_minutes: i64,
    /// Populated only for timer entries. A manually entered "2 hours on
    /// Tuesday" has no start time, and inventing one would be a lie.
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub note: Option<String>,
    pub source: Source,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT id, project_id, date, duration_minutes, start_at, end_at, note, \
                      source, created_at, updated_at FROM time_entries";

/// What a caller is asking to write. Grouped into one struct because the
/// validation rules apply to the combination, not to the arguments one by one.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTimeEntry {
    pub project_id: i64,
    pub date: NaiveDate,
    pub duration_minutes: i64,
    pub note: Option<String>,
    pub source: Source,
    #[serde(default)]
    pub start_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_at: Option<DateTime<Utc>>,
}

/// The parts of an entry a person can meaningfully correct afterwards.
///
/// `source`, `start_at` and `end_at` are deliberately absent: they record how
/// the entry came to exist, which editing it later cannot change.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntryEdit {
    pub project_id: i64,
    pub date: NaiveDate,
    pub duration_minutes: i64,
    pub note: Option<String>,
}

/// Which entries to read back.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryFilter {
    /// Inclusive lower bound on `date`. `None` means unbounded.
    pub from: Option<NaiveDate>,
    /// Inclusive upper bound on `date`.
    pub to: Option<NaiveDate>,
    pub project_id: Option<i64>,
}

/// The three rules from `CONTEXT.md`, as one pure function.
///
/// `today` is passed in rather than read from the clock so the future-date rule
/// is testable rather than a race with midnight.
pub(crate) fn validate(duration_minutes: i64, date: NaiveDate, today: NaiveDate) -> Result<()> {
    if duration_minutes <= 0 {
        return Err(Error::validation(ValidationCode::DurationNotPositive));
    }
    if duration_minutes > MAX_DURATION_MINUTES {
        return Err(Error::validation(ValidationCode::DurationExceedsDay));
    }
    if date > today {
        return Err(Error::validation(ValidationCode::DateInFuture));
    }
    Ok(())
}

/// Only timer entries carry clock times, so a manual entry's times are dropped
/// rather than stored — the schema's `NULL` is what "no start time" means.
fn times_for(entry: &NewTimeEntry) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
    match entry.source {
        Source::Timer => (entry.start_at, entry.end_at),
        Source::Manual => (None, None),
    }
}

pub async fn list(pool: &SqlitePool, filter: EntryFilter) -> Result<Vec<TimeEntry>> {
    let mut sql = format!("{SELECT} WHERE 1 = 1");
    if filter.from.is_some() {
        sql.push_str(" AND date >= ?");
    }
    if filter.to.is_some() {
        sql.push_str(" AND date <= ?");
    }
    if filter.project_id.is_some() {
        sql.push_str(" AND project_id = ?");
    }
    sql.push_str(" ORDER BY date DESC, id DESC");

    let mut query = sqlx::query_as(&sql);
    if let Some(from) = filter.from {
        query = query.bind(from);
    }
    if let Some(to) = filter.to {
        query = query.bind(to);
    }
    if let Some(project_id) = filter.project_id {
        query = query.bind(project_id);
    }

    Ok(query.fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<TimeEntry> {
    sqlx::query_as(&format!("{SELECT} WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| Error::not_found("timeEntry", id))
}

/// Writes the row and returns its id, without validating.
///
/// Generic over the executor so a caller that must do more in the same
/// transaction — stopping the Running Timer writes an entry and clears the
/// in-flight row together — can hand in the transaction instead of the pool.
pub(crate) async fn insert<'e, E>(
    executor: E,
    entry: &NewTimeEntry,
    now: DateTime<Utc>,
) -> Result<i64>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let (start_at, end_at) = times_for(entry);

    Ok(sqlx::query_scalar(
        "INSERT INTO time_entries
           (project_id, date, duration_minutes, start_at, end_at, note, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(entry.project_id)
    .bind(entry.date)
    .bind(entry.duration_minutes)
    .bind(start_at)
    .bind(end_at)
    .bind(text::optional(entry.note.as_deref()))
    .bind(entry.source)
    .bind(now)
    .bind(now)
    .fetch_one(executor)
    .await?)
}

pub async fn create(
    pool: &SqlitePool,
    entry: NewTimeEntry,
    today: NaiveDate,
    now: DateTime<Utc>,
) -> Result<TimeEntry> {
    validate(entry.duration_minutes, entry.date, today)?;
    projects::get(pool, entry.project_id).await?;

    let id = insert(pool, &entry, now).await?;

    get(pool, id).await
}

/// Corrects an existing entry, applying the same rules a new one faces.
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    edit: TimeEntryEdit,
    today: NaiveDate,
    now: DateTime<Utc>,
) -> Result<TimeEntry> {
    validate(edit.duration_minutes, edit.date, today)?;
    projects::get(pool, edit.project_id).await?;

    let affected = sqlx::query(
        "UPDATE time_entries
            SET project_id = ?, date = ?, duration_minutes = ?, note = ?, updated_at = ?
          WHERE id = ?",
    )
    .bind(edit.project_id)
    .bind(edit.date)
    .bind(edit.duration_minutes)
    .bind(text::optional(edit.note.as_deref()))
    .bind(now)
    .bind(id)
    .execute(pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(Error::not_found("timeEntry", id));
    }
    get(pool, id).await
}

/// Hard delete. Entries are the one thing in this app that really goes away —
/// behind a 5-second undo in the UI, which is why this needs no soft state.
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<()> {
    let affected = sqlx::query("DELETE FROM time_entries WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(Error::not_found("timeEntry", id));
    }
    Ok(())
}

// -- Command layer ----------------------------------------------------------

/// Today in the user's own timezone. "Not in the future" is a statement about
/// the calendar on her wall, not about UTC.
fn today() -> NaiveDate {
    Local::now().date_naive()
}

#[tauri::command]
pub async fn list_time_entries(db: State<'_, Db>, filter: EntryFilter) -> Result<Vec<TimeEntry>> {
    list(&db.0, filter).await
}

#[tauri::command]
pub async fn get_time_entry(db: State<'_, Db>, id: i64) -> Result<TimeEntry> {
    get(&db.0, id).await
}

#[tauri::command]
pub async fn create_time_entry(db: State<'_, Db>, entry: NewTimeEntry) -> Result<TimeEntry> {
    create(&db.0, entry, today(), Utc::now()).await
}

#[tauri::command]
pub async fn update_time_entry(
    db: State<'_, Db>,
    id: i64,
    edit: TimeEntryEdit,
) -> Result<TimeEntry> {
    update(&db.0, id, edit, today(), Utc::now()).await
}

#[tauri::command]
pub async fn delete_time_entry(db: State<'_, Db>, id: i64) -> Result<()> {
    delete(&db.0, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients;
    use crate::db::test_pool;
    use crate::test_support::{at, day, now, today as fixed_today};

    async fn a_project(pool: &SqlitePool) -> i64 {
        let client = clients::create(pool, "Acme", None, now()).await.unwrap();
        projects::create(pool, client.id, "Website", None, now())
            .await
            .unwrap()
            .id
    }

    fn manual(project_id: i64, date: &str, minutes: i64) -> NewTimeEntry {
        NewTimeEntry {
            project_id,
            date: day(date),
            duration_minutes: minutes,
            note: None,
            source: Source::Manual,
            start_at: None,
            end_at: None,
        }
    }

    async fn create_ok(pool: &SqlitePool, entry: NewTimeEntry) -> TimeEntry {
        create(pool, entry, fixed_today(), now()).await.unwrap()
    }

    #[tokio::test]
    async fn a_manual_entry_stores_hours_without_clock_times() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        let entry = create_ok(&pool, manual(project_id, "2026-08-04", 120)).await;

        assert_eq!(entry.duration_minutes, 120);
        assert_eq!(entry.date, day("2026-08-04"));
        assert_eq!(entry.source, Source::Manual);
        assert_eq!(entry.start_at, None);
        assert_eq!(entry.end_at, None);
    }

    #[tokio::test]
    async fn a_manual_entry_never_keeps_clock_times_it_was_handed() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        let entry = create_ok(
            &pool,
            NewTimeEntry {
                start_at: Some(at("2026-08-04T09:00:00Z")),
                end_at: Some(at("2026-08-04T11:00:00Z")),
                ..manual(project_id, "2026-08-04", 120)
            },
        )
        .await;

        assert_eq!(entry.start_at, None, "only timer entries have times");
        assert_eq!(entry.end_at, None);
    }

    #[tokio::test]
    async fn a_timer_entry_remembers_when_it_ran() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        let entry = create_ok(
            &pool,
            NewTimeEntry {
                source: Source::Timer,
                start_at: Some(at("2026-08-04T09:00:00Z")),
                end_at: Some(at("2026-08-04T09:25:00Z")),
                ..manual(project_id, "2026-08-04", 25)
            },
        )
        .await;

        assert_eq!(entry.source, Source::Timer);
        assert_eq!(entry.start_at, Some(at("2026-08-04T09:00:00Z")));
        assert_eq!(entry.end_at, Some(at("2026-08-04T09:25:00Z")));
    }

    #[tokio::test]
    async fn a_zero_or_negative_duration_is_rejected() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        for minutes in [0, -30] {
            let error = create(
                &pool,
                manual(project_id, "2026-08-04", minutes),
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
        }
    }

    #[tokio::test]
    async fn a_full_day_is_allowed_and_a_minute_more_is_not() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        assert_eq!(
            create_ok(&pool, manual(project_id, "2026-08-04", 1440))
                .await
                .duration_minutes,
            1440
        );

        let error = create(
            &pool,
            manual(project_id, "2026-08-04", 1441),
            fixed_today(),
            now(),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::DurationExceedsDay
            }
        ));
    }

    #[tokio::test]
    async fn today_is_allowed_and_tomorrow_is_not() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;

        create_ok(&pool, manual(project_id, "2026-08-05", 60)).await;

        let error = create(
            &pool,
            manual(project_id, "2026-08-06", 60),
            fixed_today(),
            now(),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::DateInFuture
            }
        ));
    }

    #[tokio::test]
    async fn entries_are_deliberately_allowed_to_overlap_in_time() {
        // "2h on A and 1h on B on Tuesday" is a normal way to remember a day.
        // Refusing it would fight the user for no gain (CONTEXT.md).
        let pool = test_pool().await;
        let client = clients::create(&pool, "Acme", None, now()).await.unwrap();
        let a = projects::create(&pool, client.id, "A", None, now())
            .await
            .unwrap();
        let b = projects::create(&pool, client.id, "B", None, now())
            .await
            .unwrap();

        create_ok(&pool, manual(a.id, "2026-08-04", 120)).await;
        create_ok(&pool, manual(b.id, "2026-08-04", 60)).await;

        // Even two timer entries covering the same wall-clock window are kept.
        let window = NewTimeEntry {
            source: Source::Timer,
            start_at: Some(at("2026-08-04T09:00:00Z")),
            end_at: Some(at("2026-08-04T10:00:00Z")),
            ..manual(a.id, "2026-08-04", 60)
        };
        create_ok(&pool, window.clone()).await;
        create_ok(
            &pool,
            NewTimeEntry {
                project_id: b.id,
                ..window
            },
        )
        .await;

        assert_eq!(list(&pool, EntryFilter::default()).await.unwrap().len(), 4);
    }

    #[tokio::test]
    async fn create_reports_a_missing_project_as_not_found() {
        let pool = test_pool().await;

        let error = create(&pool, manual(404, "2026-08-04", 60), fixed_today(), now())
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            Error::NotFound {
                entity: "project",
                id: 404
            }
        ));
    }

    #[tokio::test]
    async fn listing_filters_by_date_range_and_project() {
        let pool = test_pool().await;
        let client = clients::create(&pool, "Acme", None, now()).await.unwrap();
        let a = projects::create(&pool, client.id, "A", None, now())
            .await
            .unwrap();
        let b = projects::create(&pool, client.id, "B", None, now())
            .await
            .unwrap();

        create_ok(&pool, manual(a.id, "2026-07-31", 60)).await;
        create_ok(&pool, manual(a.id, "2026-08-01", 60)).await;
        create_ok(&pool, manual(b.id, "2026-08-03", 60)).await;
        create_ok(&pool, manual(a.id, "2026-08-05", 60)).await;

        let in_range = list(
            &pool,
            EntryFilter {
                from: Some(day("2026-08-01")),
                to: Some(day("2026-08-03")),
                project_id: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(in_range.len(), 2, "bounds are inclusive on both ends");

        let just_a = list(
            &pool,
            EntryFilter {
                from: None,
                to: None,
                project_id: Some(a.id),
            },
        )
        .await
        .unwrap();
        assert_eq!(just_a.len(), 3);
    }

    #[tokio::test]
    async fn listing_puts_the_most_recent_day_first() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        create_ok(&pool, manual(project_id, "2026-08-01", 60)).await;
        create_ok(&pool, manual(project_id, "2026-08-05", 60)).await;

        let dates: Vec<NaiveDate> = list(&pool, EntryFilter::default())
            .await
            .unwrap()
            .into_iter()
            .map(|e| e.date)
            .collect();

        assert_eq!(dates, [day("2026-08-05"), day("2026-08-01")]);
    }

    #[tokio::test]
    async fn update_corrects_an_entry_and_revalidates_it() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        let entry = create_ok(&pool, manual(project_id, "2026-08-04", 120)).await;

        let edit = TimeEntryEdit {
            project_id,
            date: day("2026-08-03"),
            duration_minutes: 90,
            note: Some("  standup  ".into()),
        };
        let corrected = update(&pool, entry.id, edit.clone(), fixed_today(), now())
            .await
            .unwrap();

        assert_eq!(corrected.duration_minutes, 90);
        assert_eq!(corrected.date, day("2026-08-03"));
        assert_eq!(corrected.note.as_deref(), Some("standup"));
        assert_eq!(corrected.source, Source::Manual);

        let rejected = update(
            &pool,
            entry.id,
            TimeEntryEdit {
                duration_minutes: 0,
                ..edit
            },
            fixed_today(),
            now(),
        )
        .await;
        assert!(rejected.is_err(), "the rules apply to edits too");
    }

    #[tokio::test]
    async fn a_time_entry_is_hard_deleted() {
        let pool = test_pool().await;
        let project_id = a_project(&pool).await;
        let entry = create_ok(&pool, manual(project_id, "2026-08-04", 60)).await;

        delete(&pool, entry.id).await.unwrap();

        assert!(matches!(
            get(&pool, entry.id).await.unwrap_err(),
            Error::NotFound { .. }
        ));
        assert!(
            matches!(
                delete(&pool, entry.id).await.unwrap_err(),
                Error::NotFound { .. }
            ),
            "deleting twice is not silently fine"
        );
    }
}
