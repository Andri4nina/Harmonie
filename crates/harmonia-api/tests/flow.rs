//! Parcours complet contre un vrai PostgreSQL.
//!
//! Lancé seulement si `TEST_DATABASE_URL` est défini, par exemple :
//!
//! ```text
//! TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres cargo test -p harmonia-api --test flow
//! ```
//!
//! Chaque exécution travaille dans un schéma neuf, supprimé à la fin : la base
//! visée n'est pas modifiée.

use std::str::FromStr;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use harmonia_api::config::{Config, StorageConfig};
use harmonia_api::{AppState, MIGRATOR, router};
use harmonia_audio::features::{Features, Frames, SCHEMA};
use harmonia_theory::Chord;
use http_body_util::BodyExt;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde_json::{Value, json};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use tower::ServiceExt;
use uuid::Uuid;

const SECRET: &str = "secret-de-test-suffisamment-long-pour-hs256";
const WORKER: &str = "jeton-worker-de-test-0123456789abcdef";

fn token(user: Uuid) -> String {
    let claims = json!({ "sub": user, "email": "musicien@example.org", "aud": "authenticated", "exp": chrono::Utc::now().timestamp() + 600 });
    encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(SECRET.as_bytes())).unwrap()
}

struct Api {
    app: Router,
    pool: sqlx::PgPool,
}

impl Api {
    async fn send(&self, request: Request<Body>) -> (StatusCode, Value, Vec<u8>) {
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes().to_vec();
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, json, bytes)
    }

    async fn user(&self, method: &str, path: &str, user: Uuid, body: Option<Value>) -> (StatusCode, Value) {
        let mut request = Request::builder().method(method).uri(path).header("authorization", format!("Bearer {}", token(user)));
        if body.is_some() {
            request = request.header("content-type", "application/json");
        }
        let body = body.map_or(Body::empty(), |b| Body::from(b.to_string()));
        let (status, json, _) = self.send(request.body(body).unwrap()).await;
        (status, json)
    }

    async fn worker(&self, path: &str, body: Value) -> (StatusCode, Value) {
        let request = Request::post(path)
            .header("authorization", format!("Bearer {WORKER}"))
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let (status, json, _) = self.send(request).await;
        (status, json)
    }

    async fn upload(&self, user: Uuid, name: &str, data: &[u8]) -> (StatusCode, Value) {
        let boundary = "frontiere-harmonie";
        let mut body = Vec::new();
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nMon morceau\r\n").as_bytes());
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: audio/wav\r\n\r\n").as_bytes());
        body.extend(data);
        body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
        let request = Request::post("/v1/tracks")
            .header("authorization", format!("Bearer {}", token(user)))
            .header("content-type", format!("multipart/form-data; boundary={boundary}"))
            .body(Body::from(body))
            .unwrap();
        let (status, json, _) = self.send(request).await;
        (status, json)
    }
}

/// Descripteurs idéaux d'une progression C G Am F répétée (120 BPM).
fn features() -> Features {
    let mut frames = Frames { boundaries: vec![0.0], chroma: vec![], bass_chroma: vec![], rms: vec![], onset_strength: vec![], on_beat: vec![] };
    for name in ["C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "F", "C"] {
        let chord: Chord = name.parse().unwrap();
        let mut chroma = [0.02; 12];
        for note in chord.notes() {
            chroma[note.pitch_class().value() as usize] = 1.0;
        }
        let mut bass = [0.0; 12];
        bass[chord.root.pitch_class().value() as usize] = 1.0;
        for beat in 0..4 {
            frames.chroma.push(chroma);
            frames.bass_chroma.push(bass);
            frames.rms.push(1.0);
            frames.onset_strength.push(if beat == 0 { 1.0 } else { 0.5 });
            frames.on_beat.push(true);
            frames.boundaries.push(frames.boundaries.last().unwrap() + 0.5);
        }
    }
    Features { schema: SCHEMA, duration_s: 24.0, sample_rate: 22050, tuning_cents: 0.0, beats_tracked: true, pulse_clarity: 0.8, pitch: None, frames }
}

#[tokio::test]
async fn full_analysis_cycle() {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("TEST_DATABASE_URL absent : test d'intégration ignoré");
        return;
    };
    let schema = format!("test_{}", Uuid::new_v4().simple());
    let admin = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    sqlx::query(sqlx::AssertSqlSafe(format!("CREATE SCHEMA {schema}"))).execute(&admin).await.unwrap();
    let options = PgConnectOptions::from_str(&url).unwrap().options([("search_path", schema.as_str())]);
    let pool = PgPoolOptions::new().max_connections(4).connect_with(options).await.unwrap();

    let result = tokio::spawn(run(pool.clone())).await;
    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!("DROP SCHEMA {schema} CASCADE"))).execute(&admin).await.unwrap();
    if let Err(panic) = result {
        std::panic::resume_unwind(panic.into_panic());
    }
}

async fn run(pool: sqlx::PgPool) {
    MIGRATOR.run(&pool).await.unwrap();
    // Migrations idempotentes : un second passage ne fait rien.
    MIGRATOR.run(&pool).await.unwrap();

    let storage_dir = std::env::temp_dir().join(format!("harmonie-flow-{}", Uuid::new_v4()));
    let config = Config {
        database_url: String::new(),
        port: 0,
        cors_origins: vec![],
        worker_token: WORKER.into(),
        supabase_url: None,
        jwt_secret: Some(SECRET.into()),
        storage: StorageConfig::Local { dir: storage_dir.clone() },
        max_upload_bytes: 1024 * 1024,
    };
    let api = Api { app: router(AppState::new(pool.clone(), config).unwrap()), pool };
    let alice = Uuid::new_v4();
    let bob = Uuid::new_v4();
    let audio = b"RIFF....WAVEfmt fausses-donnees-audio";

    // Santé.
    let (status, health, _) = api.send(Request::get("/health").body(Body::empty()).unwrap()).await;
    assert_eq!((status, &health["database"]), (StatusCode::OK, &json!(true)));

    // Dépôt : le morceau est créé et son analyse mise en file.
    assert_eq!(api.upload(alice, "virus.exe", audio).await.0, StatusCode::BAD_REQUEST);
    let (status, track) = api.upload(alice, "demo.wav", audio).await;
    assert_eq!(status, StatusCode::CREATED, "{track}");
    assert_eq!(track["title"], "Mon morceau");
    assert_eq!(track["status"], "queued");
    let track_id = track["id"].as_str().unwrap().to_string();

    // Chacun ne voit que ses morceaux.
    assert_eq!(api.user("GET", "/v1/tracks", alice, None).await.1.as_array().unwrap().len(), 1);
    assert_eq!(api.user("GET", "/v1/tracks", bob, None).await.1.as_array().unwrap().len(), 0);
    assert_eq!(api.user("GET", &format!("/v1/tracks/{track_id}"), bob, None).await.0, StatusCode::NOT_FOUND);
    assert_eq!(api.user("GET", "/v1/me", alice, None).await.1["display_name"], "musicien");

    // Un worker réclame le job ; un second n'obtient rien.
    let (status, job) = api.worker("/internal/jobs/claim", json!({ "worker_id": "w1" })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(job["track_id"], track_id.as_str());
    assert_eq!(api.worker("/internal/jobs/claim", json!({ "worker_id": "w2" })).await.0, StatusCode::NO_CONTENT);
    let job_id = job["job_id"].as_str().unwrap().to_string();

    // Il télécharge l'audio par l'API et signale sa progression.
    let request = Request::get(format!("/internal/jobs/{job_id}/audio")).header("authorization", format!("Bearer {WORKER}")).body(Body::empty()).unwrap();
    let (status, _, bytes) = api.send(request).await;
    assert_eq!((status, bytes.as_slice()), (StatusCode::OK, audio.as_slice()));
    let beat = json!({ "worker_id": "w1", "progress": 0.5, "stage": "chroma" });
    assert_eq!(api.worker(&format!("/internal/jobs/{job_id}/heartbeat"), beat).await.0, StatusCode::NO_CONTENT);
    let intruder = json!({ "worker_id": "w2", "progress": 0.5, "stage": "chroma" });
    assert_eq!(api.worker(&format!("/internal/jobs/{job_id}/heartbeat"), intruder).await.0, StatusCode::CONFLICT);
    assert_eq!(api.user("GET", &format!("/v1/tracks/{track_id}"), alice, None).await.1["progress"], 0.5);

    // Il rend les descripteurs : l'API les interprète.
    let done = json!({ "worker_id": "w1", "worker_version": "1.3.0", "features": features() });
    let (status, summary) = api.worker(&format!("/internal/jobs/{job_id}/complete"), done).await;
    assert_eq!(status, StatusCode::OK, "{summary}");
    let (status, result) = api.user("GET", &format!("/v1/tracks/{track_id}/analysis"), alice, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["track"]["status"], "succeeded");
    assert_eq!(result["track"]["duration_ms"], 24_000);
    let events = result["analysis"]["events"].as_array().unwrap();
    let chords: Vec<&str> = events.iter().filter(|e| e["feature"] == "chord").map(|e| e["payload"]["chord"].as_str().unwrap()).collect();
    assert_eq!(chords[..4], ["C", "G", "Am", "F"]);
    assert!(events.iter().any(|e| e["feature"] == "key" && e["payload"]["key"] == "C major"));
    assert_eq!(result["analysis"]["summary"]["tuning"]["a4_hz"], 440.0);

    // Correction manuelle : l'analyse n'est pas réécrite, la lecture l'est.
    let second = events.iter().filter(|e| e["feature"] == "chord").nth(1).unwrap()["id"].as_str().unwrap().to_string();
    let path = format!("/v1/tracks/{track_id}/corrections");
    let bad = json!({ "action": "replace", "event_id": second, "payload": { "chord": "pas un accord" } });
    assert_eq!(api.user("POST", &path, alice, Some(bad)).await.0, StatusCode::BAD_REQUEST);
    let fix = json!({ "action": "replace", "event_id": second, "payload": { "chord": "G7" } });
    assert_eq!(api.user("POST", &path, alice, Some(fix.clone())).await.0, StatusCode::CREATED);
    assert_eq!(api.user("POST", &path, bob, Some(fix)).await.0, StatusCode::NOT_FOUND);
    let corrected = api.user("GET", &format!("/v1/tracks/{track_id}/analysis"), alice, None).await.1;
    let event = corrected["analysis"]["events"].as_array().unwrap().iter().find(|e| e["id"] == second.as_str()).unwrap().clone();
    assert_eq!((event["payload"]["chord"].as_str(), event["certainty"].as_str()), (Some("G7"), Some("corrected")));
    let stored: String = sqlx::query_scalar("SELECT payload->>'chord' FROM analysis_events WHERE id = $1")
        .bind(second[1..].parse::<i64>().unwrap())
        .fetch_one(&api.pool)
        .await
        .unwrap();
    assert_eq!(stored, "G");

    // Échecs : nouvelle tentative, puis échec définitif après trois essais.
    let (_, second_track) = api.upload(alice, "autre.mp3", audio).await;
    for attempt in 1..=3 {
        let (status, job) = api.worker("/internal/jobs/claim", json!({ "worker_id": "w1" })).await;
        assert_eq!(status, StatusCode::OK, "tentative {attempt}");
        assert_eq!(job["attempt"], attempt);
        let id = job["job_id"].as_str().unwrap();
        let (_, outcome) = api.worker(&format!("/internal/jobs/{id}/fail"), json!({ "worker_id": "w1", "error": "décodage impossible" })).await;
        assert_eq!(outcome["status"], if attempt < 3 { "queued" } else { "failed" });
    }
    let failed = api.user("GET", &format!("/v1/tracks/{}", second_track["id"].as_str().unwrap()), alice, None).await.1;
    assert_eq!((failed["status"].as_str(), failed["error"].as_str()), (Some("failed"), Some("décodage impossible")));

    // Progrès de l'oreille : chacun les siens, et la fiche la plus avancée l'emporte.
    let card = |seen: u32| json!({ "item": "interval:P5:asc", "ease": 2.5, "streak": 1, "seen": seen, "correct": 1, "interval_ms": 60000, "due_ms": 0 });
    let put = |user: Uuid, body: Value| {
        Request::put("/v1/ear/cards")
            .header("authorization", format!("Bearer {}", token(user)))
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };
    assert_eq!(api.send(put(alice, json!([card(5)]))).await.0, StatusCode::NO_CONTENT);
    assert_eq!(api.send(put(alice, json!([card(2)]))).await.0, StatusCode::NO_CONTENT);
    let (_, cards) = api.user("GET", "/v1/ear/cards", alice, None).await;
    assert_eq!(cards[0]["seen"], 5, "une fiche moins avancée n'écrase pas la plus récente");
    assert_eq!(api.user("GET", "/v1/ear/cards", bob, None).await.1.as_array().unwrap().len(), 0);
    let bad = json!([{ "item": "x", "ease": 2.5, "streak": 0, "seen": 1, "correct": 3, "interval_ms": 0, "due_ms": 0 }]);
    assert_eq!(api.send(put(alice, bad)).await.0, StatusCode::BAD_REQUEST);

    // Documents synchronisés : la modification la plus récente l'emporte,
    // la réponse renvoie la version gardée, chacun ne voit que les siens.
    let doc = |user: Uuid, key: &str, body: Value| {
        Request::put(format!("/v1/sync/{key}"))
            .header("authorization", format!("Bearer {}", token(user)))
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };
    let (status, kept, _) = api.send(doc(alice, "settings", json!({ "value": { "a4": 442 }, "modified_ms": 2000 }))).await;
    assert_eq!((status, kept["value"]["a4"].as_i64()), (StatusCode::OK, Some(442)));
    let (_, kept, _) = api.send(doc(alice, "settings", json!({ "value": { "a4": 440 }, "modified_ms": 1000 }))).await;
    assert_eq!(kept["value"]["a4"], 442, "une modification plus ancienne n'écrase pas");
    assert_eq!(kept["modified_ms"], 2000);
    let (_, kept, _) = api.send(doc(alice, "settings", json!({ "value": { "a4": 415 }, "modified_ms": 3000 }))).await;
    assert_eq!(kept["value"]["a4"], 415);
    let (_, all) = api.user("GET", "/v1/sync", alice, None).await;
    assert_eq!(all.as_array().unwrap().len(), 1);
    assert_eq!(api.user("GET", "/v1/sync", bob, None).await.1.as_array().unwrap().len(), 0);
    assert_eq!(api.send(doc(alice, "mots-de-passe", json!({ "value": {}, "modified_ms": 1 }))).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(api.send(doc(alice, "settings", json!({ "value": [1, 2], "modified_ms": 1 }))).await.0, StatusCode::BAD_REQUEST);

    let _ = std::fs::remove_dir_all(storage_dir);
}
