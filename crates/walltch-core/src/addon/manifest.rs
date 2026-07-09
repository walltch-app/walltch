use serde::{Deserialize, Serialize};

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
}
