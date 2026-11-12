//! Routes des utilisateurs : morceaux, fichiers audio, analyses, corrections.

use axum::Json;
use axum::body::Body;
use axum::extract::{Multipart, Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use harmonia_theory::Chord;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::AppState;
use crate::auth::User;
use crate::error::{ApiError, ApiResult};
use crate::events::{self, Correction, StoredEvent};

/// Formats acceptés : extension et type MIME.
const FORMATS: &[(&str, &str)] = &[
    ("wav", "audio/wav"),
    ("mp3", "audio/mpeg"),
    ("flac", "audio/flac"),
    ("ogg", "audio/ogg"),
    ("opus", "audio/ogg"),
    ("m4a", "audio/mp4"),
    ("aac", "audio/aac"),
    ("webm", "audio/webm"),
];

/// Étapes de l'analyse « basic » (voir docs/ARCHITECTURE.md, § 3).
const BASIC_FEATURES: &[&str] = &["decode", "beats", "chroma", "bass_chroma"];

pub async fn health(State(state): State<AppState>) -> Response {
    let database = sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.pool).await.is_ok();
    let status = if database { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    let body = json!({
        "status": if database { "ok" } else { "degraded" },
        "database": database,
        "storage": state.storage.bucket_name(),
        "version": env!("CARGO_PKG_VERSION"),
    });
    (status, Json(body)).into_response()
}

/// Crée ou met à jour la fiche de l'utilisateur authentifié.
async fn ensure_user(state: &AppState, user: &User) -> ApiResult<()> {
    let display_name = user.email.as_deref().and_then(|email| email.split('@').next()).filter(|name| !name.is_empty()).unwrap_or("Musicien");
    sqlx::query(
        "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email",
    )
    .bind(user.id)
    .bind(&user.email)
    .bind(display_name)
    .execute(&state.pool)
    .await?;
    Ok(())
}

pub async fn me(State(state): State<AppState>, user: User) -> ApiResult<Json<Value>> {
    ensure_user(&state, &user).await?;
    let (display_name, created_at): (String, DateTime<Utc>) =
        sqlx::query_as("SELECT display_name, created_at FROM users WHERE id = $1").bind(user.id).fetch_one(&state.pool).await?;
    Ok(Json(json!({ "id": user.id, "email": user.email, "display_name": display_name, "created_at": created_at })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct TrackRow {
    id: Uuid,
    title: String,
    artist: Option<String>,
    duration_ms: Option<i32>,
    created_at: DateTime<Utc>,
    job_id: Option<Uuid>,
    status: Option<String>,
    stage: Option<String>,
    progress: Option<f32>,
    error: Option<String>,
}

const TRACK_SELECT: &str = "SELECT t.id, t.title, t.artist, t.duration_ms, t.created_at,
        j.id AS job_id, j.status, j.stage, j.progress, j.error
     FROM tracks t
     LEFT JOIN LATERAL (
        SELECT id, status, stage, progress, error FROM analysis_jobs
        WHERE track_id = t.id ORDER BY created_at DESC LIMIT 1
     ) j ON true";

pub async fn list_tracks(State(state): State<AppState>, user: User) -> ApiResult<Json<Vec<TrackRow>>> {
    let rows = sqlx::query_as::<_, TrackRow>(sqlx::AssertSqlSafe(format!("{TRACK_SELECT} WHERE t.owner_id = $1 ORDER BY t.created_at DESC LIMIT 200")))
        .bind(user.id)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

async fn owned_track(state: &AppState, user: &User, id: Uuid) -> ApiResult<TrackRow> {
    sqlx::query_as::<_, TrackRow>(sqlx::AssertSqlSafe(format!("{TRACK_SELECT} WHERE t.id = $1 AND t.owner_id = $2")))
        .bind(id)
        .bind(user.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound("morceau"))
}

pub async fn get_track(State(state): State<AppState>, user: User, Path(id): Path<Uuid>) -> ApiResult<Json<TrackRow>> {
    Ok(Json(owned_track(&state, &user, id).await?))
}

fn format_of(file_name: &str) -> Option<(&'static str, &'static str)> {
    let extension = file_name.rsplit_once('.')?.1.to_ascii_lowercase();
    FORMATS.iter().find(|(ext, _)| *ext == extension).copied()
}

fn multipart_error(error: axum::extract::multipart::MultipartError) -> ApiError {
    if error.status() == StatusCode::PAYLOAD_TOO_LARGE { ApiError::TooLarge } else { ApiError::BadRequest(error.body_text()) }
}

/// Dépôt d'un fichier audio : il est stocké, le morceau créé, l'analyse mise en file.
pub async fn upload_track(State(state): State<AppState>, user: User, mut form: Multipart) -> ApiResult<(StatusCode, Json<TrackRow>)> {
    let mut title: Option<String> = None;
    let mut file: Option<(String, Bytes)> = None;
    while let Some(field) = form.next_field().await.map_err(multipart_error)? {
        match field.name() {
            Some("title") => title = Some(field.text().await.map_err(multipart_error)?.trim().to_string()),
            Some("file") => {
                let name = field.file_name().unwrap_or_default().to_string();
                file = Some((name, field.bytes().await.map_err(multipart_error)?));
            }
            _ => {}
        }
    }
    let (file_name, data) = file.ok_or_else(|| ApiError::BadRequest("champ « file » manquant".into()))?;
    let (extension, content_type) = format_of(&file_name)
        .ok_or_else(|| ApiError::BadRequest("format non pris en charge (wav, mp3, flac, ogg, opus, m4a, aac, webm)".into()))?;
    if data.is_empty() {
        return Err(ApiError::BadRequest("fichier vide".into()));
    }
    let title = title
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| file_name.rsplit_once('.').map_or(file_name.as_str(), |(stem, _)| stem).to_string());
    if title.chars().count() > 200 {
        return Err(ApiError::BadRequest("titre trop long (200 caractères au plus)".into()));
    }

    ensure_user(&state, &user).await?;
    let track_id = Uuid::new_v4();
    let key = format!("tracks/{track_id}/original.{extension}");
    let size = i64::try_from(data.len()).unwrap_or(i64::MAX);
    state.storage.put(&key, data, content_type).await.map_err(|e| ApiError::Unavailable(format!("stockage : {e}")))?;

    let mut tx = state.pool.begin().await?;
    sqlx::query("INSERT INTO tracks (id, owner_id, title, source_kind) VALUES ($1, $2, $3, 'audio')")
        .bind(track_id)
        .bind(user.id)
        .bind(&title)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO audio_assets (track_id, kind, bucket, object_key, content_type, byte_size)
         VALUES ($1, 'original', $2, $3, $4, $5)",
    )
    .bind(track_id)
    .bind(state.storage.bucket_name())
    .bind(&key)
    .bind(content_type)
    .bind(size)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO analysis_jobs (track_id, owner_id, mode, features) VALUES ($1, $2, 'basic', $3)")
        .bind(track_id)
        .bind(user.id)
        .bind(BASIC_FEATURES)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(owned_track(&state, &user, track_id).await?)))
}

/// Le fichier audio d'origine, pour l'écoute synchronisée.
pub async fn track_audio(State(state): State<AppState>, user: User, Path(id): Path<Uuid>) -> ApiResult<Response> {
    owned_track(&state, &user, id).await?;
    original_audio(&state, id).await
}

pub(crate) async fn original_audio(state: &AppState, track_id: Uuid) -> ApiResult<Response> {
    let (key, content_type): (String, String) =
        sqlx::query_as("SELECT object_key, content_type FROM audio_assets WHERE track_id = $1 AND kind = 'original' LIMIT 1")
            .bind(track_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(ApiError::NotFound("fichier audio"))?;
    let data = state.storage.get(&key).await.map_err(|e| ApiError::Unavailable(format!("stockage : {e}")))?;
    Ok(([(header::CONTENT_TYPE, content_type), (header::CACHE_CONTROL, "private, max-age=3600".into())], Body::from(data)).into_response())
}

/// Job terminé : identifiant, résumé, versions des moteurs, date de fin.
type FinishedJob = (Uuid, Option<Value>, Value, Option<DateTime<Utc>>);

/// L'analyse la plus récente réussie, corrections appliquées.
pub async fn track_analysis(State(state): State<AppState>, user: User, Path(id): Path<Uuid>) -> ApiResult<Json<Value>> {
    let track = owned_track(&state, &user, id).await?;
    let job: Option<FinishedJob> = sqlx::query_as(
        "SELECT id, summary, engine_versions, finished_at FROM analysis_jobs
         WHERE track_id = $1 AND status = 'succeeded' ORDER BY finished_at DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let Some((job_id, summary, versions, finished_at)) = job else {
        return Ok(Json(json!({ "track": track, "analysis": null })));
    };
    let stored = sqlx::query_as::<_, StoredEvent>(
        "SELECT id, feature, start_ms, end_ms, confidence, certainty, payload FROM analysis_events WHERE job_id = $1 ORDER BY id",
    )
    .bind(job_id)
    .fetch_all(&state.pool)
    .await?;
    let corrections = sqlx::query_as::<_, Correction>(
        "SELECT id, event_id, action, feature, start_ms, end_ms, payload FROM analysis_corrections
         WHERE track_id = $1 ORDER BY created_at, id",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({
        "track": track,
        "analysis": {
            "job_id": job_id,
            "finished_at": finished_at,
            "engine_versions": versions,
            "summary": summary,
            "events": events::apply(stored, &corrections),
            "corrections": corrections.len(),
        }
    })))
}

#[derive(Deserialize)]
pub struct NewCorrection {
    action: String,
    event_id: Option<String>,
    feature: Option<String>,
    start_ms: Option<i32>,
    end_ms: Option<i32>,
    payload: Option<Value>,
}

/// Une saisie d'accord doit être un accord que le moteur sait lire.
fn validate_payload(feature: &str, payload: &Value) -> ApiResult<()> {
    if feature == "chord" {
        let text = payload.get("chord").and_then(Value::as_str).ok_or_else(|| ApiError::BadRequest("« chord » manquant".into()))?;
        text.parse::<Chord>().map_err(|e| ApiError::BadRequest(format!("accord illisible « {text} » : {e}")))?;
    }
    Ok(())
}

pub async fn add_correction(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<NewCorrection>,
) -> ApiResult<(StatusCode, Json<Correction>)> {
    owned_track(&state, &user, id).await?;
    let event_id = match input.event_id.as_deref() {
        None => None,
        Some(text) => Some(
            text.strip_prefix('e')
                .and_then(|n| n.parse::<i64>().ok())
                .ok_or_else(|| ApiError::BadRequest("seuls les événements analysés (« e… ») peuvent être corrigés".into()))?,
        ),
    };
    // Feature de l'événement visé, qui doit appartenir à ce morceau.
    let target_feature: Option<String> = match event_id {
        Some(event) => Some(
            sqlx::query_scalar("SELECT feature FROM analysis_events WHERE id = $1 AND track_id = $2")
                .bind(event)
                .bind(id)
                .fetch_optional(&state.pool)
                .await?
                .ok_or(ApiError::NotFound("événement"))?,
        ),
        None => None,
    };
    match (input.action.as_str(), event_id, &input.payload) {
        ("delete", Some(_), _) => {}
        ("replace", Some(_), Some(payload)) => validate_payload(target_feature.as_deref().unwrap_or_default(), payload)?,
        ("insert", None, Some(payload)) => {
            let feature = input.feature.as_deref().ok_or_else(|| ApiError::BadRequest("« feature » manquant".into()))?;
            match (input.start_ms, input.end_ms) {
                (Some(start), Some(end)) if start >= 0 && end >= start => {}
                _ => return Err(ApiError::BadRequest("« start_ms » et « end_ms » requis, avec end_ms ≥ start_ms ≥ 0".into())),
            }
            validate_payload(feature, payload)?;
        }
        _ => {
            return Err(ApiError::BadRequest(
                "action invalide : delete (event_id), replace (event_id, payload) ou insert (feature, start_ms, end_ms, payload)".into(),
            ));
        }
    }
    ensure_user(&state, &user).await?;
    let correction = sqlx::query_as::<_, Correction>(
        "INSERT INTO analysis_corrections (track_id, user_id, event_id, action, feature, start_ms, end_ms, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, event_id, action, feature, start_ms, end_ms, payload",
    )
    .bind(id)
    .bind(user.id)
    .bind(event_id)
    .bind(&input.action)
    .bind(if input.action == "insert" { input.feature.as_deref() } else { target_feature.as_deref() })
    .bind(input.start_ms)
    .bind(input.end_ms)
    .bind(&input.payload)
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(correction)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_audio_formats() {
        assert_eq!(format_of("Morceau.MP3"), Some(("mp3", "audio/mpeg")));
        assert_eq!(format_of("a.b.flac"), Some(("flac", "audio/flac")));
        assert_eq!(format_of("script.exe"), None);
        assert_eq!(format_of("sans-extension"), None);
    }

    #[test]
    fn chord_corrections_must_be_readable() {
        assert!(validate_payload("chord", &json!({ "chord": "Am7/G" })).is_ok());
        assert!(validate_payload("chord", &json!({ "chord": "Xyz" })).is_err());
        assert!(validate_payload("chord", &json!({})).is_err());
        assert!(validate_payload("tempo", &json!({ "bpm": 120 })).is_ok());
    }
}
