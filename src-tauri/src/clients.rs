//! Clients. Archived, never deleted (`CONTEXT.md`): hours hang off a client's
//! projects, so a delete would silently rewrite history.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};
use crate::text;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub id: i64,
    pub name: String,
    pub notes: Option<String>,
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT id, name, notes, archived_at, created_at, updated_at FROM clients";

pub async fn list(pool: &SqlitePool, include_archived: bool) -> Result<Vec<Client>> {
    let sql = if include_archived {
        format!("{SELECT} ORDER BY name COLLATE NOCASE")
    } else {
        format!("{SELECT} WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE")
    };

    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Client> {
    sqlx::query_as(&format!("{SELECT} WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| Error::not_found("client", id))
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    notes: Option<&str>,
    now: DateTime<Utc>,
) -> Result<Client> {
    let name = text::required(name, ValidationCode::NameRequired)?;

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO clients (name, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind(name)
    .bind(text::optional(notes))
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await?;

    get(pool, id).await
}

pub async fn update(
    pool: &SqlitePool,
    id: i64,
    name: &str,
    notes: Option<&str>,
    now: DateTime<Utc>,
) -> Result<Client> {
    let name = text::required(name, ValidationCode::NameRequired)?;

    let affected = sqlx::query("UPDATE clients SET name = ?, notes = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(text::optional(notes))
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(Error::not_found("client", id));
    }
    get(pool, id).await
}

/// Archiving is idempotent: the original archive instant is kept, because it is
/// a fact about when work stopped rather than about the last button press.
pub async fn archive(pool: &SqlitePool, id: i64, now: DateTime<Utc>) -> Result<Client> {
    set_archived(pool, id, Some(now), now).await
}

pub async fn restore(pool: &SqlitePool, id: i64, now: DateTime<Utc>) -> Result<Client> {
    set_archived(pool, id, None, now).await
}

async fn set_archived(
    pool: &SqlitePool,
    id: i64,
    archived_at: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Result<Client> {
    crate::archive::set_archived(pool, "clients", "client", id, archived_at, now).await?;
    get(pool, id).await
}

// -- Command layer ----------------------------------------------------------

#[tauri::command]
pub async fn list_clients(db: State<'_, Db>, include_archived: bool) -> Result<Vec<Client>> {
    list(&db.0, include_archived).await
}

#[tauri::command]
pub async fn get_client(db: State<'_, Db>, id: i64) -> Result<Client> {
    get(&db.0, id).await
}

#[tauri::command]
pub async fn create_client(
    db: State<'_, Db>,
    name: String,
    notes: Option<String>,
) -> Result<Client> {
    create(&db.0, &name, notes.as_deref(), Utc::now()).await
}

#[tauri::command]
pub async fn update_client(
    db: State<'_, Db>,
    id: i64,
    name: String,
    notes: Option<String>,
) -> Result<Client> {
    update(&db.0, id, &name, notes.as_deref(), Utc::now()).await
}

#[tauri::command]
pub async fn archive_client(db: State<'_, Db>, id: i64) -> Result<Client> {
    archive(&db.0, id, Utc::now()).await
}

#[tauri::command]
pub async fn restore_client(db: State<'_, Db>, id: i64) -> Result<Client> {
    restore(&db.0, id, Utc::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_support::{at, now};

    #[tokio::test]
    async fn create_trims_the_name_and_normalises_empty_notes() {
        let pool = test_pool().await;

        let client = create(&pool, "  Acme  ", Some("   "), now()).await.unwrap();

        assert_eq!(client.name, "Acme");
        assert_eq!(client.notes, None);
        assert_eq!(client.archived_at, None);
    }

    #[tokio::test]
    async fn create_rejects_a_blank_name() {
        let pool = test_pool().await;

        let error = create(&pool, "   ", None, now()).await.unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::NameRequired
            }
        ));
    }

    #[tokio::test]
    async fn archived_clients_are_hidden_from_the_default_list_but_still_exist() {
        let pool = test_pool().await;
        let client = create(&pool, "Acme", None, now()).await.unwrap();

        archive(&pool, client.id, now()).await.unwrap();

        assert!(list(&pool, false).await.unwrap().is_empty());
        assert_eq!(list(&pool, true).await.unwrap().len(), 1);
        assert!(get(&pool, client.id).await.is_ok(), "archiving is not deleting");
    }

    #[tokio::test]
    async fn archiving_twice_keeps_the_first_archive_instant() {
        let pool = test_pool().await;
        let client = create(&pool, "Acme", None, now()).await.unwrap();

        let first = archive(&pool, client.id, now()).await.unwrap();
        let second = archive(&pool, client.id, at("2026-09-01T00:00:00Z")).await.unwrap();

        assert_eq!(first.archived_at, second.archived_at);
    }

    #[tokio::test]
    async fn restoring_brings_a_client_back_into_pickers() {
        let pool = test_pool().await;
        let client = create(&pool, "Acme", None, now()).await.unwrap();
        archive(&pool, client.id, now()).await.unwrap();

        let restored = restore(&pool, client.id, now()).await.unwrap();

        assert_eq!(restored.archived_at, None);
        assert_eq!(list(&pool, false).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn list_is_ordered_case_insensitively_by_name() {
        let pool = test_pool().await;
        for name in ["zeta", "Alpha", "beta"] {
            create(&pool, name, None, now()).await.unwrap();
        }

        let names: Vec<String> = list(&pool, false)
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.name)
            .collect();

        assert_eq!(names, ["Alpha", "beta", "zeta"]);
    }

    #[tokio::test]
    async fn operations_on_a_missing_client_report_not_found() {
        let pool = test_pool().await;

        assert!(matches!(
            get(&pool, 404).await.unwrap_err(),
            Error::NotFound { entity: "client", id: 404 }
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
