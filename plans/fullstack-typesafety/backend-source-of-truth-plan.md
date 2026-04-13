# Fullstack Typesafety Plan

## Document Status

- Scope: establish backend-driven API contracts and generated frontend types for the existing
  FastAPI + Next.js monorepo
- Audience: backend, frontend, platform, and QA contributors working in this repository
- Goal: make backend request and response models the single source of truth for API contracts, then
  generate and enforce matching frontend types

## Executive Summary

The repository already has the right primitives for backend-first typesafety, but they are not yet
connected into one contract workflow.

The backend uses FastAPI with Pydantic and SQLModel models, which means it can already emit an
OpenAPI schema. The frontend still relies on many handwritten request and response types,
handwritten fetch wrappers, and separate Valibot form schemas. That leaves drift risk in exactly the
places that matter most: request bodies, response payloads, pagination metadata, and enum-like
fields.

The target state is straightforward:

- backend request and response DTOs define the contract
- FastAPI emits a stable OpenAPI document from those DTOs
- frontend types and API client helpers are generated from OpenAPI
- Valibot remains in the frontend for form UX and runtime validation, but not as the primary source
  of API contract truth
- CI blocks contract drift

This is not a one-step tooling change. The current backend still has routes without explicit
`response_model` declarations, and the frontend has many service modules that parse `fetch()`
results as `any`. The plan therefore needs explicit contract hardening on the backend before code
generation can become authoritative.

## Confirmed Current Baseline

### Backend

- FastAPI app already exposes docs and Redoc in development mode
- The codebase already uses strict Pydantic base models and SQLModel base models
- A large number of domain DTOs already exist under `apps/api/src/db/` and
  `apps/api/src/services/.../schemas/`
- Some routes already use explicit `response_model=` declarations
- Many routes still return raw dictionaries, implicit models, or mixed response shapes (fix that)

### Frontend

- The frontend has many handwritten service modules under `apps/web/services/`
- Request helpers are centralized, but most endpoint payloads are not strongly typed end-to-end
- There are handwritten interfaces and `any`-typed responses in service modules
- Valibot is already widely used for form validation and some domain schemas
- There is currently no OpenAPI-based type generation or generated client layer in the web app

## Core Decision

The backend OpenAPI schema should be the contract artifact.

That implies four concrete rules:

1. Every externally consumed API endpoint must have explicit request and response models.
2. Frontend request and response types must be generated from OpenAPI rather than handwritten.
3. Generated types must live in a predictable location and be refreshed automatically.
4. CI must fail when backend contract changes are not reflected in generated frontend artifacts.

## Tooling Recommendation

### Primary contract toolchain

- Backend schema source: FastAPI OpenAPI generated from Pydantic DTOs
- Type generator: `openapi-typescript`
- Typed client option: `openapi-fetch` for a lightweight typed fetch wrapper
- Optional richer generator: `orval` if the team later wants generated SDK modules and hook
  scaffolding

### Why this fits this repository

- It matches the existing FastAPI stack with minimal backend churn
- It avoids inventing a second schema system shared across Python and TypeScript
- It supports incremental adoption route by route
- It works cleanly with the current monorepo structure
- It lets the team keep Valibot where it already adds value: frontend form parsing and runtime
  checks

### What not to do

- Do not use SQLModel table classes as the public API contract by default
- Do not keep adding handwritten frontend interfaces for backend responses
- Do not attempt to make Valibot the source of truth for backend contracts
- Do not try to share Python models directly with TypeScript through custom ad hoc scripts

## Desired End State

By the end of this effort:

- every API route used by the web app has a stable request and response DTO
- the backend can export a committed `openapi.json` artifact or generate it deterministically
- the frontend imports generated API types instead of hand-maintained payload interfaces
- the frontend service layer uses typed responses and typed request bodies
- handwritten duplicate API types are removed or reduced to UI-only view models
- contract drift is caught before merge

## Architecture Plan

### 1. Separate persistence models from transport models

The repository already contains many Pydantic and SQLModel classes, but they are not consistently
separated by concern.

The rule going forward should be:

- SQLModel classes represent persistence and ORM concerns
- Pydantic DTOs represent API request and response contracts
- routers should accept and return DTOs, not raw ORM objects and not loosely shaped dictionaries

This is especially important for:

- hidden internal fields
- backward-compatible contract changes
- enum normalization
- timestamp formatting
- nested response structures
- pagination wrappers and metadata headers

### 2. Make OpenAPI complete and predictable

FastAPI only becomes a useful contract source when route contracts are explicit.

Required backend standards:

- every route consumed by the frontend declares `response_model=` explicitly
- every non-trivial request body uses a named Pydantic DTO
- every error response uses a documented shared shape where practical
- inconsistent implicit `dict` responses are replaced with DTOs or typed response classes
- routes returning lists or paginated results should use named wrapper DTOs where possible instead
  of relying on out-of-band knowledge

### 3. Generate TypeScript artifacts into a dedicated package or folder

Use one generated output location only. Two viable placements:

- `apps/web/lib/api/generated/`
- `packages/api-contract/`

Preferred initial choice for lowest friction:

- `apps/web/lib/api/generated/`

That keeps adoption simple and avoids introducing a new workspace package before the contract
surface stabilizes.

### 4. Keep frontend runtime validation focused on user input

Valibot should remain responsible for:

- form validation
- coercion and normalization of local UI input
- extra client-only constraints not represented by the server

Generated API types should be responsible for:

- request body typing
- response payload typing
- path parameter typing
- query parameter typing where the generator supports it

The frontend should stop duplicating server DTOs as Valibot domain schemas unless they truly
represent UI-specific input state rather than API transport objects.

## Implementation Phases

### Phase 0. Contract inventory

Goal: identify the routes the web app actually consumes and measure contract quality.

Tasks:

- inventory all API calls in `apps/web/services/` and `apps/web/app/**/actions/`
- map each frontend call to its backend route
- classify each route as one of:
  - explicit request + explicit response model
  - explicit request + implicit response
  - implicit request + implicit response
  - custom response shape with headers
- identify endpoints returning `any` in frontend code
- identify endpoints returning raw dictionaries in backend routers

Deliverable:

- route inventory table with migration priority and ownership

Exit criteria:

- the team has a ranked backlog of contract gaps rather than trying to convert everything blindly

### Phase 1. Backend contract hardening

Goal: make the backend OpenAPI schema trustworthy enough for generation.

Tasks:

- add missing `response_model=` declarations to frontend-consumed routes
- replace implicit dictionary returns with named DTOs
- introduce wrapper DTOs for paginated list endpoints and compound responses
- standardize common error payloads where practical
- ensure enums, unions, nullable fields, and timestamps serialize consistently
- avoid leaking ORM-only or internal fields through default model serialization

Recommended standards:

- one DTO for create/update input when shapes differ materially from read models
- one DTO for read output per externally consumed shape
- one named paginated wrapper DTO per domain family if headers are not enough
- explicit aliases only when there is a strong compatibility reason

Exit criteria:

- OpenAPI generated locally is structurally accurate for the initial migration slice

### Phase 2. OpenAPI export workflow

Goal: make schema generation reproducible for local development and CI.

Tasks:

- add a backend script that imports the FastAPI app and writes `openapi.json`
- make the script deterministic and safe to run in CI
- choose whether to commit the generated schema or generate it transiently in CI
- add a package script or Turbo task to refresh the schema artifact

Recommended output path:

- `apps/api/openapi.json`

Recommended command shape:

- backend script: generate OpenAPI from `app.app`
- top-level task: `turbo run generate:contracts`

Decision on committed artifact:

- commit `openapi.json` initially

Reason:

- committed artifacts make contract diffs reviewable in pull requests and simplify frontend
  generation

### Phase 3. Frontend type generation

Goal: replace handwritten transport types with generated types.

Tasks:

- add `openapi-typescript` to the web app or workspace tooling
- generate TypeScript definitions from `apps/api/openapi.json`
- introduce a single import surface for generated types
- optionally add `openapi-fetch` to produce a typed client wrapper around existing fetch behavior
- document the boundary between generated API types and UI-specific view models

Recommended generated files:

- generated schema types file
- thin typed client wrapper
- optional helper types for paths, methods, and responses

Exit criteria:

- at least one domain vertical is fully switched from handwritten transport types to generated types

### Phase 4. Frontend service layer migration

Goal: move endpoint modules from loose fetch calls to typed contracts.

Migration order should prioritize high-traffic or high-drift domains:

1. auth and session
2. users and platform config
3. courses and chapters
4. activities and grading
5. analytics
6. payments and edge-case feature areas

Tasks per domain:

- type path params, query params, request bodies, and responses from generated contracts
- remove duplicated local interfaces that mirror backend DTOs
- replace `any` response handling with contract-derived types
- keep local mapping functions only where the UI intentionally reshapes transport data
- preserve existing fetch/cache behavior while swapping types underneath first

Important rule:

- do not combine transport migration and feature rewrites in the same PR

### Phase 5. CI enforcement

Goal: prevent regression back to handwritten drift.

Checks to add:

- backend OpenAPI generation succeeds
- generated frontend types are up to date
- typecheck runs against generated artifacts
- contract diff is visible in pull requests

Useful CI patterns:

- fail if regenerating `openapi.json` changes tracked files
- fail if regenerating TypeScript contracts changes tracked files
- optionally warn on routes missing `response_model=` for frontend-consumed endpoints

## Proposed Repository Changes

### Backend

- add an OpenAPI export script under the API app
- add a backend script entry for schema generation
- add DTO cleanup backlog items across routers

### Frontend

- add generated contract output directory
- add generation script in `apps/web/package.json` or root package scripts
- add a typed API client utility layer
- migrate service modules domain by domain

### Monorepo

- add a shared Turbo task for contract generation

## Detailed Standards

### Backend DTO standards

- DTO names should reflect API intent, not ORM implementation detail
- public response DTOs should be stable and explicit
- request DTOs should use optional fields intentionally for patch semantics
- list endpoints should prefer named wrappers over undocumented header-plus-array contracts when
  practical
- custom serialization behavior should be centralized and tested

### Frontend standards

- generated API types are never edited manually
- generated types are imported through a small stable barrel file
- service modules may map generated transport types into UI view models, but only after the network
  boundary
- form schemas may remain Valibot-based, but submission payloads should satisfy generated backend
  DTOs

### Error contract standards

The repository already uses a shared `error_code` + `message` shape in several places. That should
become the documented default error contract for JSON error responses where practical.

For this effort, the key requirement is consistency rather than perfection. A partly standardized
error contract is still better than undocumented ad hoc payloads.

## Risks And Constraints

### Risk 1. OpenAPI quality may be weaker than expected

FastAPI can only generate useful contracts from explicit route declarations. Existing implicit
returns will need cleanup before generation is reliable.

Mitigation:

- migrate one domain at a time
- use contract review in PRs
- add tests for serialized DTO shapes where endpoints are subtle

### Risk 2. Header-based pagination metadata is not visible enough in generated types

Some current endpoints return arrays in the body and counts in headers.

Mitigation:

- either keep a typed frontend wrapper that combines body + headers into a local return shape
- or move priority endpoints to named paginated response DTOs in the body

The second option is better long term, but the first option is lower risk for incremental migration.

### Risk 3. Generated types may expose awkward backend naming

If backend field names are inconsistent, generation will faithfully reproduce that inconsistency.

Mitigation:

- clean the contract at the DTO layer before broad migration
- use explicit DTO naming and serialization decisions rather than post-processing TypeScript output
  heavily

### Risk 4. Frontend developers may keep adding parallel handwritten interfaces

Mitigation:

- treat handwritten duplicates as migration debt

## Recommended Initial Slice

Do not start with the hardest domain. Start with one vertical that is important, bounded, and
already uses explicit Pydantic models in several places.

Recommended first slice:

- auth/session
- gamification
- analytics

Why these are good candidates:

- they already have visible DTO usage in the backend
- they have relatively clear response models
- they provide immediate frontend value
- they let the team validate generation before tackling more complex course editing flows

## Suggested Milestones

### Milestone 1. Schema is exportable

- OpenAPI export script exists
- `openapi.json` is generated and reviewed
- initial contract gaps are logged

### Milestone 2. One domain is fully typed

- one backend domain has explicit request/response DTO coverage
- one frontend domain imports generated types only for transport contracts
- CI validates generation

### Milestone 3. Shared transport pattern is established

- typed client helpers are in place
- service-layer migration recipe is documented
- duplicate interface creation stops by convention

### Milestone 4. Core web domains are migrated

- auth, users, platform, courses, and analytics are on generated contracts
- remaining handwritten transport types are tracked as exceptions only

## Concrete Deliverables

- OpenAPI export script in the API app
- generated `openapi.json` artifact
- generated TypeScript contract output in the web app
- typed API client helper layer
- migration backlog by domain
- CI job enforcing schema and type generation freshness
- contributor documentation covering how to change an API contract safely

## Example Developer Workflow

1. Change or add a backend DTO.
2. Update the router to use explicit request and response models.
3. Regenerate `openapi.json`.
4. Regenerate frontend contract types.
5. Update the frontend service module to use generated types.
6. Run typecheck and targeted tests.
7. Commit backend contract changes together with generated artifacts and frontend updates.

## Success Criteria

This effort is successful when the following are true:

- frontend transport typing is generated instead of manually mirrored
- backend DTO changes produce visible, reviewable contract diffs
- frontend breakage from contract changes appears at compile time rather than runtime
- new endpoints cannot quietly ship with undocumented or loosely typed payloads
- the team can migrate incrementally without stopping feature work across the whole repo

## Recommended Next Actions

1. Inventory frontend-consumed routes and mark missing backend `response_model=` coverage.
2. Add an OpenAPI export script and commit the first generated schema.
3. Add `openapi-typescript` in the web toolchain and generate initial contract files.
4. Migrate one bounded domain end-to-end before touching the rest of the service layer.
