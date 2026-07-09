use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error("manifest is not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("manifest field `{0}` is empty")]
    EmptyField(&'static str),
    #[error("manifest declares no resources and no catalogs, so the addon serves nothing")]
    NothingServed,
    #[error("catalog #{0} has an empty id or type")]
    InvalidCatalog(usize),
}

/// An addon's self-description, served at `/manifest.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub id: String,
    pub version: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Content types the addon serves ("movie", "series", "channel", "tv", ...).
    pub types: Vec<String>,
    pub resources: Vec<ResourceRef>,
    #[serde(default)]
    pub catalogs: Vec<ManifestCatalog>,
    /// Meta id prefixes the addon responds to (e.g. "tt" for IMDb ids).
    #[serde(default)]
    pub id_prefixes: Option<Vec<String>>,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub contact_email: Option<String>,
    #[serde(default)]
    pub behavior_hints: ManifestBehaviorHints,
}

impl Manifest {
    /// Parse and validate a `manifest.json` body. This is the entry point
    /// used at install time, so a broken addon is rejected up front instead
    /// of failing halfway through a catalog query.
    pub fn parse(json: &str) -> Result<Self, ManifestError> {
        let manifest: Self = serde_json::from_str(json)?;
        manifest.validate()?;
        Ok(manifest)
    }

    /// Semantic checks on top of successful deserialization.
    pub fn validate(&self) -> Result<(), ManifestError> {
        let required = [
            ("id", &self.id),
            ("version", &self.version),
            ("name", &self.name),
        ];
        for (field, value) in required {
            if value.trim().is_empty() {
                return Err(ManifestError::EmptyField(field));
            }
        }
        if self.resources.is_empty() && self.catalogs.is_empty() {
            return Err(ManifestError::NothingServed);
        }
        if self.resources.iter().any(|r| r.name().trim().is_empty()) {
            return Err(ManifestError::EmptyField("resources[].name"));
        }
        for (index, catalog) in self.catalogs.iter().enumerate() {
            if catalog.id.trim().is_empty() || catalog.r#type.trim().is_empty() {
                return Err(ManifestError::InvalidCatalog(index));
            }
        }
        Ok(())
    }

    /// Whether this addon claims to serve `resource` (e.g. "meta", "stream")
    /// for the given content type and meta id. Scoped resource entries
    /// override the manifest-level `types`/`idPrefixes`; absent prefix lists
    /// mean "no restriction".
    pub fn supports(&self, resource: &str, r#type: &str, id: &str) -> bool {
        fn prefix_matches(prefixes: Option<&Vec<String>>, id: &str) -> bool {
            prefixes.is_none_or(|p| p.iter().any(|prefix| id.starts_with(prefix)))
        }

        self.resources.iter().any(|entry| match entry {
            ResourceRef::Name(name) => {
                name == resource
                    && self.types.iter().any(|t| t == r#type)
                    && prefix_matches(self.id_prefixes.as_ref(), id)
            }
            ResourceRef::Scoped {
                name,
                types,
                id_prefixes,
            } => {
                name == resource
                    && types
                        .as_ref()
                        .unwrap_or(&self.types)
                        .iter()
                        .any(|t| t == r#type)
                    && prefix_matches(id_prefixes.as_ref().or(self.id_prefixes.as_ref()), id)
            }
        })
    }
}

/// A resource the addon provides. The protocol allows either a bare name
/// ("stream") or an object that scopes it to certain types/id prefixes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResourceRef {
    Name(String),
    #[serde(rename_all = "camelCase")]
    Scoped {
        name: String,
        #[serde(default)]
        types: Option<Vec<String>>,
        #[serde(default)]
        id_prefixes: Option<Vec<String>>,
    },
}

impl ResourceRef {
    pub fn name(&self) -> &str {
        match self {
            ResourceRef::Name(name) => name,
            ResourceRef::Scoped { name, .. } => name,
        }
    }
}

/// A catalog entry announced in the manifest.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestCatalog {
    pub id: String,
    pub r#type: String,
    #[serde(default)]
    pub name: Option<String>,
    /// Extra query properties the catalog supports (search, genre, skip, ...).
    #[serde(default)]
    pub extra: Vec<ExtraProp>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraProp {
    pub name: String,
    #[serde(default)]
    pub is_required: bool,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub options_limit: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestBehaviorHints {
    #[serde(default)]
    pub adult: bool,
    #[serde(default)]
    pub p2p: bool,
    #[serde(default)]
    pub configurable: bool,
    #[serde(default)]
    pub configuration_required: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cinemeta_style_manifest() {
        let json = r#"{
            "id": "com.linvo.cinemeta",
            "version": "3.0.13",
            "name": "Cinemeta",
            "description": "The official addon for movie and series catalogs",
            "resources": ["catalog", "meta"],
            "types": ["movie", "series"],
            "idPrefixes": ["tt"],
            "catalogs": [
                {"type": "movie", "id": "top", "name": "Popular", "extra": [
                    {"name": "genre", "options": ["Action", "Comedy"]},
                    {"name": "search", "isRequired": false},
                    {"name": "skip"}
                ]},
                {"type": "series", "id": "top"}
            ]
        }"#;
        let manifest: Manifest = serde_json::from_str(json).expect("should parse");
        assert_eq!(manifest.id, "com.linvo.cinemeta");
        assert_eq!(manifest.resources[1], ResourceRef::Name("meta".into()));
        assert_eq!(manifest.catalogs.len(), 2);
        assert_eq!(manifest.catalogs[0].extra[0].options.len(), 2);
        assert!(manifest.catalogs[1].name.is_none());
        assert!(!manifest.behavior_hints.adult);
    }

    #[test]
    fn parses_scoped_resource_objects() {
        let json = r#"{
            "id": "org.example.streams",
            "version": "1.0.0",
            "name": "Example",
            "types": ["movie"],
            "resources": [
                {"name": "stream", "types": ["movie"], "idPrefixes": ["tt"]}
            ],
            "behaviorHints": {"p2p": true}
        }"#;
        let manifest: Manifest = serde_json::from_str(json).expect("should parse");
        assert_eq!(manifest.resources[0].name(), "stream");
        assert!(manifest.behavior_hints.p2p);
        assert!(manifest.catalogs.is_empty());
    }

    fn minimal_manifest() -> Manifest {
        Manifest::parse(
            r#"{
                "id": "org.example",
                "version": "1.0.0",
                "name": "Example",
                "types": ["movie"],
                "resources": ["stream"]
            }"#,
        )
        .expect("minimal manifest should be valid")
    }

    #[test]
    fn parse_accepts_a_minimal_valid_manifest() {
        let manifest = minimal_manifest();
        assert_eq!(manifest.id, "org.example");
    }

    #[test]
    fn parse_rejects_invalid_json() {
        let result = Manifest::parse("{not json");
        assert!(matches!(result, Err(ManifestError::Json(_))));
    }

    #[test]
    fn validate_rejects_blank_required_fields() {
        let mut manifest = minimal_manifest();
        manifest.id = "   ".into();
        assert!(matches!(
            manifest.validate(),
            Err(ManifestError::EmptyField("id"))
        ));

        let mut manifest = minimal_manifest();
        manifest.version = String::new();
        assert!(matches!(
            manifest.validate(),
            Err(ManifestError::EmptyField("version"))
        ));
    }

    #[test]
    fn validate_rejects_addon_that_serves_nothing() {
        let mut manifest = minimal_manifest();
        manifest.resources.clear();
        assert!(matches!(
            manifest.validate(),
            Err(ManifestError::NothingServed)
        ));

        // ...but catalogs alone are enough to be useful.
        manifest.catalogs.push(ManifestCatalog {
            id: "top".into(),
            r#type: "movie".into(),
            name: None,
            extra: Vec::new(),
        });
        assert!(manifest.validate().is_ok());
    }

    #[test]
    fn supports_respects_types_and_id_prefixes() {
        let manifest = Manifest::parse(
            r#"{
                "id": "org.example",
                "version": "1.0.0",
                "name": "Example",
                "types": ["movie", "series"],
                "idPrefixes": ["tt"],
                "resources": [
                    "meta",
                    {"name": "stream", "types": ["movie"], "idPrefixes": ["tt", "kitsu"]}
                ]
            }"#,
        )
        .expect("valid manifest");

        assert!(manifest.supports("meta", "series", "tt0903747"));
        assert!(!manifest.supports("meta", "channel", "tt0903747"));
        assert!(!manifest.supports("meta", "movie", "yt:abc"));

        // The scoped stream entry narrows types but widens prefixes.
        assert!(manifest.supports("stream", "movie", "kitsu:1"));
        assert!(!manifest.supports("stream", "series", "tt0903747"));
        assert!(!manifest.supports("subtitles", "movie", "tt1"));
    }

    #[test]
    fn validate_rejects_catalog_without_id_or_type() {
        let mut manifest = minimal_manifest();
        manifest.catalogs.push(ManifestCatalog {
            id: "top".into(),
            r#type: String::new(),
            name: None,
            extra: Vec::new(),
        });
        assert!(matches!(
            manifest.validate(),
            Err(ManifestError::InvalidCatalog(0))
        ));
    }
}
