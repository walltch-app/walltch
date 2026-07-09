use async_trait::async_trait;
use thiserror::Error;

/// Transport-level failure. Non-2xx statuses are not errors at this layer;
/// callers decide what a 404 from an addon means.
#[derive(Debug, Error)]
#[error("http request failed: {0}")]
pub struct HttpError(pub String);

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

impl HttpResponse {
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

/// Outgoing HTTP, implemented by the platform (reqwest on desktop).
#[async_trait]
pub trait HttpClient: Send + Sync {
    async fn get(&self, url: &str) -> Result<HttpResponse, HttpError>;
}
