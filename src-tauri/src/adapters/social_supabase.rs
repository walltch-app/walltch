//! Server-backed social layer. Rides on the Supabase session for a bearer
//! token and talks to PostgREST for the profile, friends, and activity —
//! all guarded by the row-level-security policies on those tables. This is
//! the real implementation the local stub was standing in for.

use std::sync::Arc;
use std::time::Duration;

use reqwest::{Client, Method, StatusCode};
use serde::Deserialize;
use serde_json::{json, Value};
use walltch_core::social::{Friend, FriendActivity, Profile, SocialError};

use super::supabase::{SupabaseAuth, SUPABASE_KEY, SUPABASE_URL};

/// What the player reports when you start watching something.
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ActivityInput {
    pub meta_id: String,
    pub content_type: String,
    pub title: String,
    pub subtitle: String,
    pub poster: Option<String>,
    /// ISO-8601 timestamp from the client, so the feed orders correctly.
    pub updated_at: String,
}

pub struct SupabaseSocial {
    auth: Arc<SupabaseAuth>,
    http: Client,
}

fn backend(msg: impl ToString) -> SocialError {
    SocialError::Backend(msg.to_string())
}

impl SupabaseSocial {
    pub fn new(auth: Arc<SupabaseAuth>) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_default();
        Self { auth, http }
    }

    async fn me(&self) -> Result<String, SocialError> {
        self.auth
            .user_id()
            .await
            .ok_or_else(|| backend("Sign in to manage friends."))
    }

    /// A PostgREST call with the auth headers attached. `prefer` sets the
    /// Prefer header (e.g. return=representation); `body` is sent as JSON.
    async fn rest(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
        prefer: Option<&str>,
    ) -> Result<Value, SocialError> {
        let token = self
            .auth
            .access_token()
            .await
            .ok_or_else(|| backend("Sign in to manage friends."))?;
        let mut req = self
            .http
            .request(method, format!("{SUPABASE_URL}/rest/v1/{path}"))
            .header("apikey", SUPABASE_KEY)
            .bearer_auth(token);
        if let Some(prefer) = prefer {
            req = req.header("Prefer", prefer);
        }
        if let Some(body) = &body {
            let bytes = serde_json::to_vec(body).map_err(backend)?;
            req = req.header("content-type", "application/json").body(bytes);
        }

        let response = req.send().await.map_err(backend)?;
        let status = response.status();
        let bytes = response.bytes().await.map_err(backend)?;
        let value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        if status.is_success() {
            Ok(value)
        } else if status == StatusCode::CONFLICT {
            Err(SocialError::AlreadyAdded)
        } else {
            Err(backend(rest_error(&value, status)))
        }
    }

    pub async fn profile(&self) -> Result<Profile, SocialError> {
        let me = self.me().await?;
        let value = self
            .rest(
                Method::GET,
                &format!("profiles?id=eq.{me}&select=id,display_name,avatar_color,friend_code"),
                None,
                None,
            )
            .await?;
        let row = value
            .as_array()
            .and_then(|rows| rows.first())
            .ok_or_else(|| backend("Your profile hasn't synced yet."))?;
        Ok(profile_from_row(&me, row))
    }

    pub async fn update_profile(
        &self,
        display_name: &str,
        avatar_color: &str,
    ) -> Result<Profile, SocialError> {
        let me = self.me().await?;
        let value = self
            .rest(
                Method::PATCH,
                &format!("profiles?id=eq.{me}"),
                Some(json!({
                    "display_name": display_name.trim(),
                    "avatar_color": avatar_color,
                })),
                Some("return=representation"),
            )
            .await?;
        let row = value
            .as_array()
            .and_then(|rows| rows.first())
            .ok_or_else(|| backend("The profile update didn't come back."))?;
        Ok(profile_from_row(&me, row))
    }

    /// Accepted friends, from whichever side of the row I'm on — the person
    /// who sent the request and the person who accepted are both friends.
    pub async fn friends(&self) -> Result<Vec<Friend>, SocialError> {
        let me = self.me().await?;
        let sent = self
            .rest(
                Method::GET,
                &format!(
                    "friendships?user_id=eq.{me}&status=eq.accepted&select=other:profiles!friend_id(id,display_name,avatar_color,friend_code)"
                ),
                None,
                None,
            )
            .await?;
        let received = self
            .rest(
                Method::GET,
                &format!(
                    "friendships?friend_id=eq.{me}&status=eq.accepted&select=other:profiles!user_id(id,display_name,avatar_color,friend_code)"
                ),
                None,
                None,
            )
            .await?;
        Ok(others(&sent).chain(others(&received)).collect())
    }

    /// Incoming requests waiting on me: the people who added my code.
    pub async fn requests(&self) -> Result<Vec<Friend>, SocialError> {
        let me = self.me().await?;
        let value = self
            .rest(
                Method::GET,
                &format!(
                    "friendships?friend_id=eq.{me}&status=eq.pending&select=other:profiles!user_id(id,display_name,avatar_color,friend_code)"
                ),
                None,
                None,
            )
            .await?;
        Ok(others(&value).collect())
    }

    /// Adding by code sends a request; it becomes a friendship once they
    /// accept. Returns the person the request went to.
    pub async fn add_friend(&self, code: &str) -> Result<Friend, SocialError> {
        let code = code.trim();
        if code.len() != 8 || !code.bytes().all(|b| b.is_ascii_digit()) {
            return Err(SocialError::InvalidCode);
        }
        let me = self.me().await?;

        let matches = self
            .rest(
                Method::GET,
                &format!(
                    "profiles?friend_code=eq.{code}&select=id,display_name,avatar_color,friend_code"
                ),
                None,
                None,
            )
            .await?;
        let target = matches
            .as_array()
            .and_then(|rows| rows.first())
            .ok_or_else(|| backend("No one is using that code."))?;
        let target_id = target["id"].as_str().unwrap_or_default().to_owned();
        if target_id == me {
            return Err(SocialError::SelfAdd);
        }

        self.rest(
            Method::POST,
            "friendships",
            Some(json!({
                "user_id": me,
                "friend_id": target_id,
                "status": "pending",
            })),
            Some("return=minimal"),
        )
        .await?;

        friend_from_row(target).ok_or_else(|| backend("Sent, but couldn't read them back."))
    }

    /// Accept an incoming request from `requester_id`.
    pub async fn accept_request(&self, requester_id: &str) -> Result<(), SocialError> {
        let me = self.me().await?;
        self.rest(
            Method::PATCH,
            &format!("friendships?user_id=eq.{requester_id}&friend_id=eq.{me}&status=eq.pending"),
            Some(json!({ "status": "accepted" })),
            Some("return=minimal"),
        )
        .await?;
        Ok(())
    }

    /// Reject an incoming request (delete the pending row).
    pub async fn reject_request(&self, requester_id: &str) -> Result<(), SocialError> {
        let me = self.me().await?;
        self.rest(
            Method::DELETE,
            &format!("friendships?user_id=eq.{requester_id}&friend_id=eq.{me}"),
            None,
            None,
        )
        .await?;
        Ok(())
    }

    /// Drop a friend (or cancel a request I sent) from either side.
    pub async fn remove_friend(&self, id: &str) -> Result<(), SocialError> {
        let me = self.me().await?;
        self.rest(
            Method::DELETE,
            &format!("friendships?user_id=eq.{me}&friend_id=eq.{id}"),
            None,
            None,
        )
        .await?;
        self.rest(
            Method::DELETE,
            &format!("friendships?user_id=eq.{id}&friend_id=eq.{me}"),
            None,
            None,
        )
        .await?;
        Ok(())
    }

    /// Upsert my "currently watching" row (one per user, keyed on user_id).
    pub async fn set_activity(&self, input: ActivityInput) -> Result<(), SocialError> {
        let me = self.me().await?;
        self.rest(
            Method::POST,
            "activity",
            Some(json!({
                "user_id": me,
                "meta_id": input.meta_id,
                "content_type": input.content_type,
                "title": input.title,
                "subtitle": input.subtitle,
                "poster": input.poster,
                "updated_at": input.updated_at,
            })),
            Some("resolution=merge-duplicates,return=minimal"),
        )
        .await?;
        Ok(())
    }

    pub async fn activity(&self) -> Result<Vec<FriendActivity>, SocialError> {
        let me = self.me().await?;
        let value = self
            .rest(
                Method::GET,
                &format!(
                    "activity?user_id=neq.{me}&select=user_id,meta_id,content_type,title,subtitle,poster,friend:profiles!user_id(display_name,avatar_color)&order=updated_at.desc"
                ),
                None,
                None,
            )
            .await?;
        let items = value
            .as_array()
            .map(|rows| rows.iter().filter_map(activity_from_row).collect())
            .unwrap_or_default();
        Ok(items)
    }
}

fn profile_from_row(id: &str, row: &Value) -> Profile {
    Profile {
        id: id.to_owned(),
        display_name: row["display_name"].as_str().unwrap_or("You").to_owned(),
        friend_code: row["friend_code"].as_str().unwrap_or_default().to_owned(),
        avatar_color: row["avatar_color"].as_str().unwrap_or("#d0588a").to_owned(),
    }
}

/// Pull the embedded `other` profile out of each friendship row.
fn others(value: &Value) -> impl Iterator<Item = Friend> + '_ {
    value
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|row| friend_from_row(&row["other"]))
}

fn friend_from_row(row: &Value) -> Option<Friend> {
    let id = row["id"].as_str()?.to_owned();
    Some(Friend {
        id,
        display_name: row["display_name"].as_str().unwrap_or("Friend").to_owned(),
        avatar_color: row["avatar_color"].as_str().unwrap_or("#0353f2").to_owned(),
        friend_code: row["friend_code"].as_str().unwrap_or_default().to_owned(),
    })
}

fn activity_from_row(row: &Value) -> Option<FriendActivity> {
    let friend_id = row["user_id"].as_str()?.to_owned();
    Some(FriendActivity {
        friend_id,
        friend_name: row["friend"]["display_name"]
            .as_str()
            .unwrap_or("Friend")
            .to_owned(),
        avatar_color: row["friend"]["avatar_color"]
            .as_str()
            .unwrap_or("#0353f2")
            .to_owned(),
        title: row["title"].as_str().unwrap_or_default().to_owned(),
        subtitle: row["subtitle"].as_str().unwrap_or_default().to_owned(),
        poster: row["poster"].as_str().map(str::to_owned),
        meta_id: row["meta_id"].as_str().unwrap_or_default().to_owned(),
        content_type: row["content_type"].as_str().unwrap_or_default().to_owned(),
        at_ms: 0,
    })
}

/// PostgREST errors arrive as `{ "message": ..., "hint": ... }`; surface the
/// message, falling back to the status code.
fn rest_error(value: &Value, status: StatusCode) -> String {
    value["message"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| format!("request failed ({status})"))
}
