# Buddy v2 — Design Spec

**Date:** 2026-05-21
**Status:** Approved (pending implementation plan)
**Source spec for pipeline:** `invest-page-index/` (PageIndex vectorless RAG)

## 1. Goal

A TypeScript application that lets a user chat with an AI agent about a corpus of PDF documents, organized by topic. The pipeline produces hierarchical document trees per the PageIndex spec (no vector DB; LLM reasoning navigates a TOC-derived tree). Two entry points:

- **`build-index` CLI** — runs the PageIndex pipeline for all topics or a specific topic.
- **`serve` CLI** — starts a Hono server + React web UI for chat with topic selector and conversation management.

## 2. Constraints & Decisions

| Area | Decision |
|------|----------|
| Pipeline scope | Full faithful port of PageIndex 10-step pipeline + fallback chain + verification + hierarchical agent optimization + image-solution + document-tables. |
| LLM provider | Google Gemini, default model `gemini-2.5-flash-lite`, configurable via `.env`. |
| Vision model | Same model (supports vision); separate env var allows override. |
| PDF lib | `mupdf-js` (MuPDF WASM). Matches spec usage of PyMuPDF: text per page, StructuredText for image detection, pixmap rendering. |
| Image-solution | Included in v1 (embedded detection + Vision fallback + Vision descriptions). |
| Table-process | Document-tables only in v1 (PDF-embedded). CSV/Excel deferred. |
| Hierarchical agents | Included in v1 for large nodes per `optimize/hierarchical-agent-architecture.md`. |
| Multi-doc per topic | Two-pass doc-selector → tree-reasoner. Aligns with `doc_description` field in PageIndex output. Forest-union fallback when selector returns empty. |
| Chat UI | Web (Hono server + browser). |
| Web stack | Vite + React + TypeScript + shadcn/ui + react-markdown. |
| Backend framework | Hono. |
| Streaming | SSE token streaming (`POST /api/chat/stream` with `fetch` reader on client). |
| Persistence | SQLite via `better-sqlite3`, file `data/conversations.db`. |
| Tree/artifact storage | Per-topic: `data/<topic>/.index/`. |
| Layout | pnpm workspace monorepo. |
| Build-index CLI | `--all` or `--topic <name>` flag; `--force` re-build; `--doc <path>` single doc. |
| Conversation mgmt | List + resume, rename, soft-delete, reasoning trace visible, PDF page preview inline, export md/json. |
| Concurrency | `p-limit` (default 10) + exponential backoff retry per `edge-cases/api-retry.md`. |
| Logging | `pino` + per-run file at `data/<topic>/.index/logs/<run-id>.log`. |
| Testing | Vitest unit tests + LLM-stubbed golden tree fixtures + branch-coverage fixtures. |
| Orchestration | Approach C — linear composition file with explicit branching nodes; per-step `withRetry` + `withLogger` wrappers. |
| Node | ≥ 20 (Hono, mupdf-js WASM). ESM-only. TypeScript strict. |

## 3. Architecture

### 3.1 Repo Layout

```
buddy-v2/
├── data/                                      # gitignored
│   └── <topic>/
│       ├── *.pdf
│       └── .index/
│           ├── <doc>.tree.json
│           ├── <doc>/.cache/<stepname>.json   # step caches
│           ├── <doc>/pages/<N>.png            # rendered page cache
│           ├── images/<doc>/                  # extracted images
│           └── logs/<run-id>.log
├── packages/
│   ├── shared/        # types, schemas, config, logger, gemini client, p-limit pool, pdf helper
│   ├── pipeline/      # 10-step builder + hierarchical agents + image + table
│   ├── query/         # doc-selector + tree-reasoner + retrieval + answer
│   ├── server/        # Hono API + SQLite + chokidar watcher
│   └── web/           # Vite + React frontend
├── apps/
│   ├── build-index/   # bin: `pnpm build-index --all | --topic <name>`
│   └── serve/         # bin: `pnpm serve`
├── fixtures/          # test PDFs + expected tree.json
├── .env
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### 3.2 Runtime Topology

```
build-index CLI ──► @buddy/pipeline ──► writes data/<topic>/.index/*.tree.json
                                   └─► @buddy/shared (gemini, logger, config, pdf)

serve CLI ──► @buddy/server (Hono + SSE) ──► @buddy/query ──► reads tree.json
                       │                                  └─► @buddy/shared
                       ├─► SQLite (data/conversations.db)
                       ├─► chokidar watch .index/*.tree.json (hot reload cache)
                       └─► serves @buddy/web build ──► browser
```

### 3.3 Invariants

- Pipeline writes are **idempotent + cache-able**. Each step writes intermediates; re-run skips done steps unless `--force`.
- Query layer is **read-only** on `.index/`. Pipeline never runs during chat serve.
- Single source of truth for tree shape = zod schema in `@buddy/shared/schemas/tree.ts`. Pipeline output and query input both validate against it.

## 4. Pipeline (`@buddy/pipeline`)

### 4.1 Module Layout

```
packages/pipeline/src/
├── index.ts                      # buildTopic(), buildDoc() public API
├── orchestrator.ts               # composition (Approach C)
├── steps/
│   ├── 01-extract.ts             # mupdf-js text + token count per page
│   ├── 02-detect-toc.ts          # LLM scan first N pages
│   ├── 03-toc-content.ts         # concat + regex cleanup
│   ├── 04-detect-page-numbers.ts # LLM yes/no
│   ├── 05-toc-transform.ts       # text → JSON
│   ├── 06-physical-mapping.ts    # logical → physical
│   ├── 06.5-validate-indices.ts
│   ├── 06.6-verify-fix.ts        # LLM verify + auto-fix (max 3 retries)
│   ├── 06.7-add-preface.ts
│   ├── 06.8-title-at-start.ts
│   ├── 07-build-tree.ts          # flat → nested
│   ├── 08-split-large.ts         # recursive LLM split, uses hierarchical agents
│   ├── 09-add-summaries.ts       # parallel summary LLM
│   └── 10-output-json.ts         # IDs + write tree.json
├── fallbacks/
│   ├── process-no-toc.ts
│   └── process-toc-no-page-numbers.ts
├── hierarchical/
│   ├── subgroup-agent.ts         # leaf heading extractor
│   ├── group-master.ts           # merge + hierarchy + retrieval tool
│   ├── chapter-master.ts         # final merge + renumber
│   └── orchestrator.ts           # parallel fan-out
├── image/
│   ├── detect-embedded.ts        # MuPDF StructuredText image objects
│   ├── detect-via-vision.ts      # Vision LLM bbox fallback
│   ├── crop.ts                   # pixmap crop, save to images/<doc>/
│   └── describe.ts               # Vision LLM describe → attach to tree nodes
├── table/
│   └── document-tables.ts        # extract embedded tables (MuPDF + LLM normalize)
├── prompts/                      # all LLM prompts (text or .ts strings)
└── wrappers/
    ├── with-retry.ts
    └── with-logger.ts
```

### 4.2 Orchestrator (Approach C)

```ts
export async function buildDoc(pdfPath: string, opt: Opt, ctx: Ctx) {
  const pages = await step01.extract(pdfPath, ctx);
  const images = opt.imagesEnabled ? await imagePipeline(pdfPath, pages, ctx) : [];
  const tables = opt.tablesEnabled ? await tablePipeline(pdfPath, pages, ctx) : [];

  const tocPages = await step02.detectToc(pages, ctx);
  let flatToc;
  if (tocPages.length === 0) {
    flatToc = await fallbacks.processNoToc(pages, ctx);
  } else {
    const tocText = await step03.tocContent(tocPages, ctx);
    const hasPageNums = await step04.detectPageNumbers(tocText, ctx);
    if (!hasPageNums) {
      flatToc = await fallbacks.processTocNoPageNumbers(pages, ctx);
    } else {
      const tocJson = await step05.tocTransform(tocText, ctx);
      let mapped = await step06.physicalMapping(tocJson, pages, ctx);
      mapped = step06_5.validateIndices(mapped, pages);
      const verifyResult = await step06_6.verifyAndFix(mapped, pages, ctx);
      if (verifyResult.accuracy <= 0.6) {
        flatToc = await fallbacks.processTocNoPageNumbers(pages, ctx);
      } else {
        flatToc = await step06_7.addPreface(verifyResult.mapped, ctx);
        flatToc = await step06_8.titleAtStart(flatToc, pages, ctx);
      }
    }
  }

  let tree = step07.buildTree(flatToc);
  tree = await step08.splitLarge(tree, pages, ctx);  // uses hierarchical agents for large nodes
  if (opt.addSummaries) tree = await step09.summarize(tree, pages, ctx);
  return step10.output(tree, { images, tables, pdfPath }, ctx);
}
```

Each `stepNN.xxx(...)` is wrapped internally by `withRetry` (exp backoff per `api-retry.md`) and `withLogger` (per-step structured logs). Composition file stays free of cross-cutting concerns.

### 4.3 Hierarchical Agents

Implements `optimize/hierarchical-agent-architecture.md`:

- **Sub-group agent**: ~6k token chunks; outputs `[[title, page], ...]`. Fully parallel.
- **Group Master**: merges 3 sub-group outputs, assigns hierarchy numbers, may invoke retrieval tool to fetch specific pages when uncertain (capped by `MAX_RETRIEVALS_PER_MASTER`).
- **Chapter Master**: merges all group TOCs, resolves boundary conflicts, prefixes structure numbers.

Used inside Step 8 (split large nodes) for any node exceeding `MAX_PAGES_PER_NODE`.

### 4.4 Image Pipeline

Per `docs/image-solution-concept.md` + `docs/image-solution.md`:

1. **Detect**: MuPDF StructuredText finds embedded image objects per page. If page has scanned content but no extractable text, render page → Vision LLM detects bounding boxes.
2. **Crop**: For embedded images, extract bytes directly. For Vision-detected, crop via pixmap.
3. **Save**: `data/<topic>/.index/images/<doc>/<page>-<n>.png` + sidecar `<page>-<n>.json` with bbox + caption candidate.
4. **Describe**: Vision LLM generates description; attached to nearest tree node as `images: [{ path, caption, page }]`.

**Attachment rule:** an image at page `p` attaches to the deepest tree node whose `[start_index, end_index]` contains `p`. Ties broken by deepest-first traversal. Same rule applies to tables.

### 4.5 Table Pipeline

Per `table-process/pipelines/document-tables.md`:

1. MuPDF + heuristic table-region detection per page.
2. LLM normalizes table to CSV-like rows + schema descriptor.
3. Saved as `data/<topic>/.index/<doc>/tables/<page>-<n>.json`.
4. Attached to nearest tree node as `tables: [{ path, page, schema }]`.

### 4.6 Caching

Each step writes `data/<topic>/.index/<doc>/.cache/<stepname>.json`. Cache key = hash of (PDF file bytes SHA256 + opt fingerprint + upstream step output hash). Orchestrator checks cache before running each step; on hit, returns cached output. `--force` ignores cache. `--force-from <step>` re-runs from a given step onward.

### 4.7 Concurrency

Shared `p-limit` pool (default 10) in `@buddy/shared/llm/pool.ts`. All LLM calls go through it. Step 9 summaries + hierarchical sub-group fan-out are the heavy parallel users.

## 5. Query (`@buddy/query`)

### 5.1 Module Layout

```
packages/query/src/
├── index.ts              # answer(topic, query, history)
├── doc-selector.ts       # Pass 1
├── tree-reasoner.ts      # Pass 2
├── retrieval.ts          # fetch pages + image captions + table data
├── answer-generator.ts   # final LLM stream
├── topic-loader.ts       # in-memory tree.json cache
└── types.ts
```

### 5.2 Flow

```
User query + topic + conversation history
  │
  ▼
[topic-loader] load data/<topic>/.index/*.tree.json (cached)
  │
  ▼
[doc-selector] LLM picks doc_id(s) from [{doc_name, doc_description, top-level titles}]
  │  (if 1 doc total in topic: skip)
  ▼
[tree-reasoner] per selected doc, LLM picks node_ids from tree (titles + summaries only)
  │
  ▼
[retrieval] fetch page text + image captions + tables for selected nodes
  │
  ▼
[answer-generator] stream final answer with citations
```

### 5.3 History Handling

- Final answer prompt: last 6 turns verbatim.
- Doc-selector + tree-reasoner: 1-line summaries of prior turns ("asked X, answered Y") to keep reasoning passes cheap.

### 5.4 Reasoning Trace

`doc_selector.reasoning`, `tree_reasoner.reasoning`, and selected node_ids returned alongside answer. Stored in `messages.trace` JSON column. UI displays in collapsible "Show reasoning" panel.

### 5.5 Caching

- Tree JSON loaded once per topic on server start; held in `Map<topic, Map<doc_id, Tree>>`.
- `chokidar` watches `.index/*.tree.json`; reloads on change (no server restart).
- Gemini context-cache (`cachedContent` API) used for tree contents across turns of the same conversation **when supported by the configured model**. Flash-lite eligibility may vary; query layer treats caching as best-effort and falls back to inlined prompts on `400`/unsupported errors.

### 5.6 Error Branches

| Failure | Behavior |
|---------|----------|
| Doc-selector returns empty | Forest-union fallback: feed tree-reasoner the combined trees of ALL docs in the topic in a single prompt (each tree prefixed with its `doc_id`). |
| Tree-reasoner returns empty | Return "no relevant section"; offer history-only answer flagged uncited. |
| LLM JSON parse fail | 2 reparse retries w/ stricter prompt, then throw. |

## 6. Server (`@buddy/server`)

### 6.1 Module Layout

```
packages/server/src/
├── index.ts              # Hono app bootstrap
├── routes/
│   ├── topics.ts
│   ├── conversations.ts
│   ├── chat.ts           # SSE
│   └── pdf.ts            # mupdf pixmap → PNG
├── db/
│   ├── client.ts         # better-sqlite3 singleton
│   ├── migrations/       # 001-init.sql, ...
│   └── repo/             # topics.ts, conversations.ts, messages.ts
├── static.ts             # serve @buddy/web build
└── watcher.ts            # chokidar reload tree cache
```

### 6.2 SQLite Schema

```sql
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,        -- 'user' | 'assistant'
  content         TEXT NOT NULL,
  citations       TEXT,                 -- JSON
  trace           TEXT,                 -- JSON
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_conv_topic ON conversations(topic, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);
```

Auto-title from first user message via cheap Gemini call (or first 60 chars as fallback).

### 6.3 API

```
GET    /api/topics                              → [{ topic, doc_count, last_built_at }]
GET    /api/topics/:topic/docs                  → [{ doc_id, doc_name, doc_description, page_count }]
GET    /api/conversations?topic=<t>             → [{ id, title, updated_at }]
POST   /api/conversations { topic, title? }     → { id }
PATCH  /api/conversations/:id { title }         → { ok }
DELETE /api/conversations/:id                   → { ok }   (soft-delete)
GET    /api/conversations/:id/messages          → [...]

POST   /api/chat/stream { conversation_id, query } → SSE:
       event: token       data: { delta }
       event: citations   data: [{ doc, node_ids, pages }]
       event: trace       data: { doc_selector, tree_reasoner }
       event: done        data: { message_id }
       event: error       data: { message }

GET    /api/pdf/:topic/:doc?page=N&scale=2      → image/png (mupdf pixmap, cached on disk)
```

### 6.4 Chat Flow

1. Client POSTs `/api/chat/stream` with `conversation_id` + `query`.
2. Server inserts user message row.
3. Calls `@buddy/query.answer()`, pipes SSE.
4. On `done`, inserts assistant message row with full content + citations + trace.
5. Updates `conversations.updated_at`. Auto-title on first turn.

### 6.5 PDF Preview

- `mupdf-js` loads PDF on first `/api/pdf/...` hit per doc; LRU cache (max 4 PDFs in memory).
- Per-page pixmap rendered as PNG; cached on disk under `data/<topic>/.index/<doc>/pages/<N>.png`.

### 6.6 Static Hosting

- `pnpm build` builds web → `packages/web/dist`. Hono serves it at `/` in prod mode.
- In dev, Vite dev server proxies `/api/*` to Hono.

### 6.7 Startup

- `apps/serve`: load `.env` → run SQLite migrations → preload tree cache → start chokidar watcher → bind Hono on `PORT` (default 3000).

## 7. Web (`@buddy/web`)

### 7.1 Module Layout

```
packages/web/src/
├── main.tsx
├── App.tsx
├── api/
│   ├── client.ts        # typed fetch wrapper (zod schemas from @buddy/shared)
│   └── sse.ts           # useChatStream hook
├── routes/
│   ├── TopicSelect.tsx
│   └── Chat.tsx
├── components/
│   ├── Sidebar.tsx
│   ├── ConversationList.tsx
│   ├── MessageList.tsx
│   ├── Composer.tsx
│   ├── ReasoningPanel.tsx
│   ├── CitationChip.tsx
│   ├── PdfPreview.tsx
│   └── ExportMenu.tsx
├── state/               # react-query stores
│   ├── topics.ts
│   ├── conversations.ts
│   └── chat.ts
├── lib/
│   ├── export.ts        # md/json export
│   └── format.ts
└── styles/              # tailwind config + globals
```

### 7.2 Layout

3-pane: sidebar (topic + conversation list) | chat (messages + composer + reasoning panel) | citations rail (PDF preview opens modal on chip click). Right rail collapses on narrow screens.

### 7.3 SSE Consumption

`useChatStream` opens `POST /api/chat/stream` via `fetch` + `getReader()`. Reducer accumulates `delta` tokens into pending assistant message. On `citations`/`trace` events, attaches metadata. On `done`, marks final and invalidates conversation list (updated_at + auto-title).

### 7.4 State

- `react-query` for server state (topics, conversations, messages).
- Local `useState` for live streaming buffer.
- No global store.

### 7.5 Conversation Management UX

- Sidebar groups by date (Today / Yesterday / This week / Older).
- Hover kebab menu: Rename (inline edit), Delete (confirm modal), Export (md/json).
- `+ New` button creates empty conversation and focuses composer.
- Switching topic clears active conversation; sidebar reloads.

### 7.6 Reasoning Panel

Collapsed by default per message. Shows: doc-selector reasoning → selected docs → tree-reasoner reasoning → selected node titles + page ranges. Each row clickable → opens PdfPreview at that page.

### 7.7 Export

- **Markdown**: `# {title}\n\n## User\n...\n## Assistant\n...\n[Citations: doc p.X-Y]\n`.
- **JSON**: full message rows including `trace` + `citations`.

### 7.8 Dev Workflow

- `pnpm dev`: runs `serve` (Hono w/ tsx watch) + `web` (vite dev). Vite proxies `/api/*` to Hono.
- `pnpm build`: builds web → `dist`, served by Hono in prod mode.

## 8. Shared (`@buddy/shared`)

```
packages/shared/src/
├── config.ts          # zod-validated .env loader
├── logger.ts          # pino factory; child logger per run/topic/doc/step
├── llm/
│   ├── gemini.ts      # GoogleGenerativeAI client + structured-output helpers
│   ├── retry.ts       # withRetry: exp backoff (api-retry.md)
│   ├── pool.ts        # shared p-limit gate
│   └── cache.ts       # Gemini context-cache helpers
├── schemas/
│   ├── tree.ts        # zod TreeNode, Tree, DocOutput
│   ├── pipeline.ts    # zod step IO contracts
│   └── api.ts         # zod request/response schemas
├── paths.ts           # resolveTopicDir, resolveIndexDir, resolveDocTreePath
├── pdf.ts             # mupdf-js loader (singleton WASM init), pageText, pixmap, structuredText
└── ids.ts             # nanoid wrappers (conv_, msg_, doc_, node_)
```

## 9. Config (`.env`)

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_VISION_MODEL=gemini-2.5-flash-lite
PORT=3000
DATA_DIR=./data
MAX_CONCURRENT_LLM=10
MAX_PAGES_PER_NODE=20
MAX_RETRIES=3
ADD_SUMMARIES=true
IMAGES_ENABLED=true
TABLES_ENABLED=true
HIERARCHICAL_PROCESSING=true
SUBGROUP_TOKEN_SIZE=7000
MAX_RETRIEVALS_PER_MASTER=3
LOG_LEVEL=info
```

`config.ts` exports typed `cfg`. Build-index CLI accepts flag overrides (`--model`, `--no-summaries`, `--no-images`, etc).

## 10. Error Handling

| Layer | Failure | Behavior |
|-------|---------|----------|
| LLM call | 429 / 5xx / network | `withRetry`: 3 retries, exp backoff 1s/2s/4s + jitter |
| LLM call | Invalid JSON | 2 reparse retries w/ stricter prompt, then throw |
| Pipeline step | Throws after retries | Logged, marked failed in `.cache/_status.json`, doc aborted; other docs in topic continue |
| Pipeline branch | TOC verify accuracy ≤ 60% | Fallback to `process-toc-no-page-numbers` |
| Pipeline branch | Both fallbacks fail | Final fallback = flat single-node tree (whole doc), warn |
| Query: doc-selector empty | — | Forest-union over all docs |
| Query: tree-reasoner empty | — | Return "no relevant section"; offer history-only answer flagged uncited |
| Server: SSE mid-stream throw | — | Emit `error` event, close stream, mark message row `failed=true` |
| DB: migration fail at startup | — | Process exits 1, log error |
| PDF load fail | — | 500 on `/api/pdf/...`; UI shows "Preview unavailable" |

All errors logged structured: `{ level, run_id, topic, doc, step, err: { name, message, stack } }`.

## 11. Testing

```
packages/<pkg>/test/
├── unit/                 # per-function, mocked deps
└── golden/               # fixture PDFs + expected tree.json
fixtures/                 # committed sample PDFs (small/medium/edge branches)
```

- **LLM stubbing**: `@buddy/shared/llm/gemini.ts` exports an interface; tests inject `stubGemini({ prompts: Map<promptHash, response> })`.
- **Golden tree tests**: full `buildDoc` per fixture PDF with stubbed LLM → assert produced `tree.json` deep-equals `expected.tree.json`. Update via `pnpm test -u`.
- **Step unit tests**: each step is a typed pure function — trivial to test.
- **Fallback tests**: fixtures forcing each branch (no-TOC, TOC-without-page-numbers, verify-fail).
- **Hierarchical agents**: synthetic page lists + stubbed sub-group responses; assert merged hierarchy.
- **Image-solution**: fixture PDF with known embedded image + scanned-page fallback; stubbed Vision describes.
- **Query tests**: load fixture tree, stub LLM, assert correct `node_ids` for sample queries.
- **Server tests**: `hono.app.request()` in-memory + SQLite `:memory:` per test; assert API contract.
- **Web tests**: React Testing Library on key components (streaming, sidebar CRUD, reasoning toggle). No E2E in v1.

Coverage target: pipeline + query 80%+, server 70%+, web smoke-only.

## 12. Tooling

- TypeScript strict, `tsx` for running CLIs, `tsup` for packaging.
- ESM-only.
- Biome (or eslint + prettier) for lint/format.
- pnpm scripts at root: `dev`, `build`, `test`, `build-index`, `serve`.
- Node ≥ 20.

## 13. Out of Scope (v1)

- CSV / Excel ingestion (`table-process/pipelines/csv.md`, `excel.md`).
- Cross-document table query unification (`table-process/implementation-phases.md` Phase 4).
- Multi-user / auth / cloud deployment (assumes local single-user).
- Mobile UI.
- OCR for fully scanned PDFs beyond the Vision-LLM fallback already in image-solution.

## 14. Next Step

After approval of this spec, invoke `writing-plans` skill to produce a phased implementation plan.
