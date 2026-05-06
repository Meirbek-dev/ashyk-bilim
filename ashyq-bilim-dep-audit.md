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

### 🟡 WORTH RECONSIDERING

#### `@react-pdf/renderer` ^4.5.1

Known pain points: slow (Yoga layout engine in JS), limited CSS support, no HTML input. Since your backend already has a WeasyPrint pipeline for PDF export, this package may be entirely unnecessary on the frontend.

**Alternatives:**

1. **`@fileforge/react-print`** — newer API, better CSS fidelity, server-side focused
2. **`pdfme`** — template-based approach, good for certificates/reports with fixed layouts
3. **Drop it** and route all PDF generation through your existing FastAPI + WeasyPrint endpoint

---

#### `artplayer` ^5.4.0

Niche Chinese-origin video player. Low stars (~5k), limited community.

**Alternatives:**

1. **`vidstack`** — modern, Lit-based, framework-agnostic, excellent accessibility, HLS/DASH support built-in. Best-in-class in 2025.
2. **`plyr`** — simpler, very polished, wide browser support
3. **Native `<video>` + `hls.js`** — if you only need HLS adaptive streaming with no UI chrome

---

#### `qrcode` ^1.5.4

Old CommonJS package with a large dependency tree.

**Alternatives:**

1. **`uqr`** — 1KB, tree-shakeable, modern ESM, returns SVG string or matrix
2. **`qr-code-styling`** — if you want styled QR codes with logos/colors

---

### 🟢 FINE — alternatives for awareness only

| Package              | Status | Alternatives                                   |
| -------------------- | ------ | ---------------------------------------------- |
| `katex`              | Keep   | `temml` (lighter, MathML output)               |
| `react-markdown` v10 | Keep   | `mdx-js/mdx` (if you need MDX execution)       |

---

## PART 2 — BACKEND (`pyproject.toml`)

---

### 🟡 WORTH RECONSIDERING

---

### Dev Dependencies

| Package          | Status                | Alternatives                                                                                            |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `mypy`           | 🟡 Consider replacing | **`pyright`** (10-100x faster, better inference, used by Pylance) or **`basedpyright`** (stricter fork) |

---

## SUMMARY: Priority Actions

### Do immediately (low risk, high value)

1. **Remove `marked`** — redundant with `react-markdown`

### Evaluate this sprint

1. **Replace `artplayer`** → `vidstack` — better maintained, better accessibility
2. **Replace `mypy`** → `pyright` or `basedpyright` — dramatically faster type checking

### Evaluate next quarter

1. **Replace `@react-pdf/renderer`** — route all PDF through your WeasyPrint backend pipeline
