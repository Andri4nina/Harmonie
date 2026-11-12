//! File d'analyse, côté workers (routes `/internal`, protégées par
//! `WORKER_TOKEN`).
//!
//! 1. `claim` : le worker réclame le plus ancien job en attente
//!    (`FOR UPDATE SKIP LOCKED` : deux workers n'obtiennent jamais le même).
//!    Au passage, un job dont le worker ne donne plus signe de vie depuis
//!    [`STALE_AFTER`] est remis en file, ou marqué en échec s'il a épuisé
//!    ses tentatives.
//! 2. `audio` : le worker télécharge le fichier par l'API (il n'a aucun accès
//!    direct au stockage ni à la base).
//! 3. `heartbeat` : progression, au moins toutes les 30 secondes.
//! 4. `complete` : le worker envoie les descripteurs ; l'API les interprète
//!    (`harmonia-audio`) et enregistre les événements.
//! 5. `fail` : nouvelle tentative, ou échec définitif.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use harmonia_audio::{Features, Params, analyze};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::AppState;
use crate::auth::Worker;
use crate::error::{ApiError, ApiResult};
use crate::events::{self, certainty_name};

/// Délai sans signe de vie au-delà duquel un job est repris.
pub const STALE_AFTER: &str = "2 minutes";

/// Job réclamé : identifiant, morceau, mode, portion, numéro de tentative.
type ClaimedJob = (Uuid, Uuid, String, Option<i32>, Option<i32>, i32);

#[derive(Deserialize)]
pub struct Claim {
    worker_id: String,
}

pub async fn claim(State(state): State<AppState>, _: Worker, Json(input): Json<Claim>) -> ApiResult<Response> {
    if input.worker_id.is_empty() || input.worker_id.len() > 100 {
        return Err(ApiError::BadRequest("worker_id invalide".into()));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "UPDATE analysis_jobs
         SET status = CASE WHEN attempt >= max_attempts THEN 'failed' ELSE 'queued' END,
             error = CASE WHEN attempt >= max_attempts THEN 'worker sans signe de vie' ELSE error END,
             finished_at = CASE WHEN attempt >= max_attempts THEN now() ELSE NULL END,
             worker_id = NULL
         WHERE status = 'running' AND heartbeat_at < now() - interval '{STALE_AFTER}'"
    )))
    .execute(&mut *tx)
    .await?;
    let job: Option<ClaimedJob> = sqlx::query_as(
        "UPDATE analysis_jobs
         SET status = 'running', attempt = attempt + 1, worker_id = $1, heartbeat_at = now(),
             started_at = COALESCE(started_at, now()), stage = 'decode', progress = 0, error = NULL
         WHERE id = (
             SELECT id FROM analysis_jobs WHERE status = 'queued'
             ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
         )
         RETURNING id, track_id, mode, range_start_ms, range_end_ms, attempt",
    )
    .bind(&input.worker_id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(match job {
        None => StatusCode::NO_CONTENT.into_response(),
        Some((id, track_id, mode, start, end, attempt)) => Json(json!({
            "job_id": id,
            "track_id": track_id,
            "mode": mode,
            "range_start_ms": start,
            "range_end_ms": end,
            "attempt": attempt,
            "audio_path": format!("/internal/jobs/{id}/audio"),
        }))
        .into_response(),
    })
}

/// Vérifie que le job est en cours et appartient à ce worker ; renvoie son morceau.
async fn running_job(state: &AppState, id: Uuid, worker_id: Option<&str>) -> ApiResult<Uuid> {
    let row: Option<(Uuid, String, Option<String>)> =
        sqlx::query_as("SELECT track_id, status, worker_id FROM analysis_jobs WHERE id = $1").bind(id).fetch_optional(&state.pool).await?;
    let (track_id, status, owner) = row.ok_or(ApiError::NotFound("job"))?;
    if status != "running" || worker_id.is_some_and(|w| owner.as_deref() != Some(w)) {
        return Err(ApiError::Conflict("ce job n'est plus attribué à ce worker".into()));
    }
    Ok(track_id)
}

pub async fn audio(State(state): State<AppState>, _: Worker, Path(id): Path<Uuid>) -> ApiResult<Response> {
    let track_id = running_job(&state, id, None).await?;
    crate::routes::original_audio(&state, track_id).await
}

#[derive(Deserialize)]
pub struct Heartbeat {
    worker_id: String,
    progress: f32,
    stage: String,
}

pub async fn heartbeat(State(state): State<AppState>, _: Worker, Path(id): Path<Uuid>, Json(input): Json<Heartbeat>) -> ApiResult<StatusCode> {
    if !(0.0..=1.0).contains(&input.progress) {
        return Err(ApiError::BadRequest("progress doit être entre 0 et 1".into()));
    }
    let updated = sqlx::query(
        "UPDATE analysis_jobs SET heartbeat_at = now(), progress = $3, stage = $4
         WHERE id = $1 AND worker_id = $2 AND status = 'running'",
    )
    .bind(id)
    .bind(&input.worker_id)
    .bind(input.progress)
    .bind(input.stage.chars().take(40).collect::<String>())
    .execute(&state.pool)
    .await?
    .rows_affected();
    if updated == 0 { Err(ApiError::Conflict("ce job n'est plus attribué à ce worker".into())) } else { Ok(StatusCode::NO_CONTENT) }
}

#[derive(Deserialize)]
pub struct Complete {
    worker_id: String,
    worker_version: Option<String>,
    features: Features,
}

pub async fn complete(State(state): State<AppState>, _: Worker, Path(id): Path<Uuid>, Json(input): Json<Complete>) -> ApiResult<Json<serde_json::Value>> {
    let track_id = running_job(&state, id, Some(&input.worker_id)).await?;
    // Interprétation musicale : hors du fil asynchrone, elle calcule.
    let features = input.features;
    let analysis = tokio::task::spawn_blocking(move || analyze(&features, &Params::default()))
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?
        .map_err(|e| ApiError::BadRequest(format!("descripteurs invalides : {e}")))?;
    let new_events = events::from_analysis(&analysis);

    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM analysis_events WHERE job_id = $1").bind(id).execute(&mut *tx).await?;
    for event in &new_events {
        sqlx::query(
            "INSERT INTO analysis_events (job_id, track_id, feature, start_ms, end_ms, confidence, certainty, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(id)
        .bind(track_id)
        .bind(event.feature)
        .bind(event.start_ms)
        .bind(event.end_ms)
        .bind(event.confidence)
        .bind(certainty_name(event.certainty))
        .bind(&event.payload)
        .execute(&mut *tx)
        .await?;
    }
    let versions = json!({ "harmonia-audio": env!("CARGO_PKG_VERSION"), "worker": input.worker_version });
    sqlx::query(
        "UPDATE analysis_jobs SET status = 'succeeded', stage = 'done', progress = 1, finished_at = now(),
             summary = $2, engine_versions = $3
         WHERE id = $1",
    )
    .bind(id)
    .bind(events::summary(&analysis))
    .bind(versions)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE tracks SET duration_ms = $2 WHERE id = $1")
        .bind(track_id)
        .bind(i32::try_from(analysis.duration_ms).unwrap_or(i32::MAX))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "events": new_events.len() })))
}

#[derive(Deserialize)]
pub struct Fail {
    worker_id: String,
    error: String,
}

pub async fn fail(State(state): State<AppState>, _: Worker, Path(id): Path<Uuid>, Json(input): Json<Fail>) -> ApiResult<Json<serde_json::Value>> {
    running_job(&state, id, Some(&input.worker_id)).await?;
    let status: String = sqlx::query_scalar(
        "UPDATE analysis_jobs
         SET status = CASE WHEN attempt >= max_attempts THEN 'failed' ELSE 'queued' END,
             finished_at = CASE WHEN attempt >= max_attempts THEN now() ELSE NULL END,
             error = $2, worker_id = NULL
         WHERE id = $1 RETURNING status",
    )
    .bind(id)
    .bind(input.error.chars().take(2000).collect::<String>())
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(json!({ "status": status })))
}
