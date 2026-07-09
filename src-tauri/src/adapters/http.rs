use std::time::Duration;

use async_trait::async_trait;
use walltch_core::ports::{HttpClient, HttpError, HttpResponse};

pub struct ReqwestHttpClient {
    client: reqwest::Client,
}

impl ReqwestHttpClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("walltch/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

impl Default for ReqwestHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpClient for ReqwestHttpClient {
    async fn get(&self, url: &str) -> Result<HttpResponse, HttpError> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| HttpError(e.to_string()))?;
        let status = response.status().as_u16();
        let body = response
            .bytes()
            .await
            .map_err(|e| HttpError(e.to_string()))?
            .to_vec();
        Ok(HttpResponse { status, body })
    }
}
