//! Projects. Each belongs to exactly one client, and like clients they are
//! archived, never deleted.
//!
//! `hourly_rate` is stored and read by nothing in v1 (`CONTEXT.md`) — it exists
//! so billing can arrive without a migration.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::clients;
use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};
use crate::text;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub client_id: i64,
    pub name: String,
    pub hourly_rate: Option<f64>,
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT id, client_id, name, hourly_rate, archived_at, created_at, updated_at \
                      FROM projects";

/// Which projects a caller wants back. Both axes are always answered
/// explicitly, so no call site accidentally depends on a default.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFilter {
    /// Restrict to one client. `None` means every client.
    pub client_id: Option<i64>,
    pub include_archived: bool,
}

pub async fn list(pool: &SqlitePool, filter: ProjectFilter) -> Result<Vec<Project>> {
    let mut sql = format!("{SELECT} WHERE 1 = 1");
    if !filter.include_archived {
        sql.push_str(" AND archived_at IS NULL");
    }
    if filter.client_id.is_some() {
        sql.push_str(" AND client_id = ?");
    }
    sql.push_str(" ORDER BY name COLLATE NOCASE");

    let mut query = sqlx::query_as(&sql);
    if let Some(client_id) = filter.client_id {
        query = query.bind(client_id);
    }

    Ok(query.fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Project> {
    sqlx::query_as(&format!("{SELECT} WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| Error::not_found("project", id))
}

pub async fn create(
    pool: &SqlitePool,
    client_id: i64,
    name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<Project> {
    let name = text::required(name, ValidationCode::NameRequired)?;
    // Checked up front so a missing client reads as "client 7 not found"
    // rather than as a foreign-key constraint message.
    clients::get(pool, client_id).await?;

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO projects (client_id, name, hourly_rate, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(client_id)
    .bind(name)
    .bind(hourly_rate)
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await?;

    get(pool, id).await
}

/// A project never changes client: its hours were done for the client it was
/// created under, and moving it would rewrite what those hours mean.
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    name: &str,
    hourly_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Result<Project> {
    let name = text::required(name, ValidationCode::NameRequired)?;

    let affected =
        sqlx::query("UPDATE projects SET name = ?, hourly_rate = ?, updated_at = ? WHERE id = ?")
            .bind(name)
            .bind(hourly_rate)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?
            .rows_affected();

    if affected == 0 {
        return Err(Error::not_found("project", id));
    }
    get(pool, id).await
}

pub async fn archive(pool: &SqlitePool, id: i64, now: DateTime<Utc>) -> Result<Project> {
    crate::archive::set_archived(pool, "projects", "project", id, Some(now), now).await?;
    get(pool, id).await
}

pub async fn restore(pool: &SqlitePool, id: i64, now: DateTime<Utc>) -> Result<Project> {
    crate::archive::set_archived(pool, "projects", "project", id, None, now).await?;
    get(pool, id).await
}

// -- Command layer ----------------------------------------------------------

#[tauri::command]
pub async fn list_projects(db: State<'_, Db>, filter: ProjectFilter) -> Result<Vec<Project>> {
    list(&db.0, filter).await
}

#[tauri::command]
pub async fn get_project(db: State<'_, Db>, id: i64) -> Result<Project> {
    get(&db.0, id).await
}

#[tauri::command]
pub async fn create_project(
    db: State<'_, Db>,
    client_id: i64,
    name: String,
    hourly_rate: Option<f64>,
) -> Result<Project> {
    create(&db.0, client_id, &name, hourly_rate, Utc::now()).await
}

#[tauri::command]
pub async fn update_project(
    db: State<'_, Db>,
    id: i64,
    name: String,
    hourly_rate: Option<f64>,
) -> Result<Project> {
    update(&db.0, id, &name, hourly_rate, Utc::now()).await
}

#[tauri::command]
pub async fn archive_project(db: State<'_, Db>, id: i64) -> Result<Project> {
    archive(&db.0, id, Utc::now()).await
}

#[tauri::command]
pub async fn restore_project(db: State<'_, Db>, id: i64) -> Result<Project> {
    restore(&db.0, id, Utc::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_support::now;

    async fn a_client(pool: &SqlitePool, name: &str) -> i64 {
        clients::create(pool, name, None, now()).await.unwrap().id
    }

    fn for_client(client_id: i64) -> ProjectFilter {
        ProjectFilter {
            client_id: Some(client_id),
            include_archived: false,
        }
    }

    #[tokio::test]
    async fn a_project_belongs_to_its_client_and_starts_unarchived() {
        let pool = test_pool().await;
        let client_id = a_client(&pool, "Acme").await;

        let project = create(&pool, client_id, "  Website  ", None, now())
            .await
            .unwrap();

        assert_eq!(project.client_id, client_id);
        assert_eq!(project.name, "Website");
        assert_eq!(project.hourly_rate, None);
        assert_eq!(project.archived_at, None);
    }

    #[tokio::test]
    async fn hourly_rate_round_trips_but_nothing_in_v1_reads_it() {
        let pool = test_pool().await;
        let client_id = a_client(&pool, "Acme").await;

        let project = create(&pool, client_id, "Website", Some(92.5), now())
            .await
            .unwrap();

        assert_eq!(get(&pool, project.id).await.unwrap().hourly_rate, Some(92.5));
    }

    #[tokio::test]
    async fn create_rejects_a_blank_name() {
        let pool = test_pool().await;
        let client_id = a_client(&pool, "Acme").await;

        let error = create(&pool, client_id, " ", None, now()).await.unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::NameRequired
            }
        ));
    }

    #[tokio::test]
    async fn create_reports_a_missing_client_as_not_found() {
        let pool = test_pool().await;

        let error = create(&pool, 404, "Website", None, now()).await.unwrap_err();

        assert!(matches!(
            error,
            Error::NotFound {
                entity: "client",
                id: 404
            }
        ));
    }

    #[tokio::test]
    async fn listing_filters_by_client_and_hides_archived_by_default() {
        let pool = test_pool().await;
        let acme = a_client(&pool, "Acme").await;
        let other = a_client(&pool, "Other").await;
        let website = create(&pool, acme, "Website", None, now()).await.unwrap();
        create(&pool, acme, "Rebrand", None, now()).await.unwrap();
        create(&pool, other, "Elsewhere", None, now()).await.unwrap();

        archive(&pool, website.id, now()).await.unwrap();

        let visible: Vec<String> = list(&pool, for_client(acme))
            .await
            .unwrap()
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(visible, ["Rebrand"]);

        let all_for_acme = list(
            &pool,
            ProjectFilter {
                client_id: Some(acme),
                include_archived: true,
            },
        )
        .await
        .unwrap();
        assert_eq!(all_for_acme.len(), 2);

        let every_client = list(&pool, ProjectFilter::default()).await.unwrap();
        assert_eq!(every_client.len(), 2, "Rebrand and Elsewhere");
    }

    #[tokio::test]
    async fn archiving_a_project_keeps_it_readable() {
        let pool = test_pool().await;
        let client_id = a_client(&pool, "Acme").await;
        let project = create(&pool, client_id, "Website", None, now())
            .await
            .unwrap();

        let archived = archive(&pool, project.id, now()).await.unwrap();
        assert!(archived.archived_at.is_some());
        assert!(get(&pool, project.id).await.is_ok());

        let restored = restore(&pool, project.id, now()).await.unwrap();
        assert_eq!(restored.archived_at, None);
    }

    #[tokio::test]
    async fn update_changes_name_and_rate_but_never_the_client() {
        let pool = test_pool().await;
        let client_id = a_client(&pool, "Acme").await;
        let project = create(&pool, client_id, "Website", None, now())
            .await
            .unwrap();

        let updated = update(&pool, project.id, "Website v2", Some(80.0), now())
            .await
            .unwrap();

        assert_eq!(updated.name, "Website v2");
        assert_eq!(updated.hourly_rate, Some(80.0));
        assert_eq!(updated.client_id, client_id);
    }

    #[tokio::test]
    async fn operations_on_a_missing_project_report_not_found() {
        let pool = test_pool().await;

        assert!(matches!(
            get(&pool, 404).await.unwrap_err(),
            Error::NotFound {
                entity: "project",
                ..
            }
        ));
        assert!(matches!(
            update(&pool, 404, "x", None, now()).await.unwrap_err(),
            Error::NotFound { .. }
        ));
        assert!(matches!(
            archive(&pool, 404, now()).await.unwrap_err(),
            Error::NotFound { .. }
        ));
    }
}
