//! Report aggregation.
//!
//! This is the part of the app where a silent bug costs real money (ADR-0002),
//! so the arithmetic happens in SQL, in one place, against the same schema the
//! tests run.
//!
//! Durations are summed as stored and rounded only at presentation, never here.
//! Archived clients and projects still appear: archiving hides something from
//! pickers, not from history.

use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};

/// An inclusive span of days. Both ends are inclusive because that is how a
/// person reads "1 to 7 August".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DateRange {
    pub from: NaiveDate,
    pub to: NaiveDate,
}

impl DateRange {
    pub fn new(from: NaiveDate, to: NaiveDate) -> Result<Self> {
        if to < from {
            return Err(Error::validation(ValidationCode::RangeEndsBeforeStart));
        }
        Ok(DateRange { from, to })
    }

    /// The ISO week containing `date`: Monday through Sunday (`CONTEXT.md`).
    pub fn iso_week_of(date: NaiveDate) -> Self {
        let monday = date - chrono::Days::new(date.weekday().num_days_from_monday() as u64);
        DateRange {
            from: monday,
            to: monday + chrono::Days::new(6),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ClientTotal {
    pub client_id: i64,
    pub client_name: String,
    pub total_minutes: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTotal {
    pub project_id: i64,
    pub project_name: String,
    pub client_id: i64,
    pub client_name: String,
    pub total_minutes: i64,
}

/// Rows plus the range they cover and their sum, so a caller never has to add
/// the column up itself and get a different answer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report<Row> {
    pub range: DateRange,
    pub total_minutes: i64,
    pub rows: Vec<Row>,
}

/// Groups by client. Ordered by hours, most first — a report is read to answer
/// "where did the week go".
pub async fn by_client(pool: &SqlitePool, range: DateRange) -> Result<Report<ClientTotal>> {
    let rows: Vec<ClientTotal> = sqlx::query_as(
        "SELECT clients.id           AS client_id,
                clients.name         AS client_name,
                SUM(time_entries.duration_minutes) AS total_minutes
           FROM time_entries
           JOIN projects ON projects.id = time_entries.project_id
           JOIN clients  ON clients.id  = projects.client_id
          WHERE time_entries.date BETWEEN ? AND ?
       GROUP BY clients.id
       ORDER BY total_minutes DESC, clients.name COLLATE NOCASE",
    )
    .bind(range.from)
    .bind(range.to)
    .fetch_all(pool)
    .await?;

    Ok(summarise(range, rows, |row| row.total_minutes))
}

/// Groups by project, carrying the client along so the UI never needs a second
/// round trip to label a row.
pub async fn by_project(pool: &SqlitePool, range: DateRange) -> Result<Report<ProjectTotal>> {
    let rows: Vec<ProjectTotal> = sqlx::query_as(
        "SELECT projects.id          AS project_id,
                projects.name        AS project_name,
                clients.id           AS client_id,
                clients.name         AS client_name,
                SUM(time_entries.duration_minutes) AS total_minutes
           FROM time_entries
           JOIN projects ON projects.id = time_entries.project_id
           JOIN clients  ON clients.id  = projects.client_id
          WHERE time_entries.date BETWEEN ? AND ?
       GROUP BY projects.id
       ORDER BY total_minutes DESC, projects.name COLLATE NOCASE",
    )
    .bind(range.from)
    .bind(range.to)
    .fetch_all(pool)
    .await?;

    Ok(summarise(range, rows, |row| row.total_minutes))
}

fn summarise<Row>(
    range: DateRange,
    rows: Vec<Row>,
    minutes: impl Fn(&Row) -> i64,
) -> Report<Row> {
    let total_minutes = rows.iter().map(&minutes).sum();
    Report {
        range,
        total_minutes,
        rows,
    }
}

// -- Command layer ----------------------------------------------------------

#[tauri::command]
pub async fn report_by_client(
    db: State<'_, Db>,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Report<ClientTotal>> {
    by_client(&db.0, DateRange::new(from, to)?).await
}

#[tauri::command]
pub async fn report_by_project(
    db: State<'_, Db>,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Report<ProjectTotal>> {
    by_project(&db.0, DateRange::new(from, to)?).await
}

/// The Monday-to-Sunday week a date falls in. Exposed so the frontend never
/// re-implements the ISO rule in JavaScript and drifts by a day.
#[tauri::command]
pub fn iso_week_of(date: NaiveDate) -> DateRange {
    DateRange::iso_week_of(date)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients;
    use crate::db::test_pool;
    use crate::projects;
    use crate::test_support::{day, now, today};
    use crate::time_entries::{self, NewTimeEntry, Source};

    async fn log(pool: &SqlitePool, project_id: i64, date: &str, minutes: i64) {
        time_entries::create(
            pool,
            NewTimeEntry {
                project_id,
                date: day(date),
                duration_minutes: minutes,
                note: None,
                source: Source::Manual,
                start_at: None,
                end_at: None,
            },
            today(),
            now(),
        )
        .await
        .unwrap();
    }

    async fn project(pool: &SqlitePool, client_id: i64, name: &str) -> i64 {
        projects::create(pool, client_id, name, None, now())
            .await
            .unwrap()
            .id
    }

    async fn client(pool: &SqlitePool, name: &str) -> i64 {
        clients::create(pool, name, None, now()).await.unwrap().id
    }

    fn range(from: &str, to: &str) -> DateRange {
        DateRange::new(day(from), day(to)).unwrap()
    }

    #[tokio::test]
    async fn totals_are_summed_per_client_across_their_projects() {
        let pool = test_pool().await;
        let acme = client(&pool, "Acme").await;
        let other = client(&pool, "Other").await;
        let website = project(&pool, acme, "Website").await;
        let rebrand = project(&pool, acme, "Rebrand").await;
        let elsewhere = project(&pool, other, "Elsewhere").await;

        log(&pool, website, "2026-08-03", 120).await;
        log(&pool, rebrand, "2026-08-04", 30).await;
        log(&pool, elsewhere, "2026-08-04", 60).await;

        let report = by_client(&pool, range("2026-08-01", "2026-08-05")).await.unwrap();

        assert_eq!(
            report.rows,
            [
                ClientTotal {
                    client_id: acme,
                    client_name: "Acme".into(),
                    total_minutes: 150,
                },
                ClientTotal {
                    client_id: other,
                    client_name: "Other".into(),
                    total_minutes: 60,
                },
            ]
        );
        assert_eq!(report.total_minutes, 210);
    }

    #[tokio::test]
    async fn project_rows_carry_their_client() {
        let pool = test_pool().await;
        let acme = client(&pool, "Acme").await;
        let website = project(&pool, acme, "Website").await;
        log(&pool, website, "2026-08-03", 45).await;

        let report = by_project(&pool, range("2026-08-01", "2026-08-05")).await.unwrap();

        assert_eq!(
            report.rows,
            [ProjectTotal {
                project_id: website,
                project_name: "Website".into(),
                client_id: acme,
                client_name: "Acme".into(),
                total_minutes: 45,
            }]
        );
    }

    #[tokio::test]
    async fn the_range_is_inclusive_at_both_ends() {
        let pool = test_pool().await;
        let acme = client(&pool, "Acme").await;
        let website = project(&pool, acme, "Website").await;

        log(&pool, website, "2026-07-31", 60).await;
        log(&pool, website, "2026-08-01", 60).await;
        log(&pool, website, "2026-08-03", 60).await;
        log(&pool, website, "2026-08-04", 60).await;

        let report = by_client(&pool, range("2026-08-01", "2026-08-03")).await.unwrap();

        assert_eq!(report.total_minutes, 120, "31 July and 4 August are outside");
    }

    #[tokio::test]
    async fn archived_clients_and_projects_still_appear_in_reports() {
        let pool = test_pool().await;
        let acme = client(&pool, "Acme").await;
        let website = project(&pool, acme, "Website").await;
        log(&pool, website, "2026-08-03", 90).await;

        projects::archive(&pool, website, now()).await.unwrap();
        clients::archive(&pool, acme, now()).await.unwrap();

        let report = by_project(&pool, range("2026-08-01", "2026-08-05")).await.unwrap();

        assert_eq!(report.total_minutes, 90, "archiving is not forgetting");
        assert_eq!(report.rows.len(), 1);
    }

    #[tokio::test]
    async fn a_client_with_no_hours_in_range_is_not_a_row() {
        let pool = test_pool().await;
        let acme = client(&pool, "Acme").await;
        project(&pool, acme, "Website").await;

        let report = by_client(&pool, range("2026-08-01", "2026-08-05")).await.unwrap();

        assert!(report.rows.is_empty());
        assert_eq!(report.total_minutes, 0);
    }

    #[tokio::test]
    async fn overlapping_entries_are_both_counted() {
        // Overlap is deliberate (CONTEXT.md), so the total is the plain sum —
        // the report does not try to be clever about double-booked hours.
        let pool = test_pool().await;
        let acme = client(&pool, "Acme").await;
        let a = project(&pool, acme, "A").await;
        let b = project(&pool, acme, "B").await;

        log(&pool, a, "2026-08-04", 120).await;
        log(&pool, b, "2026-08-04", 60).await;

        let report = by_client(&pool, range("2026-08-04", "2026-08-04")).await.unwrap();

        assert_eq!(report.total_minutes, 180);
    }

    #[test]
    fn a_range_may_not_end_before_it_starts() {
        let error = DateRange::new(day("2026-08-05"), day("2026-08-01")).unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::RangeEndsBeforeStart
            }
        ));
        assert!(
            DateRange::new(day("2026-08-05"), day("2026-08-05")).is_ok(),
            "a single day is a valid range"
        );
    }

    #[test]
    fn weeks_run_monday_to_sunday() {
        // 2026-08-05 is a Wednesday.
        assert_eq!(
            DateRange::iso_week_of(day("2026-08-05")),
            range("2026-08-03", "2026-08-09")
        );
        // A Monday is the start of its own week, and a Sunday the end of one.
        assert_eq!(
            DateRange::iso_week_of(day("2026-08-03")),
            range("2026-08-03", "2026-08-09")
        );
        assert_eq!(
            DateRange::iso_week_of(day("2026-08-09")),
            range("2026-08-03", "2026-08-09")
        );
    }
}
