use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

pub const MAX_MESSAGE_BYTES: usize = 1_048_576;
pub const MAX_OUTPUT_TEXT_BYTES: usize = 200_000;
pub const MAX_DELTA_BYTES: usize = 50_000;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Byok,
    Codex,
}

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ResponseMode {
    Chat,
    Edit,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExtractionMode {
    Selection,
    SelectionWithContext,
    ReadablePage,
    Viewport,
    AccessibleDom,
    Screenshot,
}

#[derive(Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "status")]
    Status {
        #[serde(rename = "requestId")]
        request_id: Uuid,
    },
    #[serde(rename = "store_key")]
    StoreKey {
        #[serde(rename = "requestId")]
        request_id: Uuid,
        #[serde(rename = "apiKey")]
        api_key: String,
    },
    #[serde(rename = "delete_key")]
    DeleteKey {
        #[serde(rename = "requestId")]
        request_id: Uuid,
    },
    #[serde(rename = "codex_login")]
    CodexLogin {
        #[serde(rename = "requestId")]
        request_id: Uuid,
    },
    #[serde(rename = "codex_logout")]
    CodexLogout {
        #[serde(rename = "requestId")]
        request_id: Uuid,
    },
    #[serde(rename = "request")]
    Model {
        #[serde(rename = "requestId")]
        request_id: Uuid,
        provider: Provider,
        #[serde(default)]
        model: String,
        payload: ModelPayload,
    },
    #[serde(rename = "cancel")]
    Cancel {
        #[serde(rename = "requestId")]
        request_id: Uuid,
        #[serde(rename = "targetRequestId")]
        target_request_id: Uuid,
    },
}

impl Request {
    pub fn request_id(&self) -> Uuid {
        match self {
            Self::Status { request_id }
            | Self::StoreKey { request_id, .. }
            | Self::DeleteKey { request_id }
            | Self::CodexLogin { request_id }
            | Self::CodexLogout { request_id }
            | Self::Model { request_id, .. }
            | Self::Cancel { request_id, .. } => *request_id,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelPayload {
    #[serde(rename = "sessionId")]
    pub session_id: Uuid,
    pub prompt: String,
    pub context: ContextBundle,
    pub mode: ResponseMode,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ContextBundle {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u8,
    #[serde(rename = "conversationId")]
    pub conversation_id: Uuid,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "userIntent")]
    pub user_intent: String,
    pub sources: Vec<ContextSource>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ContextSource {
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "tabId", skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<u64>,
    #[serde(rename = "frameId", skip_serializing_if = "Option::is_none")]
    pub frame_id: Option<u64>,
    pub title: String,
    pub url: String,
    pub origin: String,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "extractionMode")]
    pub extraction_mode: ExtractionMode,
    pub trust: String,
    pub chunks: Vec<SourceChunk>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceChunk {
    #[serde(rename = "chunkId")]
    pub chunk_id: String,
    pub order: u64,
    #[serde(rename = "headingPath")]
    pub heading_path: Vec<String>,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locator: Option<SourceLocator>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceLocator {
    #[serde(rename = "cssPath", skip_serializing_if = "Option::is_none")]
    pub css_path: Option<String>,
    #[serde(rename = "textQuote", skip_serializing_if = "Option::is_none")]
    pub text_quote: Option<TextQuote>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TextQuote {
    pub exact: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suffix: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditProposal {
    #[serde(rename = "schemaVersion")]
    schema_version: u8,
    #[serde(rename = "proposalId")]
    proposal_id: Uuid,
    #[serde(rename = "originalText")]
    original_text: String,
    #[serde(rename = "replacementText")]
    replacement_text: String,
    explanation: Option<String>,
    warnings: Vec<String>,
}

impl ModelPayload {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.prompt.is_empty()
            || self.prompt.len() > 20_000
            || self.context.schema_version != 1
            || self.context.created_at.len() > 64
            || self.context.user_intent.len() > 20_000
            || self.context.sources.is_empty()
            || self.context.sources.len() > 10
        {
            return Err("validation");
        }
        for source in &self.context.sources {
            if source.source_id.is_empty()
                || source.source_id.len() > 128
                || source.title.len() > 1_000
                || !safe_web_url(&source.url)
                || !safe_web_url(&source.origin)
                || source.content_hash.len() != 64
                || !source
                    .content_hash
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                || source.trust != "untrusted-web-content"
                || source.chunks.len() > 500
            {
                return Err("validation");
            }
            for chunk in &source.chunks {
                if chunk.chunk_id.is_empty()
                    || chunk.chunk_id.len() > 128
                    || chunk.heading_path.len() > 16
                    || chunk.heading_path.iter().any(|heading| heading.len() > 500)
                    || chunk.text.len() > 25_000
                    || chunk.locator.as_ref().is_some_and(|locator| {
                        locator
                            .css_path
                            .as_ref()
                            .is_some_and(|path| path.len() > 2_000)
                            || locator.text_quote.as_ref().is_some_and(|quote| {
                                quote.exact.len() > 2_000
                                    || quote
                                        .prefix
                                        .as_ref()
                                        .is_some_and(|prefix| prefix.len() > 500)
                                    || quote
                                        .suffix
                                        .as_ref()
                                        .is_some_and(|suffix| suffix.len() > 500)
                            })
                    })
                {
                    return Err("validation");
                }
            }
        }
        Ok(())
    }

    pub fn citation_events(&self, request_id: Uuid) -> Vec<Value> {
        self.context
            .sources
            .iter()
            .filter_map(|source| {
                source.chunks.first().map(|chunk| {
                    stream(
                        request_id,
                        json!({
                            "type": "citation",
                            "sourceId": source.source_id,
                            "chunkId": chunk.chunk_id,
                        }),
                    )
                })
            })
            .collect()
    }
}

impl EditProposal {
    pub fn validate_json(value: Value) -> Result<Value, &'static str> {
        let encoded = serde_json::to_vec(&value).map_err(|_| "model")?;
        if encoded.len() > 100_000 {
            return Err("model");
        }
        let proposal: Self = serde_json::from_value(value.clone()).map_err(|_| "model")?;
        if proposal.schema_version != 1
            || proposal.original_text.len() > 20_000
            || proposal.replacement_text.len() > 82_000
            || proposal
                .explanation
                .as_ref()
                .is_some_and(|text| text.len() > 4_000)
            || proposal.warnings.len() > 20
            || proposal.warnings.iter().any(|warning| warning.len() > 500)
        {
            return Err("model");
        }
        let _ = proposal.proposal_id;
        Ok(value)
    }
}

fn safe_web_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    })
}

pub fn response(
    request_id: Option<Uuid>,
    ok: bool,
    data: Option<Value>,
    error: Option<&str>,
) -> Value {
    let mut value = json!({
        "kind": "response",
        "requestId": request_id,
        "ok": ok,
    });
    if let Some(data) = data {
        value["data"] = data;
    }
    if let Some(error) = error {
        value["error"] = Value::String(error.to_owned());
    }
    value
}

pub fn stream(request_id: Uuid, event: Value) -> Value {
    json!({ "kind": "stream", "requestId": request_id, "event": event })
}

pub fn login_event(
    request_id: Uuid,
    state: &str,
    auth_url: Option<&str>,
    success: Option<bool>,
    error: Option<&str>,
) -> Value {
    let mut value = json!({
        "kind": "codex_login",
        "requestId": request_id,
        "state": state,
    });
    if let Some(url) = auth_url {
        value["authUrl"] = Value::String(url.to_owned());
    }
    if let Some(success) = success {
        value["success"] = Value::Bool(success);
    }
    if let Some(error) = error {
        value["error"] = Value::String(error.chars().take(256).collect());
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload() -> ModelPayload {
        ModelPayload {
            session_id: Uuid::new_v4(),
            prompt: "Summarize".into(),
            context: ContextBundle {
                schema_version: 1,
                conversation_id: Uuid::new_v4(),
                created_at: "2026-07-26T00:00:00Z".into(),
                user_intent: "Summarize".into(),
                sources: vec![ContextSource {
                    source_id: "source-1".into(),
                    tab_id: Some(1),
                    frame_id: None,
                    title: "Example".into(),
                    url: "https://example.com/page".into(),
                    origin: "https://example.com".into(),
                    content_hash: "a".repeat(64),
                    extraction_mode: ExtractionMode::ReadablePage,
                    trust: "untrusted-web-content".into(),
                    chunks: vec![SourceChunk {
                        chunk_id: "chunk-1".into(),
                        order: 0,
                        heading_path: vec![],
                        text: "Body".into(),
                        locator: None,
                    }],
                    truncated: None,
                }],
            },
            mode: ResponseMode::Chat,
        }
    }

    #[test]
    fn validates_bounded_payloads_and_citations() {
        let payload = payload();
        assert_eq!(payload.validate(), Ok(()));
        assert_eq!(payload.citation_events(Uuid::new_v4()).len(), 1);
    }

    #[test]
    fn rejects_untrusted_context_shape() {
        let mut payload = payload();
        payload.context.sources[0].trust = "trusted".into();
        assert_eq!(payload.validate(), Err("validation"));
    }

    #[test]
    fn rejects_malformed_urls_and_uppercase_hashes() {
        let mut malformed_url = payload();
        malformed_url.context.sources[0].url = "https://".into();
        assert_eq!(malformed_url.validate(), Err("validation"));

        let mut uppercase_hash = payload();
        uppercase_hash.context.sources[0].content_hash = "A".repeat(64);
        assert_eq!(uppercase_hash.validate(), Err("validation"));
    }

    #[test]
    fn validates_edit_contract() {
        let value = json!({
            "schemaVersion": 1,
            "proposalId": Uuid::new_v4(),
            "originalText": "old",
            "replacementText": "new",
            "warnings": [],
        });
        assert!(EditProposal::validate_json(value).is_ok());
    }

    #[test]
    fn rejects_unknown_native_request_fields() {
        let value = json!({
            "type": "status",
            "requestId": Uuid::new_v4(),
            "unexpected": true,
        });
        assert!(serde_json::from_value::<Request>(value).is_err());
    }
}
