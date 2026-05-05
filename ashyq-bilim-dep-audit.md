# Ashyq Bilim — Dependency Audit & Modernization Guide

> **Legend:** 🔴 Critical issue / replace now · 🟡 Worth reconsidering · 🟢 Fine, alternatives listed for awareness · ⚠️ Redundant with another dep

---

## PART 1 — FRONTEND (`package.json`)

---

### 🔴 CRITICAL: Redundancies & Issues

#### `marked` ⚠️ redundant with `react-markdown`

You have two full markdown pipelines. `react-markdown` uses the unified/remark ecosystem (which you already depend on via `remark-gfm`) and is the correct React-native solution. `marked` appears to be dead weight — likely a legacy import.

**Action:** Remove `marked`. If you need raw HTML string output (outside React), inline a tiny `unified().use(remarkParse).use(remarkHtml)` call.

---

#### `passlib[argon2]` + `argon2-cffi` ⚠️ double dependency

`passlib` calls `argon2-cffi` internally. You are shipping both, which means two packages doing the same job. **Additionally, `passlib` has been effectively unmaintained since late 2023** (last release: 1.7.4, same version you pin). This is a genuine security risk for an auth-critical library.

**Action:** Drop `passlib` entirely. Use `argon2-cffi` directly — it takes 5 lines of code:

```python
from argon2 import PasswordHasher
ph = PasswordHasher()
hash = ph.hash("password")
ph.verify(hash, "password")
```

---

#### `fastapi-users` + `PyJWT` + `passlib` + `argon2-cffi` — fragmented auth

You have four half-overlapping auth packages. `fastapi-users` brings its own JWT and hashing opinions, then `PyJWT` does JWT separately, and `passlib`/`argon2-cffi` do hashing separately. This is a maintenance maze. You previously evaluated ZITADEL + joserfc — that remains the cleaner path.

**Alternatives to the whole cluster:**

1. **ZITADEL + `joserfc`** — externalise auth entirely; `joserfc` handles JWT verification with modern JOSE standards (JWK, JWE, nested tokens)
2. **`fastapi-users` only** — but pin a fork or wait for 1.x; at least drop the redundant `PyJWT`/`passlib`
3. **`starlette-oauth2-api`** — if you're going external-IdP only

---

#### `openai` SDK ⚠️ partially redundant with `pydantic-ai-slim[openai]`

`pydantic-ai-slim[openai]` already vendors an OpenAI client internally. You likely only need the bare `openai` package if you're making raw API calls that PydanticAI doesn't cover (fine-tuning jobs, assistants API, batch API). Audit your usage — you may be able to drop the standalone `openai` package.

**Alternative:** `litellm` — single SDK for OpenAI, Anthropic, Gemini, local Ollama, etc. Useful if you ever add multi-provider support.

---

### 🟡 WORTH RECONSIDERING

#### `@react-pdf/renderer` ^4.5.1

Known pain points: slow (Yoga layout engine in JS), limited CSS support, no HTML input. Since your backend already has a WeasyPrint pipeline for PDF export, this package may be entirely unnecessary on the frontend.

**Alternatives:**

1. **`@fileforge/react-print`** — newer API, better CSS fidelity, server-side focused
2. **`pdfme`** — template-based approach, good for certificates/reports with fixed layouts
3. **Drop it** and route all PDF generation through your existing FastAPI + WeasyPrint endpoint

---

#### `class-variance-authority` + `clsx` + `tailwind-merge` — three-package utility stack

CVA + clsx + tailwind-merge is the standard shadcn stack, but it's three packages for one job.

**Alternative:**

1. **`tailwind-variants`** (`tv`) — single package that replaces all three. Has built-in conflict resolution (same as tailwind-merge) and variant composition (same as CVA). Better TypeScript inference.

---

#### `cmdk` ^1.1.1

The original `cmdk` by Pacocoursey was excellent but development has slowed. The ecosystem has fragmented.

**Alternatives:**

1. **`@base-ui/react` Menu/Popover** — you already have `@base-ui/react`; their combobox covers 90% of cmdk use cases
2. **`kbar`** — more featureful command palette with keyboard shortcut registration
3. **`fumadocs-ui` cmdk fork** — actively maintained fork used by many Next.js doc sites

---

#### `artplayer` ^5.4.0

Niche Chinese-origin video player. Low stars (~5k), limited community.

**Alternatives:**

1. **`vidstack`** — modern, Lit-based, framework-agnostic, excellent accessibility, HLS/DASH support built-in. Best-in-class in 2025.
2. **`plyr`** — simpler, very polished, wide browser support
3. **Native `<video>` + `hls.js`** — if you only need HLS adaptive streaming with no UI chrome

---

#### `react-day-picker` ^9.14.0

Good library. However, if you're already using `@base-ui/react`:

**Alternatives:**

1. **`@base-ui/react` Calendar** — Base UI 1.x has a calendar primitive; avoids adding another date UI library
2. **`react-aria` Calendar** — Adobe's accessibility-first calendar, exceptional keyboard/screen reader support
3. **`@ark-ui/react` DatePicker** — headless, Zag.js state machines underneath, very composable

---

#### `recharts` ^3.8.1

Established, but the API is verbose and bundle size is significant (~500KB).

**Alternatives:**

1. **`Observable Plot`** — Mike Bostock's (D3 author) modern charting library. Concise grammar-of-graphics API, excellent for data exploration.
2. **`unovis`** — component-based, framework-agnostic, excellent TypeScript types, actively developed by Accenture
3. **`tremor`** — if you want dashboard-ready React chart components with zero configuration

---

#### `motion` ^12.38.0 (Framer Motion)

Fine library, but `motion` 12.x is a massive bundle. If you only use entrance animations:

**Alternatives:**

1. **`@motionone/dom`** — the underlying Web Animations API layer, far lighter
2. **CSS `@starting-style` + `transition`** — native browser animation for entrance effects (supported in all modern browsers as of 2024)
3. **`react-spring`** — physics-based, great for interactive gestures

---

#### `vaul` ^1.1.2 (Drawer)

Works, but narrow scope.

**Alternative:**

1. **`@base-ui/react` Dialog** — you already have Base UI; their dialog with `side` positioning covers the drawer pattern natively

---

#### `qrcode` ^1.5.4

Old CommonJS package with a large dependency tree.

**Alternatives:**

1. **`uqr`** — 1KB, tree-shakeable, modern ESM, returns SVG string or matrix
2. **`qr-code-styling`** — if you want styled QR codes with logos/colors

---

### 🟢 FINE — alternatives for awareness only

| Package                    | Status                          | Alternatives                                                           |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `@dnd-kit/*`               | Best in class                   | `pragmatic-drag-and-drop` (Atlassian, newer but lower-level)           |
| `@monaco-editor/react`     | Industry standard               | `@uiw/react-codemirror` (CodeMirror 6, lighter)                        |
| `@tanstack/react-query` v5 | Keep                            | —                                                                      |
| `@tanstack/react-table` v8 | Keep                            | `ag-grid-react` (heavy but ultimate features)                          |
| `@tiptap/*` v3             | Keep                            | `novel` (AI-first TipTap wrapper), `BlockNote`                         |
| `date-fns` v4              | Keep                            | `@internationalized/date` (React Aria), Temporal API (native, Stage 3) |
| `katex`                    | Keep                            | `temml` (lighter, MathML output)                                       |
| `next` v16                 | Keep                            | —                                                                      |
| `react` v19                | Keep                            | —                                                                      |
| `react-hook-form` v7       | Keep                            | `TanStack Form` v1 (if you want tighter TanStack integration)          |
| `react-markdown` v10       | Keep                            | `mdx-js/mdx` (if you need MDX execution)                               |
| `react-resizable-panels`   | Keep                            | `allotment` (VS Code panels, Electron-style)                           |
| `sharp`                    | Keep                            | —                                                                      |
| `sonner`                   | Keep                            | —                                                                      |
| `tailwind-merge`           | Keep (if not migrating to `tv`) | —                                                                      |
| `tailwindcss` v4           | Keep                            | —                                                                      |
| `zustand` v5               | Keep                            | `jotai` v2 (atomic), `valtio` (proxy-based)                            |

---

## PART 2 — BACKEND (`pyproject.toml`)

---

### 🔴 CRITICAL ISSUES

#### `PyJWT` ⚠️ redundant if using `fastapi-users`

`fastapi-users` handles JWT internally. Two JWT libraries is one too many.

**Alternatives:**

1. **`joserfc`** — modern JOSE implementation, supports JWK sets (critical for ZITADEL integration), JWE, nested JWTs. Far more complete than PyJWT.
2. **`python-jose`** — broader JOSE support but less maintained
3. Keep `PyJWT` only if you drop `fastapi-users`

---

### 🟡 WORTH RECONSIDERING

---

#### `sqlmodel` ^0.0.38

SQLModel is still on `0.x` and has had slow development velocity. It's a thin Pydantic+SQLAlchemy layer.

**Alternatives:**

1. **Raw `SQLAlchemy` 2.0** with `mapped_column` + Pydantic models separately — more control, no "magic" layer, and SQLAlchemy 2.0's declarative style is nearly as ergonomic

---

#### `python-ulid` ^3.1.0

ULID is great, but Python 3.14 (which you're pinning!) now has `uuid` module support for **UUID v7**, which gives you time-ordered UUIDs natively without any extra package.

**Action:** Evaluate replacing `python-ulid` with `uuid.uuid7()` from the standard library. UUID v7 is monotonically increasing like ULID, is universally supported in PostgreSQL, and needs zero extra dependencies.

---

#### `cachetools` ^7.1.0

Pure Python in-memory caching — slow for high-throughput cases.

**Alternatives:**

1. **`cachebox`** — Rust-backed caching library with Python bindings. 10-20x faster than `cachetools` for the same API surface. Drop-in for most use cases.
2. **`aiocache`** — async-native cache with Redis/Memcached backends; better fit for FastAPI

---

#### `slowapi` ^0.1.9

Thin wrapper around `limits` for FastAPI. Works but is very basic.

**Alternatives:**

1. **`fastapi-limiter`** — Redis-backed, async, per-route or global limits, sliding window
2. **Valkey/Redis at the reverse proxy level** (Caddy, nginx) — rate limiting in infrastructure rather than application code is more robust

---

#### `tiktoken` ^0.12.0

Only needed if you're manually counting tokens. PydanticAI and the OpenAI SDK handle this internally for most use cases.

**Alternatives:**

1. **`tokenizers`** (Hugging Face) — if you need multi-model token counting (not just OpenAI)
2. **Drop it** if you're only using it defensively — PydanticAI's usage tracking via Logfire gives you token counts without manual counting

---

#### `resend` ^2.29.0

Good transactional email service with a clean SDK.

**Alternatives:**

1. **`postmark` Python SDK** — Postmark has best-in-class deliverability, detailed bounce analytics
2. **`mailpace`** — fast, privacy-focused, European data residency
3. Fine as-is if Resend meets your needs.

---

### Dev Dependencies

| Package          | Status                  | Alternatives                                                                                            |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `mypy`           | 🟡 Consider replacing   | **`pyright`** (10-100x faster, better inference, used by Pylance) or **`basedpyright`** (stricter fork) |
| `pytest-asyncio` | 🟢 Keep                 | `anyio` test fixtures (if using anyio)                                                                  |
| `faker`          | 🟢 Keep                 | `polyfactory` (Pydantic model factories, reduces boilerplate)                                           |

---

## SUMMARY: Priority Actions

### Do immediately (low risk, high value)

1. **Remove `marked`** — redundant with `react-markdown`
2. **Remove `passlib`** — unmaintained; use `argon2-cffi` directly
3. **Audit `openai` SDK** — may be fully covered by `pydantic-ai-slim[openai]`
4. **Replace `PyJWT`** with `joserfc` — more complete JOSE support, required for ZITADEL JWK verification
5. **Replace `python-ulid`** with stdlib `uuid.uuid7()` — Python 3.14 has it natively
6. **Swap `cachetools`** → `cachebox` — drop-in replacement, 10-20x faster

### Evaluate this sprint

1. **Replace `artplayer`** → `vidstack` — better maintained, better accessibility
2. **Merge CVA + clsx + tailwind-merge** → `tailwind-variants` — one package
3. **Swap `emoji-picker-react`** → `frimousse` — 10x smaller
4. **Replace `mypy`** → `pyright` or `basedpyright` — dramatically faster type checking
5. **Consolidate `vaul`** into `@base-ui/react` Dialog — you already have it

### Evaluate next quarter

1. **Replace `@react-pdf/renderer`** — route all PDF through your WeasyPrint backend pipeline
2. **Consider `litestar`** if FastAPI performance becomes a constraint
3. **Consider `piccolo`** if SQLModel limitations frustrate you
4. **Evaluate `paraglide-next`** over `next-intl` for compile-time i18n performance
5. **Consider `tailwind-variants`** consolidation across the variant styling system
