//! Authentification.
//!
//! - **Utilisateurs** : jeton d'accès Supabase Auth (`Authorization: Bearer …`).
//!   Il est vérifié avec les clés publiques du projet
//!   (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, ES256 ou RS256) ou, pour
//!   les projets qui l'utilisent encore, l'ancien secret HS256. L'identifiant
//!   `sub` du jeton devient celui de l'utilisateur.
//! - **Workers** : secret partagé `WORKER_TOKEN`, comparé en temps constant.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::AppState;
use crate::error::ApiError;

/// Délai minimal entre deux relectures des clés publiques.
const JWKS_REFRESH: Duration = Duration::from_secs(300);

#[derive(Debug, Deserialize)]
struct Claims {
    sub: Uuid,
    email: Option<String>,
}

/// L'utilisateur authentifié d'une requête.
#[derive(Clone, Debug)]
pub struct User {
    pub id: Uuid,
    pub email: Option<String>,
}

pub struct Verifier {
    jwks_url: Option<String>,
    secret: Option<DecodingKey>,
    keys: RwLock<(Option<JwkSet>, Option<Instant>)>,
    http: reqwest::Client,
}

impl Verifier {
    pub fn new(supabase_url: Option<&str>, secret: Option<&str>) -> Verifier {
        Verifier {
            jwks_url: supabase_url.map(|url| format!("{url}/auth/v1/.well-known/jwks.json")),
            secret: secret.map(|s| DecodingKey::from_secret(s.as_bytes())),
            keys: RwLock::new((None, None)),
            http: reqwest::Client::new(),
        }
    }

    fn validation(algorithm: Algorithm) -> Validation {
        let mut validation = Validation::new(algorithm);
        validation.set_audience(&["authenticated"]);
        validation.leeway = 30;
        validation
    }

    async fn public_key(&self, kid: &str) -> Option<DecodingKey> {
        {
            let guard = self.keys.read().await;
            if let Some(jwk) = guard.0.as_ref().and_then(|set| set.find(kid)) {
                return DecodingKey::from_jwk(jwk).ok();
            }
            if guard.1.is_some_and(|at| at.elapsed() < JWKS_REFRESH) {
                return None;
            }
        }
        // Clé inconnue : relecture des clés publiques (rotation possible).
        let url = self.jwks_url.as_ref()?;
        let fetched = async { self.http.get(url).timeout(Duration::from_secs(5)).send().await?.error_for_status()?.json::<JwkSet>().await }.await;
        let mut guard = self.keys.write().await;
        guard.1 = Some(Instant::now());
        match fetched {
            Ok(set) => guard.0 = Some(set),
            Err(error) => tracing::warn!(%error, "lecture des clés publiques Supabase impossible"),
        }
        guard.0.as_ref().and_then(|set| set.find(kid)).and_then(|jwk| DecodingKey::from_jwk(jwk).ok())
    }

    pub async fn verify(&self, token: &str) -> Result<User, ApiError> {
        let header = decode_header(token).map_err(|_| ApiError::Unauthorized)?;
        let claims = match header.alg {
            Algorithm::HS256 => {
                let key = self.secret.as_ref().ok_or(ApiError::Unauthorized)?;
                decode::<Claims>(token, key, &Self::validation(Algorithm::HS256))
            }
            alg @ (Algorithm::ES256 | Algorithm::RS256) => {
                let kid = header.kid.ok_or(ApiError::Unauthorized)?;
                let key = self.public_key(&kid).await.ok_or(ApiError::Unauthorized)?;
                decode::<Claims>(token, &key, &Self::validation(alg))
            }
            _ => return Err(ApiError::Unauthorized),
        }
        .map_err(|_| ApiError::Unauthorized)?
        .claims;
        Ok(User { id: claims.sub, email: claims.email })
    }
}

fn bearer(parts: &Parts) -> Option<&str> {
    parts.headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ").map(str::trim)
}

impl FromRequestParts<AppState> for User {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<User, ApiError> {
        let token = bearer(parts).ok_or(ApiError::Unauthorized)?;
        state.verifier.verify(token).await
    }
}

/// Garde des routes internes réservées aux workers.
pub struct Worker;

/// Égalité en temps constant : la durée ne révèle pas le préfixe commun.
fn same_secret(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl FromRequestParts<AppState> for Worker {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Worker, ApiError> {
        let token = bearer(parts).ok_or(ApiError::Unauthorized)?;
        if same_secret(token.as_bytes(), state.config.worker_token.as_bytes()) { Ok(Worker) } else { Err(ApiError::Forbidden) }
    }
}

pub type SharedVerifier = Arc<Verifier>;

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde_json::json;

    pub const SECRET: &str = "secret-de-test-suffisamment-long-pour-hs256";

    pub fn token(sub: Uuid, audience: &str, expires_in: i64) -> String {
        let exp = chrono::Utc::now().timestamp() + expires_in;
        let claims = json!({ "sub": sub, "email": "test@example.org", "aud": audience, "exp": exp, "role": "authenticated" });
        encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(SECRET.as_bytes())).unwrap()
    }

    #[tokio::test]
    async fn accepts_a_valid_supabase_token() {
        let verifier = Verifier::new(None, Some(SECRET));
        let id = Uuid::new_v4();
        let user = verifier.verify(&token(id, "authenticated", 600)).await.unwrap();
        assert_eq!(user.id, id);
        assert_eq!(user.email.as_deref(), Some("test@example.org"));
    }

    #[tokio::test]
    async fn rejects_expired_foreign_or_forged_tokens() {
        let verifier = Verifier::new(None, Some(SECRET));
        let id = Uuid::new_v4();
        assert!(verifier.verify(&token(id, "authenticated", -600)).await.is_err());
        assert!(verifier.verify(&token(id, "anon", 600)).await.is_err());
        assert!(Verifier::new(None, Some("autre-secret")).verify(&token(id, "authenticated", 600)).await.is_err());
        assert!(verifier.verify("pas-un-jeton").await.is_err());
    }

    #[test]
    fn secrets_are_compared_entirely() {
        assert!(same_secret(b"abcdef", b"abcdef"));
        assert!(!same_secret(b"abcdef", b"abcdeg"));
        assert!(!same_secret(b"abc", b"abcdef"));
    }
}
