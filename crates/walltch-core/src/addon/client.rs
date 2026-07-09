use std::sync::Arc;

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde::de::DeserializeOwned;
use thiserror::Error;

use super::manifest::{Manifest, ManifestError};
use super::meta::{MetaDetail, MetaPreview};
use super::response::{CatalogResponse, MetaResponse, StreamsResponse, SubtitlesResponse};
use super::stream::Stream;
use super::subtitle::Subtitle;
use crate::ports::{HttpClient, HttpError};

/// Mirrors JavaScript's `encodeURIComponent`, which is what the official
/// addon SDK uses when it builds these paths.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

fn encode(part: &str) -> String {
    utf8_percent_encode(part, COMPONENT).to_string()
}

#[derive(Debug, Error)]
pub enum AddonError {
    #[error(transparent)]
    Http(#[from] HttpError),
    #[error("addon returned HTTP {status} for {url}")]
    BadStatus { status: u16, url: String },
    #[error("addon response is not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Manifest(#[from] ManifestError),
}

/// Talks to one addon over its HTTP transport. Owns nothing but the base
/// URL; all I/O goes through the [`HttpClient`] port.
pub struct AddonClient {
    http: Arc<dyn HttpClient>,
    base_url: String,
}

impl AddonClient {
    /// `url` may be the manifest URL (how addons are usually shared) or the
    /// bare transport base.
    pub fn new(http: Arc<dyn HttpClient>, url: &str) -> Self {
        let trimmed = url.trim().trim_end_matches('/');
        let base_url = trimmed
            .strip_suffix("/manifest.json")
            .unwrap_or(trimmed)
            .to_owned();
        Self { http, base_url }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Fetch and validate the addon's manifest (the install-time handshake).
    pub async fn fetch_manifest(&self) -> Result<Manifest, AddonError> {
        let url = format!("{}/manifest.json", self.base_url);
        let body = self.fetch_bytes(url).await?;
        Ok(Manifest::parse(&String::from_utf8_lossy(&body))?)
    }

    pub async fn catalog(
        &self,
        r#type: &str,
        id: &str,
        extra: &[(&str, &str)],
    ) -> Result<Vec<MetaPreview>, AddonError> {
        let url = self.resource_url("catalog", r#type, id, extra);
        let response: CatalogResponse = self.fetch_json(url).await?;
        Ok(response.metas)
    }

    pub async fn meta(&self, r#type: &str, id: &str) -> Result<MetaDetail, AddonError> {
        let url = self.resource_url("meta", r#type, id, &[]);
        let response: MetaResponse = self.fetch_json(url).await?;
        Ok(response.meta)
    }

    pub async fn streams(&self, r#type: &str, id: &str) -> Result<Vec<Stream>, AddonError> {
        let url = self.resource_url("stream", r#type, id, &[]);
        let response: StreamsResponse = self.fetch_json(url).await?;
        Ok(response.streams)
    }

    pub async fn subtitles(
        &self,
        r#type: &str,
        id: &str,
        extra: &[(&str, &str)],
    ) -> Result<Vec<Subtitle>, AddonError> {
        let url = self.resource_url("subtitles", r#type, id, extra);
        let response: SubtitlesResponse = self.fetch_json(url).await?;
        Ok(response.subtitles)
    }

    /// `{base}/{resource}/{type}/{id}.json`, or with extra props
    /// `{base}/{resource}/{type}/{id}/{k=v&k=v}.json`.
    fn resource_url(
        &self,
        resource: &str,
        r#type: &str,
        id: &str,
        extra: &[(&str, &str)],
    ) -> String {
        let mut url = format!(
            "{}/{}/{}/{}",
            self.base_url,
            resource,
            encode(r#type),
            encode(id)
        );
        if !extra.is_empty() {
            let props: Vec<String> = extra
                .iter()
                .map(|(name, value)| format!("{}={}", encode(name), encode(value)))
                .collect();
            url.push('/');
            url.push_str(&props.join("&"));
        }
        url.push_str(".json");
        url
    }

    async fn fetch_bytes(&self, url: String) -> Result<Vec<u8>, AddonError> {
        let response = self.http.get(&url).await?;
        if !response.is_success() {
            return Err(AddonError::BadStatus {
                status: response.status,
                url,
            });
        }
        Ok(response.body)
    }

    async fn fetch_json<T: DeserializeOwned>(&self, url: String) -> Result<T, AddonError> {
        let body = self.fetch_bytes(url).await?;
        Ok(serde_json::from_slice(&body)?)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use async_trait::async_trait;
    use futures::executor::block_on;

    use super::*;
    use crate::addon::stream::StreamSource;
    use crate::ports::HttpResponse;

    #[derive(Default)]
    struct FakeHttp {
        responses: HashMap<String, (u16, &'static str)>,
        requests: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl HttpClient for FakeHttp {
        async fn get(&self, url: &str) -> Result<HttpResponse, HttpError> {
            self.requests
                .lock()
                .expect("not poisoned")
                .push(url.to_owned());
            let (status, body) = self.responses.get(url).copied().unwrap_or((404, "{}"));
            Ok(HttpResponse {
                status,
                body: body.as_bytes().to_vec(),
            })
        }
    }

    fn client_with(responses: &[(&str, u16, &'static str)]) -> (Arc<FakeHttp>, AddonClient) {
        let fake = Arc::new(FakeHttp {
            responses: responses
                .iter()
                .map(|(url, status, body)| ((*url).to_owned(), (*status, *body)))
                .collect(),
            requests: Mutex::new(Vec::new()),
        });
        let client = AddonClient::new(fake.clone(), "https://addon.example/manifest.json");
        (fake, client)
    }

    #[test]
    fn strips_manifest_suffix_from_the_url() {
        let (_, client) = client_with(&[]);
        assert_eq!(client.base_url(), "https://addon.example");
    }

    #[test]
    fn fetches_and_parses_a_catalog() {
        let (fake, client) = client_with(&[(
            "https://addon.example/catalog/movie/top.json",
            200,
            r#"{"metas": [{"id": "tt1", "type": "movie", "name": "One"},
                          {"id": "tt2", "type": "movie", "name": "Two"}]}"#,
        )]);
        let metas = block_on(client.catalog("movie", "top", &[])).expect("catalog");
        assert_eq!(metas.len(), 2);
        assert_eq!(metas[1].name, "Two");
        assert_eq!(
            fake.requests.lock().expect("not poisoned")[0],
            "https://addon.example/catalog/movie/top.json"
        );
    }

    #[test]
    fn encodes_extra_props_into_the_path() {
        let (fake, client) = client_with(&[(
            "https://addon.example/catalog/movie/top/genre=Sci-Fi%20%26%20Fantasy&skip=100.json",
            200,
            r#"{"metas": []}"#,
        )]);
        let metas = block_on(client.catalog(
            "movie",
            "top",
            &[("genre", "Sci-Fi & Fantasy"), ("skip", "100")],
        ))
        .expect("catalog with extra");
        assert!(metas.is_empty());
        assert_eq!(fake.requests.lock().expect("not poisoned").len(), 1);
    }

    #[test]
    fn fetches_streams_for_an_episode() {
        let (_, client) = client_with(&[(
            "https://addon.example/stream/series/tt0903747%3A1%3A1.json",
            200,
            r#"{"streams": [{"infoHash": "df389295d0b130fbc38ba7c31467a5e7ff536005"}]}"#,
        )]);
        let streams = block_on(client.streams("series", "tt0903747:1:1")).expect("streams");
        assert!(matches!(streams[0].source, StreamSource::Torrent { .. }));
    }

    #[test]
    fn non_success_status_is_an_error_with_context() {
        let (_, client) =
            client_with(&[("https://addon.example/meta/movie/tt1.json", 500, "oops")]);
        let err = block_on(client.meta("movie", "tt1")).expect_err("should fail");
        match err {
            AddonError::BadStatus { status, url } => {
                assert_eq!(status, 500);
                assert!(url.ends_with("/meta/movie/tt1.json"));
            }
            other => panic!("expected BadStatus, got {other}"),
        }
    }

    #[test]
    fn fetch_manifest_validates_the_body() {
        let (_, client) = client_with(&[(
            "https://addon.example/manifest.json",
            200,
            r#"{"id": "org.example", "version": "1.0.0", "name": "Example",
                "types": ["movie"], "resources": []}"#,
        )]);
        let err = block_on(client.fetch_manifest()).expect_err("manifest serves nothing");
        assert!(matches!(
            err,
            AddonError::Manifest(ManifestError::NothingServed)
        ));
    }
}
