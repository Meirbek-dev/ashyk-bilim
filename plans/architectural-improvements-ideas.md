### 3. Clear Data Fetching & State Boundaries

#### 🔍 The Analysis

The frontend features a combination of Next.js Server Actions (`src/actions/`), App Router API Handlers (`src/api/`), TanStack Query hooks (`react-query`), and custom fetch clients (`src/services/`). Without formal alignment rules, engineers may inadvertently introduce client-side waterfalls, break progressive enhancement, or miss server-side caching opportunities.

#### 🚀 High-Gain Improvement

Adopt a clear architectural protocol for data operations based on intent:

```
                  ┌───────────────────────────────┐
                  │      Data Operation Intent    │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
   [ READ DATA ]                                    [ MUTATE DATA ]
         │                                                 │
 ┌───────┴───────┐                                 ┌───────┴───────┐
 ▼               ▼                                 ▼               ▼
[Initial Paint] [Dynamic/Interactive]       [Standard UI Forms] [Heavy/Streaming Payloads]
 │               │                           │                   │
 ▼               ▼                           ▼                   ▼
Server Comps    TanStack Query via          Server Actions      Direct Client Fetch
Direct Fetch    FastAPI Routers             ('use server')      to FastAPI Routers

```

* **Initial Paints (Reads):** Fetch directly inside your Next.js Server Components utilizing your server-side repository layers (`src/lib/course-management-server.ts`). This eliminates unnecessary HTTP overhead and network hops during the initial page paint.
* **Interactive/Dynamic Elements (Reads):** Keep using TanStack Query, wrapping your query keys systematically within `src/lib/react-query/queryKeys.ts` (which is already structured cleanly).
* **Standard Forms (Mutations):** Standardize on **Server Actions** (`'use server'`) for operations like profile modifications, gamification adjustments, or simple text changes. This provides out-of-the-box progressive enhancement and trivial cache invalidation via `revalidatePath` or `revalidateTag`.
* **Complex Payloads (Mutations):** Use standard client-side `fetch` operations to your FastAPI route endpoints for complex inputs, batch operations (like multi-row grading grids), or streaming inputs (like your Judge0 code challenges) where fine-grained request tracking or upload control is vital.

---

### 4. Resilient Background Processing for the Event Bus

#### 🔍 The Analysis

Your backend has a clean, event-driven pattern using an in-memory or async subscriber layout (`src/services/events/bus.py`) that distributes events for analytics recalculations, plagiarism detection, and gamification XP updates. It also runs a separate background worker queue (`src/worker/`).

If long-running processes—such as your `plagiarism_checker.py` task or heavy analytics rollups—are executed synchronously or inside the same async event loop thread as your main web server, they risk blocking high-concurrency requests or crashing under load.

#### 🚀 High-Gain Improvement

Formally enforce task isolation through your Redis infrastructure:

* Ensure that any operation triggered from your event bus that takes longer than 50ms (e.g., deep plagiarism scanning or compiling aggregate student metrics) is strictly pushed as a message payload to your Redis task broker (`src/worker/broker.py`).
* Let your background worker instances handle the execution of these resource-intensive processes asynchronously.
* **Gain:** The user-facing FastAPI application remains completely unblocked, allowing it to respond to student submission requests with sub-10ms latencies, even during heavy examination periods.

---

