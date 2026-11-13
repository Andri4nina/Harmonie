//! Données de l'utilisateur synchronisées entre ses appareils : réglages,
//! progrès des cours, projet de Composer. Chaque document est un objet JSON
//! opaque pour le serveur ; l'appareil le modifie hors ligne et l'envoie
//! quand il le peut. En cas de conflit, la modification la plus récente
//! (instant noté par l'appareil) l'emporte, et la réponse renvoie toujours la
//! version gardée pour que l'appareil s'aligne.

use axum::Json;
use axum::extract::{Path, State};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::AppState;
use crate::auth::User;
use crate::error::{ApiError, ApiResult};

/// Documents acceptés.
pub const KEYS: [&str; 3] = ["settings", "lessons", "composer"];

/// Taille maximale d'un document (octets JSON).
const MAX_BYTES: usize = 512 * 1024;

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Document {
    pub key: String,
    pub value: Value,
    pub modified_ms: i64,
}

#[derive(Deserialize)]
pub struct Upload {
    pub value: Value,
    pub modified_ms: i64,
}

pub async fn list(State(state): State<AppState>, user: User) -> ApiResult<Json<Vec<Document>>> {
    let documents = sqlx::query_as::<_, Document>("SELECT key, value, modified_ms FROM user_documents WHERE user_id = $1 ORDER BY key")
        .bind(user.id)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(documents))
}

pub async fn save(State(state): State<AppState>, user: User, Path(key): Path<String>, Json(upload): Json<Upload>) -> ApiResult<Json<Document>> {
    if !KEYS.contains(&key.as_str()) {
        return Err(ApiError::BadRequest(format!("document inconnu : « {key} »")));
    }
    if !upload.value.is_object() {
        return Err(ApiError::BadRequest("le document doit être un objet JSON".into()));
    }
    if upload.value.to_string().len() > MAX_BYTES {
        return Err(ApiError::BadRequest(format!("{} Ko au plus par document", MAX_BYTES / 1024)));
    }
    let now = chrono::Utc::now().timestamp_millis();
    // Une horloge d'appareil très en avance ne doit pas bloquer les autres.
    let modified = upload.modified_ms.clamp(0, now + 60_000);
    crate::routes::ensure_user(&state, &user).await?;
    sqlx::query(
        "INSERT INTO user_documents (user_id, key, value, modified_ms) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, modified_ms = EXCLUDED.modified_ms
         WHERE EXCLUDED.modified_ms > user_documents.modified_ms",
    )
    .bind(user.id)
    .bind(&key)
    .bind(&upload.value)
    .bind(modified)
    .execute(&state.pool)
    .await?;
    let kept = sqlx::query_as::<_, Document>("SELECT key, value, modified_ms FROM user_documents WHERE user_id = $1 AND key = $2")
        .bind(user.id)
        .bind(&key)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(kept))
}
