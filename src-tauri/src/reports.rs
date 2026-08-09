//! Report aggregation.
//!
//! This is the part of the app where a silent bug costs real money (ADR-0002),
//! so the arithmetic happens in SQL, in one place, against the same schema the
//! tests run.
//!
//! Durations are summed as stored and rounded only at presentation, never here.
//! Archived clients and projects still appear: archiving hides something from
//! pickers, not from history.

use chrono::{Datelike, Days, Months, NaiveDate, Weekday};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};
use crate::time_entries;

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
        let monday = date - Days::new(date.weekday().num_days_from_monday() as u64);
        DateRange {
            from: monday,
            to: monday + Days::new(6),
        }
    }

    /// The calendar month containing `date`, first to last day.
    ///
    /// Month lengths are asked of the calendar rather than assumed: a month is
    /// 28, 29, 30 or 31 days, and February changes its mind every four years.
    pub fn month_of(date: NaiveDate) -> Self {
        let from = first_of_month(date);
        DateRange {
            from,
            to: from + Months::new(1) - Days::new(1),
        }
    }

    /// The week number this range is, when it is one — Monday to Sunday and
    /// nothing else. A month or an arbitrary span has no week number, and
    /// making one up is how a report ends up labelled with someone else's week.
    pub fn iso_week(&self) -> Option<IsoWeek> {
        if self.from.weekday() != Weekday::Mon || self.to != self.from + Days::new(6) {
            return None;
        }
        let week = self.from.iso_week();
        Some(IsoWeek {
            year: week.year(),
            week: week.week(),
        })
    }
}

fn first_of_month(date: NaiveDate) -> NaiveDate {
    date.with_day(1).expect("every month has a first day")
}

/// An ISO week number and the ISO year it belongs to.
///
/// The year is carried because it is not always the calendar year: the week of
/// 28 December 2026 runs into January and is still *2026* week 53.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsoWeek {
    pub year: i32,
    pub week: u32,
}

/// Which stretch of days a report is about.
///
/// The presets are resolved here rather than in the UI so that "last week"
/// means the same Monday-to-Sunday everywhere, including over a year boundary,
/// and so the rule is testable without a browser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "preset", rename_all = "camelCase")]
pub enum Period {
    ThisWeek,
    LastWeek,
    ThisMonth,
    LastMonth,
    Custom { from: NaiveDate, to: NaiveDate },
}

impl Period {
    /// `today` is injected rather than read from the clock, so "this week" is a
    /// rule the tests can pin down instead of race with midnight.
    pub fn resolve(self, today: NaiveDate) -> Result<DateRange> {
        Ok(match self {
            Period::ThisWeek => DateRange::iso_week_of(today),
            Period::LastWeek => DateRange::iso_week_of(today - Days::new(7)),
            Period::ThisMonth => DateRange::month_of(today),
            // A day back from the first of this month lands in the last one,
            // whatever its length.
            Period::LastMonth => DateRange::month_of(first_of_month(today) - Days::new(1)),
            Period::Custom { from, to } => DateRange::new(from, to)?,
        })
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
    /// The week the range is, when it is a whole one. `None` for a month or an
    /// odd span — see [`DateRange::iso_week`].
    pub iso_week: Option<IsoWeek>,
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
        iso_week: range.iso_week(),
        total_minutes,
        rows,
    }
}

// -- Command layer ----------------------------------------------------------

#[tauri::command]
pub async fn report_by_client(db: State<'_, Db>, period: Period) -> Result<Report<ClientTotal>> {
    by_client(&db.0, period.resolve(time_entries::today())?).await
}

#[tauri::command]
pub async fn report_by_project(db: State<'_, Db>, period: Period) -> Result<Report<ProjectTotal>> {
    by_project(&db.0, period.resolve(time_entries::today())?).await
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

    fn resolved(period: Period, today: &str) -> DateRange {
        period.resolve(day(today)).unwrap()
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

    #[test]
    fn the_week_presets_are_this_monday_to_sunday_and_the_one_before() {
        assert_eq!(
            resolved(Period::ThisWeek, "2026-08-05"),
            range("2026-08-03", "2026-08-09")
        );
        assert_eq!(
            resolved(Period::LastWeek, "2026-08-05"),
            range("2026-07-27", "2026-08-02")
        );
    }

    #[test]
    fn the_week_presets_step_over_a_year_boundary() {
        // 2027-01-01 is a Friday, in the week that started on 28 December.
        // "Last week" is seven days back, not "the same week number in 2026".
        assert_eq!(
            resolved(Period::ThisWeek, "2027-01-01"),
            range("2026-12-28", "2027-01-03")
        );
        assert_eq!(
            resolved(Period::LastWeek, "2027-01-01"),
            range("2026-12-21", "2026-12-27")
        );
    }

    #[test]
    fn the_month_presets_sit_on_the_month_edges() {
        assert_eq!(
            resolved(Period::ThisMonth, "2026-08-05"),
            range("2026-08-01", "2026-08-31")
        );
        assert_eq!(
            resolved(Period::ThisMonth, "2026-08-31"),
            range("2026-08-01", "2026-08-31"),
            "the last day of a month is still in it"
        );
        assert_eq!(
            resolved(Period::LastMonth, "2026-08-01"),
            range("2026-07-01", "2026-07-31"),
            "the first day of a month still has a month before it"
        );
        // Thirty-one days back from the end of March is not February.
        assert_eq!(
            resolved(Period::LastMonth, "2026-03-31"),
            range("2026-02-01", "2026-02-28")
        );
        assert_eq!(
            resolved(Period::LastMonth, "2024-03-01"),
            range("2024-02-01", "2024-02-29"),
            "February is a day longer in a leap year"
        );
    }

    #[test]
    fn the_month_presets_step_over_a_year_boundary() {
        assert_eq!(
            resolved(Period::ThisMonth, "2027-01-15"),
            range("2027-01-01", "2027-01-31")
        );
        assert_eq!(
            resolved(Period::LastMonth, "2027-01-15"),
            range("2026-12-01", "2026-12-31")
        );
    }

    #[test]
    fn a_custom_period_is_the_days_it_names() {
        let period = Period::Custom {
            from: day("2026-08-01"),
            to: day("2026-08-05"),
        };

        assert_eq!(
            period.resolve(day("2026-08-09")).unwrap(),
            range("2026-08-01", "2026-08-05"),
            "today does not enter into it"
        );

        let backwards = Period::Custom {
            from: day("2026-08-05"),
            to: day("2026-08-01"),
        };
        assert!(matches!(
            backwards.resolve(day("2026-08-09")).unwrap_err(),
            Error::Validation {
                code: ValidationCode::RangeEndsBeforeStart
            }
        ));
    }

    #[test]
    fn a_range_that_is_exactly_a_week_knows_its_iso_number() {
        assert_eq!(
            range("2026-08-03", "2026-08-09").iso_week(),
            Some(IsoWeek {
                year: 2026,
                week: 32
            })
        );
        // The week straddling New Year belongs to the ISO year holding most of
        // it — which is why the year is reported and not assumed.
        assert_eq!(
            range("2026-12-28", "2027-01-03").iso_week(),
            Some(IsoWeek {
                year: 2026,
                week: 53
            })
        );
    }

    #[test]
    fn a_range_that_is_not_a_week_has_no_week_number() {
        assert_eq!(range("2026-08-03", "2026-08-10").iso_week(), None);
        assert_eq!(
            range("2026-08-04", "2026-08-10").iso_week(),
            None,
            "seven days from a Tuesday is not week 32"
        );
        assert_eq!(range("2026-08-01", "2026-08-31").iso_week(), None);
    }

    #[tokio::test]
    async fn a_report_says_which_week_it_covers_when_it_covers_one() {
        let pool = test_pool().await;

        let week = by_client(&pool, range("2026-08-03", "2026-08-09"))
            .await
            .unwrap();
        assert_eq!(
            week.iso_week,
            Some(IsoWeek {
                year: 2026,
                week: 32
            })
        );

        let month = by_client(&pool, range("2026-08-01", "2026-08-31"))
            .await
            .unwrap();
        assert_eq!(month.iso_week, None);
    }
}
