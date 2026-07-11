//! Supabase auth adapter. Talks to the GoTrue endpoints over HTTP, keeps
//! the session (access + refresh tokens), and refreshes it as needed. This
//! is the account layer the social backend will ride on: once signed in,
//! `access_token()` yields a bearer token for RLS-protected data calls.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::RwLock;
use walltch_core::ports::Storage;

pub const SUPABASE_URL: &str = "https://rysxmliofaigilemghse.supabase.co";
pub const SUPABASE_KEY: &str = "sb_publishable_1soR1TSCz-Mn5tI3rtkXRA_W0Lvak4i";
const SESSION_KEY: &str = "session.json";
/// Refresh a bit before the token actually expires, to avoid racing it.
const EXPIRY_SKEW_SECS: u64 = 60;
/// Fixed loopback the OAuth redirect comes back to; must be in Supabase's
/// redirect allowlist as http://localhost:8788/callback.
const OAUTH_PORT: u16 = 8788;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    access_token: String,
    refresh_token: String,
    /// Unix seconds when the access token stops being valid.
    expires_at: u64,
    user_id: String,
    email: Option<String>,
}

/// What the frontend needs to render the auth state.
#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub signed_in: bool,
    pub email: Option<String>,
    /// Sign-up succeeded but the address must be confirmed before sign-in.
    pub needs_confirmation: bool,
}

pub struct SupabaseAuth {
    http: Client,
    storage: Arc<dyn Storage>,
    session: RwLock<Option<Session>>,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

impl SupabaseAuth {
    pub async fn load(storage: Arc<dyn Storage>) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_default();
        let session = storage
            .read(SESSION_KEY)
            .await
            .ok()
            .flatten()
            .and_then(|bytes| serde_json::from_slice::<Session>(&bytes).ok());
        let auth = Self {
            http,
            storage,
            session: RwLock::new(session),
        };
        // Validate/refresh a restored session so a stale token doesn't linger.
        if auth.session.read().await.is_some() {
            let _ = auth.access_token().await;
        }
        auth
    }

    pub async fn status(&self) -> AuthStatus {
        let session = self.session.read().await;
        AuthStatus {
            signed_in: session.is_some(),
            email: session.as_ref().and_then(|s| s.email.clone()),
            needs_confirmation: false,
        }
    }

    pub async fn is_signed_in(&self) -> bool {
        self.session.read().await.is_some()
    }

    pub async fn user_id(&self) -> Option<String> {
        self.session
            .read()
            .await
            .as_ref()
            .map(|s| s.user_id.clone())
    }

    /// A valid bearer token, refreshing first if the current one is stale.
    /// `None` means signed out (or the refresh failed and we cleared it).
    pub async fn access_token(&self) -> Option<String> {
        {
            let session = self.session.read().await;
            let session = session.as_ref()?;
            if session.expires_at > now_secs() + EXPIRY_SKEW_SECS {
                return Some(session.access_token.clone());
            }
        }
        self.refresh().await
    }

    pub async fn sign_up(&self, email: &str, password: &str) -> Result<AuthStatus, String> {
        let value = self
            .post_auth("signup", json!({ "email": email, "password": password }))
            .await?;
        // Confirmations off → a session comes back and we're signed in.
        // Confirmations on → only a user, so the address must be verified.
        if value.get("access_token").is_some() {
            self.store(session_from_grant(&value)?).await?;
            Ok(self.status().await)
        } else {
            Ok(AuthStatus {
                signed_in: false,
                email: Some(email.to_owned()),
                needs_confirmation: true,
            })
        }
    }

    pub async fn sign_in(&self, email: &str, password: &str) -> Result<AuthStatus, String> {
        let value = self
            .post_auth(
                "token?grant_type=password",
                json!({ "email": email, "password": password }),
            )
            .await?;
        self.store(session_from_grant(&value)?).await?;
        Ok(self.status().await)
    }

    /// Google sign-in via a loopback + PKCE handshake: open the browser at
    /// Supabase's authorize URL, catch the redirect on a local port, and
    /// exchange the returned code for a session. No custom URL scheme, so it
    /// works the same in dev and packaged.
    pub async fn sign_in_with_google(&self, app: &AppHandle) -> Result<AuthStatus, String> {
        let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT))
            .await
            .map_err(|_| format!("Port {OAUTH_PORT} is busy — close what's using it and retry."))?;

        let verifier = random_verifier();
        let challenge = code_challenge(&verifier);
        let redirect = format!("http://localhost:{OAUTH_PORT}/callback");
        let redirect_enc = utf8_percent_encode(&redirect, NON_ALPHANUMERIC);
        let authorize = format!(
            "{SUPABASE_URL}/auth/v1/authorize?provider=google\
             &code_challenge={challenge}&code_challenge_method=s256&redirect_to={redirect_enc}"
        );

        app.opener()
            .open_url(authorize, None::<String>)
            .map_err(|e| e.to_string())?;

        // Give the whole browser dance a couple of minutes, then give up.
        let code = tokio::time::timeout(Duration::from_secs(180), accept_code(&listener))
            .await
            .map_err(|_| "Timed out waiting for Google sign-in.".to_owned())??;

        let value = self
            .post_auth(
                "token?grant_type=pkce",
                json!({ "auth_code": code, "code_verifier": verifier }),
            )
            .await?;
        self.store(session_from_grant(&value)?).await?;
        Ok(self.status().await)
    }

    pub async fn sign_out(&self) -> Result<(), String> {
        if let Some(token) = self
            .session
            .read()
            .await
            .as_ref()
            .map(|s| s.access_token.clone())
        {
            // Best-effort server-side revoke; local sign-out happens regardless.
            let _ = self
                .http
                .post(format!("{SUPABASE_URL}/auth/v1/logout"))
                .header("apikey", SUPABASE_KEY)
                .bearer_auth(token)
                .send()
                .await;
        }
        *self.session.write().await = None;
        self.storage
            .delete(SESSION_KEY)
            .await
            .map_err(|e| e.to_string())
    }

    async fn refresh(&self) -> Option<String> {
        let refresh_token = self.session.read().await.as_ref()?.refresh_token.clone();
        let value = self
            .post_auth(
                "token?grant_type=refresh_token",
                json!({ "refresh_token": refresh_token }),
            )
            .await
            .ok()?;
        let session = session_from_grant(&value).ok()?;
        let token = session.access_token.clone();
        // A failed persist shouldn't drop a good in-memory session.
        let _ = self.store(session).await;
        Some(token)
    }

    async fn store(&self, session: Session) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(&session).map_err(|e| e.to_string())?;
        self.storage
            .write(SESSION_KEY, &bytes)
            .await
            .map_err(|e| e.to_string())?;
        *self.session.write().await = Some(session);
        Ok(())
    }

    async fn post_auth(
        &self,
        path: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
        let response = self
            .http
            .post(format!("{SUPABASE_URL}/auth/v1/{path}"))
            .header("apikey", SUPABASE_KEY)
            .header("content-type", "application/json")
            .body(bytes)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = response.status();
        let body = response.bytes().await.map_err(|e| e.to_string())?;
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
        if status.is_success() {
            Ok(value)
        } else {
            Err(auth_error_message(&value))
        }
    }
}

fn session_from_grant(value: &serde_json::Value) -> Result<Session, String> {
    let access_token = value["access_token"]
        .as_str()
        .ok_or("missing access token in response")?
        .to_owned();
    let refresh_token = value["refresh_token"]
        .as_str()
        .ok_or("missing refresh token in response")?
        .to_owned();
    let expires_in = value["expires_in"].as_u64().unwrap_or(3600);
    Ok(Session {
        access_token,
        refresh_token,
        expires_at: now_secs() + expires_in,
        user_id: value["user"]["id"].as_str().unwrap_or_default().to_owned(),
        email: value["user"]["email"].as_str().map(str::to_owned),
    })
}

/// A high-entropy PKCE verifier (43 chars of base64url from 32 OS-random bytes).
fn random_verifier() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("os rng unavailable");
    URL_SAFE_NO_PAD.encode(bytes)
}

fn code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Wait for the browser to hit the loopback, answer with a close-me page,
/// and hand back the `code` (or the OAuth error) from the query string.
async fn accept_code(listener: &TcpListener) -> Result<String, String> {
    let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
    let mut buf = [0u8; 4096];
    let read = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..read]);

    let query = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|path| path.split_once('?'))
        .map(|(_, query)| query)
        .unwrap_or_default();

    let mut code = None;
    let mut error = None;
    for pair in query.split('&') {
        match pair.split_once('=') {
            Some(("code", value)) => code = Some(value.to_owned()),
            Some(("error_description", value)) => {
                error = Some(value.replace('+', " "));
            }
            _ => {}
        }
    }

    let page = "<!doctype html><meta charset=utf-8><title>Walltch</title>\
        <body style=\"font-family:system-ui;background:#0e0e12;color:#f3f5fb;\
        display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">\
        <p>You can close this tab and return to Walltch.</p>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{page}",
        page.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;

    if let Some(error) = error {
        return Err(error);
    }
    code.ok_or_else(|| "No sign-in code came back.".to_owned())
}

/// GoTrue reports failures a few different ways; pull out the friendliest.
fn auth_error_message(value: &serde_json::Value) -> String {
    for key in ["error_description", "msg", "message", "error"] {
        if let Some(text) = value[key].as_str() {
            return text.to_owned();
        }
    }
    "authentication failed".to_owned()
}
