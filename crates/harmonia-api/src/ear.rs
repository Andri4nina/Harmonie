//! Progrès de l'entraînement de l'oreille, synchronisés entre appareils.
//!
//! Le calcul (questions, répétition espacée) reste dans le navigateur, via le
//! moteur ; le serveur ne fait que garder les fiches. En cas de conflit entre
//! deux appareils, la fiche qui compte le plus de réponses l'emporte : un
//! appareil resté hors ligne ne peut pas effacer des progrès plus récents.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use harmonia_theory::ear::Card;
use serde_json::Value;

use crate::AppState;
use crate::auth::User;
use crate::error::{ApiError, ApiResult};

/// Nombre maximal de fiches envoyées en une fois.
const MAX_CARDS: usize = 2000;

pub async fn list(State(state): State<AppState>, user: User) -> ApiResult<Json<Vec<Value>>> {
    let cards: Vec<Value> = sqlx::query_scalar("SELECT card FROM ear_cards WHERE user_id = $1 ORDER BY item")
        .bind(user.id)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(cards))
}

pub async fn save(State(state): State<AppState>, user: User, Json(cards): Json<Vec<Card>>) -> ApiResult<StatusCode> {
    if cards.len() > MAX_CARDS {
        return Err(ApiError::BadRequest(format!("{MAX_CARDS} fiches au plus par envoi")));
    }
    if let Some(card) = cards.iter().find(|c| c.item.is_empty() || c.item.len() > 100 || c.correct > c.seen || !c.ease.is_finite()) {
        return Err(ApiError::BadRequest(format!("fiche invalide : « {} »", card.item)));
    }
    crate::routes::ensure_user(&state, &user).await?;
    let mut tx = state.pool.begin().await?;
    for card in &cards {
        let json = serde_json::to_value(card).map_err(|e| ApiError::Internal(e.to_string()))?;
        sqlx::query(
            "INSERT INTO ear_cards (user_id, item, card) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, item) DO UPDATE SET card = EXCLUDED.card, updated_at = now()
             WHERE (EXCLUDED.card->>'seen')::int >= (ear_cards.card->>'seen')::int",
        )
        .bind(user.id)
        .bind(&card.item)
        .bind(json)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
