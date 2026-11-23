//! The product MCP server (REWRITE 4.7): Streamable HTTP at `/api/v2/mcp`, in the API binary.
//!
//! - Authentication: `Authorization: Bearer <personal access token>` (`/me/access-tokens`), checked by
//!   [`authenticate`] before rmcp sees the request; the caller is the token's owner as of now
//!   ([`ab_domain::identity::Actor::current`]).
//! - Transport: stateless (no `Mcp-Session-Id`), JSON responses; every POST is one JSON-RPC exchange.
//! - Tools are thin adapters over the REST handlers: each builds the handler's extractors and calls it,
//!   so the domain gates (`CourseCtx`/`Caps`, `actor.require`) decide exactly as for the web, and the
//!   reply is the REST response body. A refusal is a tool error carrying the problem+json.
//! - Scope: a `read` token lists and calls the read tools; a `draft` token also the draft tools, which
//!   never publish or release (an activity draft is refused on a published activity, a grade draft on a
//!   published or returned submission).
//! - Every tool call, allowed or refused, writes an `mcp-tool-called` row to `auth_audit_log`.

use std::sync::Arc;

use ab_core::id::{ActivityId, CourseId, SubmissionId};
use ab_domain::identity::access_tokens::{RequestOrigin, TokenCaller, TokenScope};
use axum::Router;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
    ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
    ToolAnnotations,
};
use rmcp::schemars::{self, JsonSchema};
use rmcp::service::{MaybeSendFuture, RequestContext};
use rmcp::transport::streamable_http_server::session::never::NeverSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{ErrorData, RoleServer, ServerHandler};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::error::ApiError;
use crate::extract::{ClientIp, CurrentActor, MaybeActor, Path, Query};
use crate::routes;
use crate::state::AppState;

/// Where MCP clients connect.
pub const MCP_PATH: &str = "/api/v2/mcp";
/// Largest JSON-RPC body (an activity draft carries a whole editor document).
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
/// Largest REST reply a tool relays.
const MAX_REPLY_BYTES: usize = 8 * 1024 * 1024;

/// The authenticated MCP caller, put into the request extensions by [`authenticate`].
#[derive(Clone)]
pub struct McpCaller {
    pub caller: TokenCaller,
    pub origin: RequestOrigin,
}

/// The `/api/v2/mcp` route: the bearer check, then rmcp's Streamable HTTP service.
pub fn router(state: &AppState) -> Router<AppState> {
    let config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_sse_keep_alive(None)
        // Behind nginx under the platform's own host; the bearer token, not the Host header, is the gate
        // (DNS rebinding cannot reach a token the browser never holds).
        .disable_allowed_hosts()
        .with_max_request_body_bytes(MAX_BODY_BYTES)
        .with_cancellation_token(state.shutdown.child_token());
    let server = McpServer {
        state: state.clone(),
    };
    let service = StreamableHttpService::new(
        move || Ok(server.clone()),
        Arc::new(NeverSessionManager::default()),
        config,
    );
    Router::new()
        .route_service(MCP_PATH, service)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            authenticate,
        ))
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    scheme
        .eq_ignore_ascii_case("bearer")
        .then(|| token.trim())
        .filter(|t| !t.is_empty())
}

/// 401 `unauthenticated` with a `WWW-Authenticate: Bearer` challenge.
fn challenge() -> Response {
    let mut response = ApiError(ab_core::Error::unauthenticated()).into_response();
    response.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_static(r#"Bearer realm="ashyq", error="invalid_token""#),
    );
    response
}

/// The bearer token → [`McpCaller`]; anything else is a 401 before rmcp reads the body.
pub async fn authenticate(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    mut request: Request,
    next: Next,
) -> Response {
    let Some(token) = bearer(request.headers()) else {
        return challenge();
    };
    let caller = match state.access_tokens.authenticate(token).await {
        Ok(Some(caller)) => caller,
        Ok(None) => return challenge(),
        Err(err) => return ApiError(err).into_response(),
    };
    let user_agent = request
        .headers()
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned);
    request.extensions_mut().insert(McpCaller {
        caller,
        origin: RequestOrigin { ip, user_agent },
    });
    next.run(request).await
}

#[derive(Clone)]
struct McpServer {
    state: AppState,
}

/// Every tool, with the scope it needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolName {
    ListMyCourses,
    GetCourseOutline,
    ReadActivity,
    SearchCourse,
    GetSubmission,
    SaveActivityDraft,
    SaveGradeDraft,
}

impl ToolName {
    const ALL: [Self; 7] = [
        Self::ListMyCourses,
        Self::GetCourseOutline,
        Self::ReadActivity,
        Self::SearchCourse,
        Self::GetSubmission,
        Self::SaveActivityDraft,
        Self::SaveGradeDraft,
    ];

    const fn name(self) -> &'static str {
        match self {
            Self::ListMyCourses => "list_my_courses",
            Self::GetCourseOutline => "get_course_outline",
            Self::ReadActivity => "read_activity",
            Self::SearchCourse => "search_course",
            Self::GetSubmission => "get_submission",
            Self::SaveActivityDraft => "save_activity_draft",
            Self::SaveGradeDraft => "save_grade_draft",
        }
    }

    const fn scope(self) -> TokenScope {
        match self {
            Self::SaveActivityDraft | Self::SaveGradeDraft => TokenScope::Draft,
            _ => TokenScope::Read,
        }
    }

    fn parse(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|t| t.name() == name)
    }

    fn tool(self) -> Tool {
        let (description, schema) = match self {
            Self::ListMyCourses => (
                "The caller's courses: `teaching` (default) the courses they may edit, with learner and \
                 ungraded counts; `learning` the courses they are enrolled in, with progress. Paged by \
                 `cursor` (`next_cursor` of the previous page).",
                schema::<ListMyCoursesArgs>(),
            ),
            Self::GetCourseOutline => (
                "A course and its outline: chapters in order with their activities (id, name, kind, \
                 published, version). Drafts are listed for the course's editors only.",
                schema::<CourseArgs>(),
            ),
            Self::ReadActivity => (
                "One activity: its fields, the editor document (`content`, Tiptap JSON), details, settings, \
                 and `text`, the document as plain text. `version` is what a draft save sends back.",
                schema::<ActivityArgs>(),
            ),
            Self::SearchCourse => (
                "Search a course's material (semantic + full-text). Learners find published material only. \
                 Hits carry the activity id and an excerpt.",
                schema::<SearchArgs>(),
            ),
            Self::GetSubmission => (
                "A submission as its grader sees it: answers, item scores, feedback, status and `version` \
                 (what a grade draft sends back). For the course's graders only.",
                schema::<SubmissionArgs>(),
            ),
            Self::SaveActivityDraft => (
                "Replace the editor document (Tiptap JSON, a `{\"type\":\"doc\"}` root) of an UNPUBLISHED \
                 activity. Refused for a published activity; never publishes. `version` is \
                 the one read_activity returned (a stale one is refused).",
                schema::<SaveActivityDraftArgs>(),
            ),
            Self::SaveGradeDraft => (
                "Save a teacher-only grade (status `graded`): points, overall feedback, item scores and \
                 feedback. The learner sees nothing until a teacher publishes it in Ashyq; refused for a \
                 published or returned submission. `version` comes from get_submission.",
                schema::<SaveGradeDraftArgs>(),
            ),
        };
        let draft = self.scope() == TokenScope::Draft;
        Tool::new(self.name(), description, schema)
            .with_annotations(ToolAnnotations::new().read_only(!draft).destructive(false))
    }
}

fn schema<T: JsonSchema>() -> Arc<serde_json::Map<String, Value>> {
    match serde_json::to_value(schemars::schema_for!(T)) {
        Ok(Value::Object(map)) => Arc::new(map),
        _ => Arc::new(serde_json::Map::new()),
    }
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields, rename_all = "snake_case")]
enum CourseRole {
    #[default]
    Teaching,
    Learning,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct ListMyCoursesArgs {
    /// `teaching` (default): courses the caller may edit; `learning`: courses they are enrolled in.
    #[serde(default)]
    role: CourseRole,
    /// `next_cursor` from the previous page.
    cursor: Option<String>,
    /// 1..=100, default 20.
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct CourseArgs {
    /// Course id (from list_my_courses).
    #[schemars(with = "String")]
    course_id: CourseId,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct ActivityArgs {
    /// Activity id (from get_course_outline or search_course).
    #[schemars(with = "String")]
    activity_id: ActivityId,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct SearchArgs {
    #[schemars(with = "String")]
    course_id: CourseId,
    /// 1..=500 characters.
    query: String,
    /// 1..=20, default 8.
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct SubmissionArgs {
    #[schemars(with = "String")]
    submission_id: SubmissionId,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct SaveActivityDraftArgs {
    #[schemars(with = "String")]
    activity_id: ActivityId,
    /// `version` from read_activity.
    version: i32,
    /// The whole editor document: a Tiptap JSON object with `"type": "doc"`.
    content: Value,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct ItemGradeArgs {
    /// An item of the submission's assessment.
    #[schemars(with = "String")]
    item_id: uuid::Uuid,
    /// Points on the item's own scale, 0..=its max score.
    score: Option<f64>,
    /// Feedback on this answer.
    feedback: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
struct SaveGradeDraftArgs {
    #[schemars(with = "String")]
    submission_id: SubmissionId,
    /// `version` from get_submission.
    version: i32,
    /// Raw points 0..=max_points; omitted: the sum of the item scores (or the stored override).
    final_points: Option<f64>,
    /// Overall feedback (Markdown, at most 10 000 characters).
    feedback: Option<String>,
    #[serde(default)]
    item_grades: Vec<ItemGradeArgs>,
    /// A note for the grading history; never shown to the learner.
    audit_note: Option<String>,
}

/// Why a tool call failed: a stable code for the audit row and the text the client gets.
struct ToolError {
    code: String,
    body: Value,
}

impl ToolError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            body: json!({ "code": code, "detail": message.into() }),
        }
    }
}

fn args<T: DeserializeOwned>(
    arguments: Option<serde_json::Map<String, Value>>,
) -> Result<T, ToolError> {
    serde_json::from_value(Value::Object(arguments.unwrap_or_default()))
        .map_err(|err| ToolError::new("invalid-arguments", err.to_string()))
}

/// A REST handler's reply as the tool's result: the JSON body, or a [`ToolError`] with the problem.
async fn reply(response: impl IntoResponse) -> Result<Value, ToolError> {
    let response = response.into_response();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), MAX_REPLY_BYTES)
        .await
        .map_err(|err| ToolError::new("internal", err.to_string()))?;
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()))
    };
    if status.is_success() {
        return Ok(body);
    }
    let code = body
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or(if status == StatusCode::NOT_FOUND {
            "not-found"
        } else {
            "internal"
        })
        .to_owned();
    Err(ToolError { code, body })
}

fn if_match(version: i32) -> HeaderMap {
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&format!("\"{version}\"")) {
        headers.insert(header::IF_MATCH, value);
    }
    headers
}

fn body(value: &Value) -> axum::body::Bytes {
    axum::body::Bytes::from(value.to_string())
}

/// The document as plain text (the retrieval chunker's reading of it).
fn plain_text(name: &str, content: &Value) -> String {
    ab_domain::retrieval::chunker::lesson_pieces(name, content)
        .into_iter()
        .map(|piece| piece.body)
        .collect::<Vec<_>>()
        .join("\n\n")
}

impl McpServer {
    /// Runs one tool; returns the reply and what it was about (for the audit row).
    async fn run(
        &self,
        tool: ToolName,
        arguments: Option<serde_json::Map<String, Value>>,
        caller: &TokenCaller,
    ) -> (Result<Value, ToolError>, Value) {
        let state = || axum::extract::State(self.state.clone());
        let actor = caller.actor.clone();
        match tool {
            ToolName::ListMyCourses => (self.list_my_courses(actor, arguments).await, Value::Null),
            ToolName::GetCourseOutline => match args::<CourseArgs>(arguments) {
                Err(e) => (Err(e), Value::Null),
                Ok(a) => {
                    let target = json!({ "course_id": a.course_id });
                    (self.course_outline(actor, a).await, target)
                }
            },
            ToolName::ReadActivity => match args::<ActivityArgs>(arguments) {
                Err(e) => (Err(e), Value::Null),
                Ok(a) => {
                    let target = json!({ "activity_id": a.activity_id });
                    (self.read_activity(actor, a).await, target)
                }
            },
            ToolName::SearchCourse => match args::<SearchArgs>(arguments) {
                Err(e) => (Err(e), Value::Null),
                Ok(a) => {
                    let target = json!({ "course_id": a.course_id });
                    let request = json!({ "query": a.query, "limit": a.limit.unwrap_or(8) });
                    let result = reply(
                        routes::ai_first::search_course(
                            state(),
                            CurrentActor(actor),
                            Path(a.course_id),
                            body(&request),
                        )
                        .await,
                    )
                    .await
                    .map(|hits| json!({ "hits": hits }));
                    (result, target)
                }
            },
            ToolName::GetSubmission => match args::<SubmissionArgs>(arguments) {
                Err(e) => (Err(e), Value::Null),
                Ok(a) => {
                    let target = json!({ "submission_id": a.submission_id });
                    let result = reply(
                        routes::grading::review_submission(
                            state(),
                            CurrentActor(actor),
                            Path(a.submission_id),
                        )
                        .await,
                    )
                    .await;
                    (result, target)
                }
            },
            ToolName::SaveActivityDraft => match args::<SaveActivityDraftArgs>(arguments) {
                Err(e) => (Err(e), Value::Null),
                Ok(a) => {
                    let target = json!({ "activity_id": a.activity_id, "version": a.version });
                    (self.save_activity_draft(&actor, a).await, target)
                }
            },
            ToolName::SaveGradeDraft => match args::<SaveGradeDraftArgs>(arguments) {
                Err(e) => (Err(e), Value::Null),
                Ok(a) => {
                    let target = json!({ "submission_id": a.submission_id, "version": a.version });
                    (self.save_grade_draft(&actor, a).await, target)
                }
            },
        }
    }

    async fn list_my_courses(
        &self,
        actor: ab_domain::identity::Actor,
        arguments: Option<serde_json::Map<String, Value>>,
    ) -> Result<Value, ToolError> {
        let state = || axum::extract::State(self.state.clone());
        let a: ListMyCoursesArgs = args(arguments)?;
        match a.role {
            CourseRole::Teaching => {
                let cursor = a
                    .cursor
                    .map(|c| c.parse::<CourseId>())
                    .transpose()
                    .map_err(|e| ToolError::new("invalid-arguments", e.to_string()))?;
                let query = crate::dto::courses::CourseListQuery {
                    cursor,
                    limit: a.limit,
                    mine: Some(true),
                    ..Default::default()
                };
                reply(routes::courses::list_courses(state(), MaybeActor(actor), Query(query)).await)
                    .await
            }
            CourseRole::Learning => {
                let query = routes::progress::TrailQuery {
                    cursor: a.cursor,
                    limit: Some(a.limit.unwrap_or(20)),
                };
                reply(
                    routes::progress::list_enrollments(state(), MaybeActor(actor), Query(query))
                        .await,
                )
                .await
            }
        }
    }

    async fn course_outline(
        &self,
        actor: ab_domain::identity::Actor,
        a: CourseArgs,
    ) -> Result<Value, ToolError> {
        let state = || axum::extract::State(self.state.clone());
        let course = reply(
            routes::courses::get_course(state(), MaybeActor(actor.clone()), Path(a.course_id))
                .await,
        )
        .await?;
        let outline = reply(
            routes::curriculum::get_curriculum(state(), MaybeActor(actor), Path(a.course_id)).await,
        )
        .await?;
        Ok(json!({ "course": course, "chapters": outline.get("chapters") }))
    }

    async fn read_activity(
        &self,
        actor: ab_domain::identity::Actor,
        a: ActivityArgs,
    ) -> Result<Value, ToolError> {
        let state = || axum::extract::State(self.state.clone());
        let mut detail = reply(
            routes::curriculum::get_activity(state(), MaybeActor(actor), Path(a.activity_id)).await,
        )
        .await?;
        let name = detail["name"].as_str().unwrap_or_default().to_owned();
        let text = plain_text(&name, &detail["content"]);
        if let Some(map) = detail.as_object_mut() {
            map.insert("text".into(), Value::String(text));
        }
        Ok(detail)
    }

    /// The content PATCH of `PATCH /activities/{id}`, only while the activity is unpublished.
    ///
    /// The published flag is read at `version`, and the write carries `If-Match: version`: a publish
    /// in between moves the version, so the write is refused (412) instead of going live.
    async fn save_activity_draft(
        &self,
        actor: &ab_domain::identity::Actor,
        a: SaveActivityDraftArgs,
    ) -> Result<Value, ToolError> {
        let state = || axum::extract::State(self.state.clone());
        // The write gate first (403/404 before anything about the activity).
        self.state
            .curriculum
            .writable_activity(actor, a.activity_id)
            .await
            .map_err(|err| problem(&err))?;
        let current = reply(
            routes::curriculum::get_activity(
                state(),
                MaybeActor(actor.clone()),
                Path(a.activity_id),
            )
            .await,
        )
        .await?;
        if current["published"].as_bool() != Some(false) {
            return Err(ToolError::new(
                "activity-published",
                "the activity is published: a draft save would go live; unpublish it in Ashyq first",
            ));
        }
        if current["version"].as_i64() != Some(i64::from(a.version)) {
            return Err(ToolError::new(
                "precondition-failed",
                "the activity changed since you read it; read it again",
            ));
        }
        reply(
            routes::curriculum::update_activity(
                state(),
                CurrentActor(actor.clone()),
                Path(a.activity_id),
                if_match(a.version),
                body(&json!({ "content": a.content })),
            )
            .await,
        )
        .await
    }

    /// `PATCH /submissions/{id}/grade` with `action: save` (teacher-only), never on a released grade.
    async fn save_grade_draft(
        &self,
        actor: &ab_domain::identity::Actor,
        a: SaveGradeDraftArgs,
    ) -> Result<Value, ToolError> {
        let state = || axum::extract::State(self.state.clone());
        let current = reply(
            routes::grading::review_submission(
                state(),
                CurrentActor(actor.clone()),
                Path(a.submission_id),
            )
            .await,
        )
        .await?;
        if matches!(current["status"].as_str(), Some("published" | "returned")) {
            return Err(ToolError::new(
                "grade-released",
                "the grade is already with the learner; change it in Ashyq",
            ));
        }
        let mut request = json!({
            "action": "save",
            "item_grades": a.item_grades.iter().map(|g| json!({
                "item_id": g.item_id, "score": g.score, "feedback": g.feedback,
            })).collect::<Vec<_>>(),
        });
        if let Some(map) = request.as_object_mut() {
            if let Some(points) = a.final_points {
                map.insert("final_points".into(), json!(points));
            }
            if let Some(feedback) = a.feedback {
                map.insert("feedback".into(), Value::String(feedback));
            }
            if let Some(note) = a.audit_note {
                map.insert("audit_note".into(), Value::String(note));
            }
        }
        reply(
            routes::grading::save_grade(
                state(),
                CurrentActor(actor.clone()),
                Path(a.submission_id),
                if_match(a.version),
                body(&request),
            )
            .await,
        )
        .await
    }
}

/// A domain refusal in the REST problem shape.
fn problem(err: &ab_core::Error) -> ToolError {
    let code = err.code().as_str().to_owned();
    let problem = crate::error::Problem::from_error(err);
    ToolError {
        code,
        body: serde_json::to_value(problem).unwrap_or(Value::Null),
    }
}

fn caller_of(context: &RequestContext<RoleServer>) -> Result<McpCaller, ErrorData> {
    context
        .extensions
        .get::<http::request::Parts>()
        .and_then(|parts| parts.extensions.get::<McpCaller>())
        .cloned()
        .ok_or_else(|| ErrorData::invalid_request("no access token", None))
}

impl ServerHandler for McpServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("ashyq", env!("CARGO_PKG_VERSION")))
            .with_instructions(
                "Ashyq Bilim, a university LMS. You act as the owner of the access token, with exactly \
                 their rights. Start with list_my_courses, then get_course_outline and read_activity. \
                 Draft tools (draft tokens only) never publish or release anything: a teacher does that \
                 in Ashyq.",
            )
    }

    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<ListToolsResult, ErrorData>> + MaybeSendFuture + '_ {
        std::future::ready(caller_of(&context).map(|McpCaller { caller, .. }| {
            ListToolsResult::with_all_items(
                ToolName::ALL
                    .into_iter()
                    .filter(|t| caller.scope.allows(t.scope()))
                    .map(ToolName::tool)
                    .collect(),
            )
        }))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let McpCaller { caller, origin } = caller_of(&context)?;
        let requested: String = request.name.chars().take(64).collect();
        let (outcome, target) = match ToolName::parse(&requested) {
            None => (
                Err(ToolError::new(
                    "unknown-tool",
                    format!("no tool named {requested}"),
                )),
                Value::Null,
            ),
            Some(tool) if !caller.scope.allows(tool.scope()) => (
                Err(ToolError::new(
                    "insufficient-scope",
                    "this tool needs a token with the draft scope",
                )),
                Value::Null,
            ),
            Some(tool) => self.run(tool, request.arguments, &caller).await,
        };
        self.state
            .access_tokens
            .audit_tool_call(
                &caller,
                &requested,
                outcome.as_ref().map(drop).map_err(|e| e.code.as_str()),
                target,
                &origin,
            )
            .await
            .map_err(|err| ErrorData::internal_error(err.to_string(), None))?;
        let result = match outcome {
            Ok(value) => CallToolResult::success(vec![ContentBlock::text(pretty(&value))]),
            Err(err) => CallToolResult::error(vec![ContentBlock::text(pretty(&err.body))]),
        };
        Ok(result.into())
    }
}

fn pretty(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_default()
}
