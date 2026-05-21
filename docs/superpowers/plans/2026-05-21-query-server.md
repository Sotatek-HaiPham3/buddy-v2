# Query + Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@buddy/query` (two-pass LLM reasoning + retrieval + streaming answer) and `@buddy/server` (Hono + SQLite + SSE + PDF render + tree watcher) + `apps/serve` bootstrap. By end of this plan a curl/SSE chat round-trip works end-to-end against trees produced by plans 2 + 3.

**Architecture:**
- `@buddy/query` exports `answer(opts)` returning `AsyncIterable<AnswerEvent>` (token/citations/trace/done/error). Composes doc-selector → tree-reasoner → retrieval → answer-generator. Forest-union fallback when doc-selector returns empty.
- `@buddy/server` Hono app with route modules, better-sqlite3 singleton, chokidar tree-cache watcher, mupdf-based PDF preview with disk + LRU cache. Auto-title on first user turn.
- `apps/serve` bootstrap: load `.env`, run migrations, preload trees, start watcher, listen.

**Tech Stack:** Hono, `@hono/node-server`, `better-sqlite3`, `chokidar`, `mupdf` (already in shared), `nanoid` (ids in shared), `lru-cache`, `zod`, `pino` (logger in shared), `vitest`.

**Pre-reads:**
- Spec: `docs/superpowers/specs/2026-05-21-buddy-design.md` sections **5 Query**, **6 Server**, **8 Shared**, **10 Error Handling**.
- Reference: `invest-page-index/optimize/optimal-retrieval-prompts.md` (if present — use as prompt inspiration).
- Existing code: `packages/shared/src/schemas/api.ts` (already has all DTO schemas including SSE event payloads), `packages/shared/src/schemas/tree.ts` (`TreeNode`, `DocOutput`), `packages/shared/src/llm/{gemini.ts,stub.ts,pool.ts,retry.ts}`, `packages/shared/src/pdf.ts` (`renderPage`, `getPageText`), `packages/shared/src/paths.ts`, `packages/shared/src/ids.ts` (`convId`, `msgId`).
- Plan 2 + 3 commit history — same TDD/commit-per-step rhythm. Plan 3 added image+table pipelines; query layer reads their saved sidecar JSONs.

**Out of scope** (per spec §13): auth, mobile UX, multi-doc cross-table unification, agent tools beyond retrieve/read, OCR. Do not implement.

---

## File Structure

```
packages/query/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts             # answer(opts) — public API
│   ├── types.ts             # AnswerEvent, AnswerOpts, HistoryTurn, RetrievedSection
│   ├── topic-loader.ts      # load .index/*.tree.json into Map; chokidar reload
│   ├── doc-selector.ts      # Pass 1
│   ├── tree-reasoner.ts     # Pass 2
│   ├── retrieval.ts         # fetch page text + image captions + table data
│   ├── answer-generator.ts  # streaming LLM with citations emit
│   ├── history.ts           # summarize prior turns for reasoning passes
│   └── prompts/
│       ├── doc-selector.ts
│       ├── tree-reasoner.ts
│       └── answer.ts
└── test/
    ├── topic-loader.test.ts
    ├── doc-selector.test.ts
    ├── tree-reasoner.test.ts
    ├── retrieval.test.ts
    ├── answer-generator.test.ts
    ├── history.test.ts
    └── golden/
        └── answer-flow.test.ts

packages/server/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts             # createApp(deps): Hono
│   ├── deps.ts              # ServerDeps = { db, query, watcher, dataDir, ... }
│   ├── db/
│   │   ├── client.ts        # openDb(path) + runMigrations
│   │   ├── migrations/
│   │   │   └── 001-init.sql
│   │   └── repo/
│   │       ├── conversations.ts
│   │       ├── messages.ts
│   │       └── topics.ts    # filesystem-scan helper (NOT db table; topics live in fs)
│   ├── routes/
│   │   ├── topics.ts
│   │   ├── conversations.ts
│   │   ├── chat.ts          # SSE
│   │   └── pdf.ts           # mupdf pixmap → PNG + disk cache
│   ├── pdf-cache.ts         # LRU(4) of opened PdfDoc handles
│   ├── watcher.ts           # chokidar wrapper around topic-loader
│   ├── static.ts            # serve packages/web/dist when present
│   └── sse.ts               # tiny SSE writer helper
└── test/
    ├── db/
    │   ├── conversations.test.ts
    │   ├── messages.test.ts
    │   └── topics.test.ts
    ├── routes/
    │   ├── topics.test.ts
    │   ├── conversations.test.ts
    │   ├── chat.test.ts
    │   └── pdf.test.ts
    └── integration/
        └── chat-flow.test.ts

apps/serve/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts             # bootstrap
```

---

## Task 0: Prereqs

- [ ] **Step 1:** Confirm plan 3 shipped:

```bash
cd E:/dev-space/AI/buddy-v2
git log --oneline | head -10
pnpm -r test     # expect all green
```

Expected: top commit is plan-3 work (`test(pipeline): golden e2e image and table…` or later). All tests pass.

- [ ] **Step 2:** Read spec §5, §6, §8, §10. Read `packages/shared/src/schemas/api.ts` end-to-end.

- [ ] **Step 3:** Verify tooling:

```bash
node --version    # >= 20
pnpm --version    # >= 9
```

---

## Task 1: Scaffold `@buddy/query` package

**Files:**
- Create: `packages/query/package.json`
- Create: `packages/query/tsconfig.json`
- Create: `packages/query/tsconfig.build.json`
- Create: `packages/query/tsup.config.ts`
- Create: `packages/query/vitest.config.ts`
- Create: `packages/query/src/index.ts` (stub)

- [ ] **Step 1: package.json**

```json
{
  "name": "@buddy/query",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsup && tsc --project tsconfig.build.json --emitDeclarationOnly --declaration --declarationMap",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@buddy/shared": "workspace:*",
    "chokidar": "^3.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "pdf-lib": "^1.17.1",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: tsconfig.json** (mirror pipeline)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: tsconfig.build.json**

```json
{ "extends": "./tsconfig.json", "compilerOptions": { "composite": false, "incremental": false }, "include": ["src/**/*"] }
```

- [ ] **Step 4: tsup.config.ts**

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  target: 'node20',
});
```

- [ ] **Step 5: vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'], passWithNoTests: true } });
```

- [ ] **Step 6: src/index.ts stub**

```ts
export {};
```

- [ ] **Step 7:** Install + typecheck:

```bash
pnpm install
pnpm -F @buddy/query typecheck
pnpm -F @buddy/query test
```

Expected: clean, "no tests" pass.

- [ ] **Step 8: Commit**

```bash
git add packages/query/ pnpm-lock.yaml
git commit -m "feat(query): scaffold @buddy/query package"
```

---

## Task 2: `query/types.ts`

**Files:**
- Create: `packages/query/src/types.ts`

- [ ] **Step 1: Write**

```ts
import type { Citation, ReasoningTrace } from '@buddy/shared';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AnswerEvent =
  | { type: 'token'; delta: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'trace'; trace: ReasoningTrace }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface RetrievedNode {
  doc_id: string;
  doc_name: string;
  node_id: string;
  title: string;
  page_range: [number, number];
  text: string;
  image_captions: { page: number; caption: string }[];
  tables: { page: number; schema: string; preview: string }[];
}

export interface AnswerOpts {
  topic: string;
  query: string;
  history: HistoryTurn[];
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/query/src/types.ts
git commit -m "feat(query): types"
```

---

## Task 3: `query/topic-loader.ts` + tests

**Files:**
- Create: `packages/query/src/topic-loader.ts`
- Test: `packages/query/test/topic-loader.test.ts`

**Behavior:**
- `loadTopic(dataDir, topic)` reads every `<topic>/.index/*.tree.json` → returns `Map<doc_id, DocOutput>`.
- `createTopicCache({ dataDir, watch })` returns `{ get(topic): Promise<Map<docId, DocOutput>>, reload(topic), close() }`. With `watch: true`, uses chokidar to reload single doc on file change.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { DocOutput } from '@buddy/shared';
import { loadTopic, createTopicCache } from '../src/topic-loader.js';

function mkDoc(docId: string, name: string): DocOutput {
  return {
    doc_id: docId, doc_name: name, doc_description: `desc-${docId}`,
    structure: [{
      title: 'root', start_index: 1, end_index: 1, node_id: 'n1',
      nodes: [], images: [], tables: [],
    }],
  };
}

async function writeTree(dataDir: string, topic: string, doc: DocOutput): Promise<void> {
  const dir = path.join(dataDir, topic, '.index');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${doc.doc_id}.tree.json`), JSON.stringify(doc));
}

describe('loadTopic', () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tl-')); });

  it('returns empty map when no .index directory', async () => {
    const out = await loadTopic(dataDir, 'missing');
    expect(out.size).toBe(0);
  });

  it('loads all tree.json files keyed by doc_id', async () => {
    await writeTree(dataDir, 'tax', mkDoc('d1', 'one.pdf'));
    await writeTree(dataDir, 'tax', mkDoc('d2', 'two.pdf'));
    const out = await loadTopic(dataDir, 'tax');
    expect(out.size).toBe(2);
    expect(out.get('d1')?.doc_name).toBe('one.pdf');
  });

  it('skips files with invalid JSON without throwing', async () => {
    await writeTree(dataDir, 'tax', mkDoc('d1', 'ok.pdf'));
    await fs.writeFile(path.join(dataDir, 'tax', '.index', 'broken.tree.json'), 'not-json');
    const out = await loadTopic(dataDir, 'tax');
    expect(out.size).toBe(1);
    expect(out.has('d1')).toBe(true);
  });
});

describe('createTopicCache', () => {
  it('caches per topic and reloads on demand', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-'));
    await writeTree(dataDir, 'tax', mkDoc('d1', 'a.pdf'));
    const cache = createTopicCache({ dataDir, watch: false });
    const first = await cache.get('tax');
    expect(first.size).toBe(1);
    await writeTree(dataDir, 'tax', mkDoc('d2', 'b.pdf'));
    expect((await cache.get('tax')).size).toBe(1);   // cached
    await cache.reload('tax');
    expect((await cache.get('tax')).size).toBe(2);
    await cache.close();
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/query test topic-loader` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { resolveIndexDir, docOutputSchema, type DocOutput } from '@buddy/shared';

export async function loadTopic(dataDir: string, topic: string): Promise<Map<string, DocOutput>> {
  const dir = resolveIndexDir(dataDir, topic);
  const map = new Map<string, DocOutput>();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return map;
  }
  for (const f of entries) {
    if (!f.endsWith('.tree.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), 'utf8');
      const parsed = docOutputSchema.parse(JSON.parse(raw));
      map.set(parsed.doc_id, parsed);
    } catch {
      /* skip malformed */
    }
  }
  return map;
}

export interface TopicCacheOpts {
  dataDir: string;
  watch: boolean;
  onChange?: (topic: string) => void;
}

export interface TopicCache {
  get(topic: string): Promise<Map<string, DocOutput>>;
  reload(topic: string): Promise<void>;
  close(): Promise<void>;
}

export function createTopicCache(opts: TopicCacheOpts): TopicCache {
  const cache = new Map<string, Map<string, DocOutput>>();
  let watcher: FSWatcher | null = null;

  if (opts.watch) {
    const pattern = path.join(opts.dataDir, '*', '.index', '*.tree.json');
    watcher = chokidar.watch(pattern, { ignoreInitial: true });
    watcher.on('all', async (_event: string, filePath: string) => {
      const topic = path.basename(path.dirname(path.dirname(filePath)));
      if (cache.has(topic)) {
        cache.set(topic, await loadTopic(opts.dataDir, topic));
        opts.onChange?.(topic);
      }
    });
  }

  return {
    async get(topic) {
      let m = cache.get(topic);
      if (!m) { m = await loadTopic(opts.dataDir, topic); cache.set(topic, m); }
      return m;
    },
    async reload(topic) { cache.set(topic, await loadTopic(opts.dataDir, topic)); },
    async close() { if (watcher) await watcher.close(); },
  };
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/query test topic-loader` — expect PASS.

- [ ] **Step 5: Export from `src/index.ts`**

```ts
export * from './types.js';
export * from './topic-loader.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/query/src/topic-loader.ts packages/query/src/index.ts packages/query/test/topic-loader.test.ts
git commit -m "feat(query): topic-loader with chokidar reload"
```

---

## Task 4: Prompts

**Files:**
- Create: `packages/query/src/prompts/doc-selector.ts`
- Create: `packages/query/src/prompts/tree-reasoner.ts`
- Create: `packages/query/src/prompts/answer.ts`

- [ ] **Step 1: doc-selector.ts**

```ts
import type { DocOutput } from '@buddy/shared';

export const docSelectorPrompt = (
  docs: DocOutput[],
  query: string,
  historySummary: string,
): string => {
  const lines = docs.map((d) => {
    const topTitles = d.structure.slice(0, 8).map((n) => `- ${n.title}`).join('\n');
    return `doc_id: ${d.doc_id}
doc_name: ${d.doc_name}
description: ${d.doc_description}
top-level titles:
${topTitles}`;
  });

  return `You are routing a user question to the right document(s).

Available documents:

${lines.join('\n\n---\n\n')}

Prior conversation summary:
${historySummary || '(none)'}

User question: ${query}

Pick the doc_ids most likely to answer. Return JSON only:
{ "reasoning": "<one paragraph>", "doc_ids": ["..."] }

If none clearly relevant, return doc_ids: [].`;
};
```

- [ ] **Step 2: tree-reasoner.ts**

```ts
import type { DocOutput, TreeNode } from '@buddy/shared';

function summarize(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const head = `${pad}- [${node.node_id}] ${node.title} (p.${node.start_index}-${node.end_index})`;
  const sum = node.summary ? `${pad}    ${node.summary}` : '';
  const kids = node.nodes.map((c) => summarize(c, indent + 1)).join('\n');
  return [head, sum, kids].filter(Boolean).join('\n');
}

export const treeReasonerPrompt = (
  docs: DocOutput[],
  query: string,
  historySummary: string,
): string => {
  const blocks = docs.map((d) =>
    `=== doc_id: ${d.doc_id} (${d.doc_name}) ===
${d.structure.map((n) => summarize(n)).join('\n')}`,
  );

  return `Pick the tree nodes whose page ranges contain content that answers the question.

${blocks.join('\n\n')}

Prior conversation summary:
${historySummary || '(none)'}

User question: ${query}

Return JSON only:
{ "reasoning": "<one paragraph>", "selections": [ { "doc_id": "...", "node_ids": ["..."] } ] }

Pick the deepest nodes that suffice. If nothing fits, selections: [].`;
};
```

- [ ] **Step 3: answer.ts**

Use plain string concatenation to keep the prompt readable; avoid nested template literals.

```ts
import type { RetrievedNode, HistoryTurn } from '../types.js';

const HISTORY_TURNS = 6;

function formatSection(r: RetrievedNode): string {
  const head = '[CITE doc=' + r.doc_id + ' node=' + r.node_id +
    ' p.' + r.page_range[0] + '-' + r.page_range[1] + '] ' + r.title;
  const imgs = r.image_captions.length
    ? '\nImages on these pages:\n' +
      r.image_captions.map((c) => '  - p.' + c.page + ': ' + c.caption).join('\n')
    : '';
  const tbls = r.tables.length
    ? '\nTables on these pages:\n' +
      r.tables.map((t) => '  - p.' + t.page + ' schema=' + t.schema + '\n    ' + t.preview).join('\n')
    : '';
  return head + '\n' + r.text + imgs + tbls;
}

export function answerPrompt(
  query: string,
  retrieved: RetrievedNode[],
  history: HistoryTurn[],
): string {
  const recent = history.slice(-HISTORY_TURNS)
    .map((t) => t.role.toUpperCase() + ': ' + t.content).join('\n');
  const sections = retrieved.map(formatSection).join('\n\n---\n\n') || '(none retrieved)';
  const recentBlock = recent ? 'Recent conversation:\n' + recent + '\n\n' : '';
  return [
    'You are answering using ONLY the retrieved sections below.',
    'Be concise. When making a factual claim, append a citation in the form [doc-name p.X] using the doc name and page from the relevant section.',
    'If no retrieved section supports an answer, say so and do not invent citations.',
    '',
    'Retrieved sections:',
    '',
    sections,
    '',
    recentBlock + 'User: ' + query,
  ].join('\n');
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/query/src/prompts/
git commit -m "feat(query): prompts (doc-selector, tree-reasoner, answer)"
```

---

## Task 5: `history.ts` — turn summarizer

**Files:**
- Create: `packages/query/src/history.ts`
- Test: `packages/query/test/history.test.ts`

**Spec §5.3:** reasoning passes (doc-selector + tree-reasoner) use 1-line summaries of prior turns. Cheap LLM call OR truncation. v1 = simple truncation: pair user+assistant turns, take last 4 pairs, render each as "asked X, answered Y" truncated to 120 chars per side.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { summarizeHistory } from '../src/history.js';

describe('summarizeHistory', () => {
  it('returns empty string for empty history', () => {
    expect(summarizeHistory([])).toBe('');
  });

  it('pairs user+assistant turns into one-liners', () => {
    const out = summarizeHistory([
      { role: 'user', content: 'what is mupdf?' },
      { role: 'assistant', content: 'A PDF rendering library.' },
      { role: 'user', content: 'how do I install?' },
      { role: 'assistant', content: 'npm install mupdf' },
    ]);
    expect(out).toContain('asked');
    expect(out).toContain('mupdf');
    expect(out.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('truncates very long content to 120 chars per side', () => {
    const long = 'x'.repeat(500);
    const out = summarizeHistory([
      { role: 'user', content: long },
      { role: 'assistant', content: long },
    ]);
    expect(out.length).toBeLessThan(400);
  });

  it('keeps only last 4 pairs', () => {
    const turns = [];
    for (let i = 0; i < 10; i++) {
      turns.push({ role: 'user' as const, content: 'q' + i });
      turns.push({ role: 'assistant' as const, content: 'a' + i });
    }
    const out = summarizeHistory(turns);
    expect(out).not.toContain('q0');
    expect(out).toContain('q9');
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/query test history` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { HistoryTurn } from './types.js';

const MAX_PAIRS = 4;
const MAX_LEN = 120;

const truncate = (s: string): string => (s.length <= MAX_LEN ? s : s.slice(0, MAX_LEN - 1) + '…');

export function summarizeHistory(history: HistoryTurn[]): string {
  if (history.length === 0) return '';
  const pairs: [HistoryTurn, HistoryTurn | undefined][] = [];
  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const next = history[i + 1];
    pairs.push([turn, next?.role === 'assistant' ? next : undefined]);
  }
  return pairs.slice(-MAX_PAIRS)
    .map(([u, a]) => 'asked: ' + truncate(u.content) + (a ? ' | answered: ' + truncate(a.content) : ''))
    .join('\n');
}
```

- [ ] **Step 4:** Run test — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/history.ts packages/query/test/history.test.ts
git commit -m "feat(query): history summarizer for reasoning passes"
```

---

## Task 6: `doc-selector.ts`

**Files:**
- Create: `packages/query/src/doc-selector.ts`
- Test: `packages/query/test/doc-selector.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { selectDocs } from '../src/doc-selector.js';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { docSelectorPrompt } from '../src/prompts/doc-selector.js';

const mk = (id: string, name: string): DocOutput => ({
  doc_id: id, doc_name: name, doc_description: 'about ' + name,
  structure: [{ title: name + ' chapter', start_index: 1, end_index: 2, node_id: 'n', nodes: [], images: [], tables: [] }],
});

describe('selectDocs', () => {
  it('skips LLM when only one doc', async () => {
    const docs = [mk('d1', 'one.pdf')];
    const gemini = createStubGemini({ responses: new Map() });
    const out = await selectDocs({ gemini, docs, query: 'q', historySummary: '' });
    expect(out.doc_ids).toEqual(['d1']);
    expect(out.reasoning).toMatch(/single doc/i);
    expect(gemini.calls.length).toBe(0);
  });

  it('parses doc_ids + reasoning from LLM', async () => {
    const docs = [mk('d1', 'one.pdf'), mk('d2', 'two.pdf')];
    const prompt = docSelectorPrompt(docs, 'q', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: JSON.stringify({ reasoning: 'd2 best', doc_ids: ['d2'] }) });
    const gemini = createStubGemini({ responses });
    const out = await selectDocs({ gemini, docs, query: 'q', historySummary: '' });
    expect(out.doc_ids).toEqual(['d2']);
    expect(out.reasoning).toBe('d2 best');
  });

  it('returns empty doc_ids on unparseable response (triggers forest-union upstream)', async () => {
    const docs = [mk('d1', 'one.pdf'), mk('d2', 'two.pdf')];
    const prompt = docSelectorPrompt(docs, 'q', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'not json' });
    const gemini = createStubGemini({ responses });
    const out = await selectDocs({ gemini, docs, query: 'q', historySummary: '' });
    expect(out.doc_ids).toEqual([]);
  });

  it('filters out unknown doc_ids from LLM output', async () => {
    const docs = [mk('d1', 'one.pdf'), mk('d2', 'two.pdf')];
    const prompt = docSelectorPrompt(docs, 'q', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: JSON.stringify({ reasoning: 'r', doc_ids: ['d2', 'd99'] }) });
    const gemini = createStubGemini({ responses });
    const out = await selectDocs({ gemini, docs, query: 'q', historySummary: '' });
    expect(out.doc_ids).toEqual(['d2']);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { z } from 'zod';
import type { GeminiClient, DocOutput } from '@buddy/shared';
import { docSelectorPrompt } from './prompts/doc-selector.js';

const responseSchema = z.object({
  reasoning: z.string().default(''),
  doc_ids: z.array(z.string()).default([]),
});

export interface SelectDocsOpts {
  gemini: GeminiClient;
  docs: DocOutput[];
  query: string;
  historySummary: string;
}

export interface DocSelection { reasoning: string; doc_ids: string[]; }

function tryParse(text: string): { reasoning: string; doc_ids: string[] } | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return responseSchema.parse(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

export async function selectDocs(opts: SelectDocsOpts): Promise<DocSelection> {
  if (opts.docs.length === 1) {
    return { reasoning: 'single doc in topic; selected without LLM', doc_ids: [opts.docs[0].doc_id] };
  }
  if (opts.docs.length === 0) return { reasoning: 'no docs in topic', doc_ids: [] };

  const prompt = docSelectorPrompt(opts.docs, opts.query, opts.historySummary);
  const r = await opts.gemini.generate([prompt]);
  const parsed = tryParse(r.text);
  if (!parsed) return { reasoning: '(unparseable LLM output)', doc_ids: [] };
  const known = new Set(opts.docs.map((d) => d.doc_id));
  return {
    reasoning: parsed.reasoning,
    doc_ids: parsed.doc_ids.filter((id) => known.has(id)),
  };
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/doc-selector.ts packages/query/test/doc-selector.test.ts
git commit -m "feat(query): doc-selector pass 1"
```

---

## Task 7: `tree-reasoner.ts`

**Files:**
- Create: `packages/query/src/tree-reasoner.ts`
- Test: `packages/query/test/tree-reasoner.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { reasonOverTrees } from '../src/tree-reasoner.js';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { treeReasonerPrompt } from '../src/prompts/tree-reasoner.js';

const docWithNodes = (id: string, nodeIds: string[]): DocOutput => ({
  doc_id: id, doc_name: id + '.pdf', doc_description: '',
  structure: nodeIds.map((n, i) => ({
    title: 't' + n, start_index: i + 1, end_index: i + 1,
    node_id: n, nodes: [], images: [], tables: [],
  })),
});

describe('reasonOverTrees', () => {
  it('returns selections filtered to known node_ids', async () => {
    const docs = [docWithNodes('d1', ['n1', 'n2'])];
    const prompt = treeReasonerPrompt(docs, 'q', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), {
      text: JSON.stringify({ reasoning: 'pick n1', selections: [{ doc_id: 'd1', node_ids: ['n1', 'unknown'] }] }),
    });
    const gemini = createStubGemini({ responses });
    const out = await reasonOverTrees({ gemini, docs, query: 'q', historySummary: '' });
    expect(out.selections).toEqual([{ doc_id: 'd1', node_ids: ['n1'] }]);
    expect(out.reasoning).toBe('pick n1');
  });

  it('returns empty selections on unparseable response', async () => {
    const docs = [docWithNodes('d1', ['n1'])];
    const prompt = treeReasonerPrompt(docs, 'q', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'bad' });
    const gemini = createStubGemini({ responses });
    const out = await reasonOverTrees({ gemini, docs, query: 'q', historySummary: '' });
    expect(out.selections).toEqual([]);
  });

  it('drops doc_ids not in input', async () => {
    const docs = [docWithNodes('d1', ['n1'])];
    const prompt = treeReasonerPrompt(docs, 'q', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), {
      text: JSON.stringify({ reasoning: 'r', selections: [{ doc_id: 'dX', node_ids: ['n1'] }] }),
    });
    const gemini = createStubGemini({ responses });
    const out = await reasonOverTrees({ gemini, docs, query: 'q', historySummary: '' });
    expect(out.selections).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { z } from 'zod';
import type { GeminiClient, DocOutput, TreeNode } from '@buddy/shared';
import { treeReasonerPrompt } from './prompts/tree-reasoner.js';

const responseSchema = z.object({
  reasoning: z.string().default(''),
  selections: z.array(z.object({
    doc_id: z.string(),
    node_ids: z.array(z.string()),
  })).default([]),
});

export interface ReasonOpts {
  gemini: GeminiClient;
  docs: DocOutput[];
  query: string;
  historySummary: string;
}

export interface TreeReasoning {
  reasoning: string;
  selections: { doc_id: string; node_ids: string[] }[];
}

function collectIds(nodes: TreeNode[], out: Set<string>): void {
  for (const n of nodes) {
    out.add(n.node_id);
    if (n.nodes.length) collectIds(n.nodes, out);
  }
}

function tryParse(text: string): z.infer<typeof responseSchema> | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return responseSchema.parse(JSON.parse(cleaned)); } catch { return null; }
}

export async function reasonOverTrees(opts: ReasonOpts): Promise<TreeReasoning> {
  if (opts.docs.length === 0) return { reasoning: 'no docs', selections: [] };
  const prompt = treeReasonerPrompt(opts.docs, opts.query, opts.historySummary);
  const r = await opts.gemini.generate([prompt]);
  const parsed = tryParse(r.text);
  if (!parsed) return { reasoning: '(unparseable)', selections: [] };

  const docIdSet = new Set(opts.docs.map((d) => d.doc_id));
  const idsByDoc = new Map<string, Set<string>>();
  for (const d of opts.docs) {
    const s = new Set<string>();
    collectIds(d.structure, s);
    idsByDoc.set(d.doc_id, s);
  }

  const cleaned = parsed.selections
    .filter((sel) => docIdSet.has(sel.doc_id))
    .map((sel) => ({
      doc_id: sel.doc_id,
      node_ids: sel.node_ids.filter((n) => idsByDoc.get(sel.doc_id)?.has(n)),
    }))
    .filter((sel) => sel.node_ids.length > 0);

  return { reasoning: parsed.reasoning, selections: cleaned };
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/tree-reasoner.ts packages/query/test/tree-reasoner.test.ts
git commit -m "feat(query): tree-reasoner pass 2"
```

---

## Task 8: `retrieval.ts`

**Files:**
- Create: `packages/query/src/retrieval.ts`
- Test: `packages/query/test/retrieval.test.ts`

**Behavior:** for each `{doc_id, node_ids}` selection, walk the tree to locate each node, read page text from PDF (via `getPageText` over `node.start_index..end_index`), pull image captions from `node.images[]`, pull table previews by reading the sidecar JSON files referenced by `node.tables[]` (first 3 rows + schema). Returns `RetrievedNode[]`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { retrieve } from '../src/retrieval.js';
import type { DocOutput } from '@buddy/shared';

async function pdfWithText(pages: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const t of pages) {
    const p = pdf.addPage([200, 200]);
    p.drawText(t, { x: 20, y: 100, size: 14, font });
  }
  return Buffer.from(await pdf.save());
}

describe('retrieve', () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ret-')); });

  it('returns text from page range with image captions and table previews', async () => {
    const topic = 'tax';
    const docId = 'd1';
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    await fs.writeFile(pdfPath, await pdfWithText(['page-one', 'page-two', 'page-three']));

    // table sidecar
    const tableDir = path.join(dataDir, topic, '.index', docId, 'tables');
    await fs.mkdir(tableDir, { recursive: true });
    await fs.writeFile(path.join(tableDir, '2-0.json'), JSON.stringify({
      page: 2, headers: ['a', 'b'], rows: [['1', '2'], ['3', '4']],
      schemaDescriptor: 'demo', columnTypes: ['number', 'number'], bbox: {},
    }));

    const doc: DocOutput = {
      doc_id: docId, doc_name: 'a.pdf', doc_description: '',
      structure: [{
        title: 'ch', start_index: 1, end_index: 3, node_id: 'n1',
        nodes: [], images: [{ path: '/x.png', page: 1, caption: 'a chart' }],
        tables: [{ path: path.join(tableDir, '2-0.json'), page: 2, schema: 'demo' }],
      }],
    };

    const out = await retrieve({
      dataDir, topic,
      docs: new Map([[docId, doc]]),
      pdfPathFor: () => pdfPath,
      selections: [{ doc_id: docId, node_ids: ['n1'] }],
    });

    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('page-one');
    expect(out[0].text).toContain('page-three');
    expect(out[0].image_captions).toEqual([{ page: 1, caption: 'a chart' }]);
    expect(out[0].tables[0].schema).toBe('demo');
    expect(out[0].tables[0].preview).toContain('a, b');
    expect(out[0].page_range).toEqual([1, 3]);
  });

  it('returns empty result when node_id not found', async () => {
    const doc: DocOutput = {
      doc_id: 'd1', doc_name: 'a.pdf', doc_description: '',
      structure: [{ title: 't', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
    };
    const out = await retrieve({
      dataDir, topic: 'tax', docs: new Map([['d1', doc]]),
      pdfPathFor: () => 'x.pdf',
      selections: [{ doc_id: 'd1', node_ids: ['missing'] }],
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import fs from 'node:fs/promises';
import { openPdf, getPageText, type DocOutput, type TreeNode } from '@buddy/shared';
import type { RetrievedNode } from './types.js';

export interface RetrieveOpts {
  dataDir: string;
  topic: string;
  docs: Map<string, DocOutput>;
  pdfPathFor: (docName: string) => string;     // server passes a resolver; tests pass a stub
  selections: { doc_id: string; node_ids: string[] }[];
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.node_id === id) return n;
    const inner = findNode(n.nodes, id);
    if (inner) return inner;
  }
  return null;
}

async function readTablePreview(path: string): Promise<string> {
  try {
    const raw = JSON.parse(await fs.readFile(path, 'utf8')) as {
      headers?: string[]; rows?: string[][];
    };
    const headers = (raw.headers ?? []).join(', ');
    const sample = (raw.rows ?? []).slice(0, 3).map((r) => r.join(', ')).join(' | ');
    return [headers, sample].filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

export async function retrieve(opts: RetrieveOpts): Promise<RetrievedNode[]> {
  const out: RetrievedNode[] = [];
  for (const sel of opts.selections) {
    const doc = opts.docs.get(sel.doc_id);
    if (!doc) continue;
    const pdfPath = opts.pdfPathFor(doc.doc_name);
    let pdfBytes: Buffer | null;
    try { pdfBytes = await fs.readFile(pdfPath); } catch { pdfBytes = null; }
    const pdfDoc = pdfBytes ? openPdf(pdfBytes) : null;

    for (const nid of sel.node_ids) {
      const node = findNode(doc.structure, nid);
      if (!node) continue;
      const pages: string[] = [];
      if (pdfDoc) {
        for (let p = node.start_index; p <= node.end_index; p++) {
          try { pages.push('--- page ' + p + ' ---\n' + getPageText(pdfDoc, p - 1)); }
          catch { /* skip */ }
        }
      }
      const tables = await Promise.all(node.tables.map(async (t) => ({
        page: t.page,
        schema: t.schema ?? '',
        preview: await readTablePreview(t.path),
      })));
      out.push({
        doc_id: doc.doc_id,
        doc_name: doc.doc_name,
        node_id: node.node_id,
        title: node.title,
        page_range: [node.start_index, node.end_index],
        text: pages.join('\n\n'),
        image_captions: node.images.map((i) => ({ page: i.page, caption: i.caption ?? '' })).filter((i) => i.caption),
        tables,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/retrieval.ts packages/query/test/retrieval.test.ts
git commit -m "feat(query): retrieval — page text + image captions + table preview"
```

---

## Task 9: `answer-generator.ts`

**Files:**
- Create: `packages/query/src/answer-generator.ts`
- Test: `packages/query/test/answer-generator.test.ts`

**Behavior:** wraps `gemini.generateStream(...)` with the answer prompt, yields `{type:'token', delta}` chunks. Caller emits the `citations`+`trace`+`done` events around it.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { generateAnswer } from '../src/answer-generator.js';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { answerPrompt } from '../src/prompts/answer.js';
import type { RetrievedNode } from '../src/types.js';

describe('generateAnswer', () => {
  it('streams token deltas built from the answer prompt', async () => {
    const retrieved: RetrievedNode[] = [{
      doc_id: 'd', doc_name: 'a.pdf', node_id: 'n', title: 't', page_range: [1, 1],
      text: 'fact', image_captions: [], tables: [],
    }];
    const prompt = answerPrompt('what?', retrieved, []);
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'hello world' });
    const gemini = createStubGemini({ responses, chunkSize: 3 });

    const chunks: string[] = [];
    for await (const ev of generateAnswer({ gemini, query: 'what?', retrieved, history: [] })) {
      if (ev.type === 'token') chunks.push(ev.delta);
    }
    expect(chunks.join('')).toBe('hello world');
    expect(chunks.length).toBeGreaterThan(1);    // streamed
  });

  it('yields error event on LLM throw', async () => {
    const gemini = { 
      async generate() { throw new Error('boom'); },
      async *generateStream() { throw new Error('boom'); },
    };
    const events = [];
    for await (const ev of generateAnswer({
      gemini, query: 'q', retrieved: [], history: [],
    })) events.push(ev);
    expect(events.some((e) => e.type === 'error' && /boom/.test(e.message))).toBe(true);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { GeminiClient } from '@buddy/shared';
import { answerPrompt } from './prompts/answer.js';
import type { AnswerEvent, HistoryTurn, RetrievedNode } from './types.js';

interface Opts {
  gemini: GeminiClient;
  query: string;
  retrieved: RetrievedNode[];
  history: HistoryTurn[];
}

export async function* generateAnswer(opts: Opts): AsyncIterable<AnswerEvent> {
  const prompt = answerPrompt(opts.query, opts.retrieved, opts.history);
  try {
    for await (const chunk of opts.gemini.generateStream([prompt], { maxOutputTokens: 2048 })) {
      if (chunk.delta) yield { type: 'token', delta: chunk.delta };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message };
  }
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/answer-generator.ts packages/query/test/answer-generator.test.ts
git commit -m "feat(query): streaming answer generator"
```

---

## Task 10: `index.ts` — `answer()` composition

**Files:**
- Modify: `packages/query/src/index.ts`
- Test: `packages/query/test/golden/answer-flow.test.ts`

**Composition order:**
1. Load topic docs via passed-in cache.
2. `summarizeHistory(history)` → `historySummary`.
3. `selectDocs(...)`. If empty → use ALL docs (forest-union).
4. Filter docs map by selection.
5. `reasonOverTrees(...)`. If empty selections → yield trace + empty citations + error event "no relevant section" + done.
6. `retrieve(...)` → `RetrievedNode[]`.
7. Yield `trace` event.
8. Yield `citations` event built from `{doc_name, node_ids, pages}` per retrieved.
9. Stream tokens via `generateAnswer`.
10. Yield `done`.

- [ ] **Step 1: Failing golden test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { answer } from '../../src/index.js';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { docSelectorPrompt } from '../../src/prompts/doc-selector.js';
import { treeReasonerPrompt } from '../../src/prompts/tree-reasoner.js';
import { answerPrompt } from '../../src/prompts/answer.js';

async function tinyPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([200, 200]);
  p.drawText(text, { x: 10, y: 100, size: 12, font: f });
  return Buffer.from(await pdf.save());
}

describe('golden: answer() flow', () => {
  it('emits trace, citations, tokens, done in order for single-doc topic', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qf-'));
    const topic = 'tax';
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.writeFile(pdfPath, await tinyPdf('Revenue grew 10% in Q3.'));

    const doc: DocOutput = {
      doc_id: 'd1', doc_name: 'a.pdf', doc_description: 'finance',
      structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
    };
    await fs.writeFile(path.join(dataDir, topic, '.index', 'd1.tree.json'), JSON.stringify(doc));

    // Build prompt strings to match exact stub keys.
    const docs = [doc];
    const treePrompt = treeReasonerPrompt(docs, 'how did revenue do?', '');
    const aPrompt = answerPrompt('how did revenue do?',
      [{
        doc_id: 'd1', doc_name: 'a.pdf', node_id: 'n1', title: 'Q3',
        page_range: [1, 1], text: '--- page 1 ---\nRevenue grew 10% in Q3.',
        image_captions: [], tables: [],
      }], []);
    const responses = new Map();
    // doc-selector skipped (single doc)
    responses.set(hashPrompt([treePrompt]), {
      text: JSON.stringify({ reasoning: 'pick Q3', selections: [{ doc_id: 'd1', node_ids: ['n1'] }] }),
    });
    responses.set(hashPrompt([aPrompt]), { text: 'Revenue grew 10%. [a.pdf p.1]' });

    const gemini = createStubGemini({ responses, chunkSize: 5 });
    const events: any[] = [];
    for await (const ev of answer({
      dataDir, topic, query: 'how did revenue do?', history: [],
      gemini, pdfPathFor: () => pdfPath,
    })) events.push(ev);

    const types = events.map((e) => e.type);
    expect(types).toContain('trace');
    expect(types).toContain('citations');
    expect(types.filter((t) => t === 'token').length).toBeGreaterThan(0);
    expect(types[types.length - 1]).toBe('done');

    const citations = events.find((e) => e.type === 'citations').citations;
    expect(citations[0]).toMatchObject({ doc: 'a.pdf', node_ids: ['n1'], pages: [1] });
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement `index.ts`**

```ts
import type { GeminiClient, Citation, DocOutput, ReasoningTrace } from '@buddy/shared';
import { loadTopic } from './topic-loader.js';
import { selectDocs } from './doc-selector.js';
import { reasonOverTrees } from './tree-reasoner.js';
import { retrieve } from './retrieval.js';
import { generateAnswer } from './answer-generator.js';
import { summarizeHistory } from './history.js';
import type { AnswerEvent, HistoryTurn } from './types.js';

export * from './types.js';
export * from './topic-loader.js';

export interface AnswerArgs {
  dataDir: string;
  topic: string;
  query: string;
  history: HistoryTurn[];
  gemini: GeminiClient;
  pdfPathFor: (docName: string) => string;
  docs?: Map<string, DocOutput>;   // optional override for cached map; else loads from disk
}

function buildCitations(retrieved: ReturnType<typeof retrieve> extends Promise<infer R> ? R : never): Citation[] {
  const byDoc = new Map<string, Citation>();
  for (const r of retrieved) {
    const existing = byDoc.get(r.doc_name) ?? { doc: r.doc_name, node_ids: [], pages: [] };
    existing.node_ids.push(r.node_id);
    for (let p = r.page_range[0]; p <= r.page_range[1]; p++) {
      if (!existing.pages.includes(p)) existing.pages.push(p);
    }
    byDoc.set(r.doc_name, existing);
  }
  return [...byDoc.values()];
}

export async function* answer(args: AnswerArgs): AsyncIterable<AnswerEvent> {
  try {
    const docsMap = args.docs ?? await loadTopic(args.dataDir, args.topic);
    if (docsMap.size === 0) {
      yield { type: 'error', message: 'topic has no built docs' };
      return;
    }
    const docs = [...docsMap.values()];
    const historySummary = summarizeHistory(args.history);

    const docSel = await selectDocs({ gemini: args.gemini, docs, query: args.query, historySummary });
    const selectedDocs = docSel.doc_ids.length > 0
      ? docs.filter((d) => docSel.doc_ids.includes(d.doc_id))
      : docs;   // forest-union fallback

    const reasoning = await reasonOverTrees({
      gemini: args.gemini, docs: selectedDocs, query: args.query, historySummary,
    });

    const trace: ReasoningTrace = {
      doc_selector: { reasoning: docSel.reasoning, doc_ids: docSel.doc_ids },
      tree_reasoner: {
        reasoning: reasoning.reasoning,
        node_ids: reasoning.selections.flatMap((s) => s.node_ids),
      },
    };
    yield { type: 'trace', trace };

    if (reasoning.selections.length === 0) {
      yield { type: 'citations', citations: [] };
      yield { type: 'token', delta: 'No relevant section found in the indexed documents.' };
      yield { type: 'done' };
      return;
    }

    const retrieved = await retrieve({
      dataDir: args.dataDir, topic: args.topic, docs: docsMap,
      pdfPathFor: args.pdfPathFor, selections: reasoning.selections,
    });

    yield { type: 'citations', citations: buildCitations(retrieved) };

    for await (const ev of generateAnswer({
      gemini: args.gemini, query: args.query, retrieved, history: args.history,
    })) yield ev;

    yield { type: 'done' };
  } catch (err) {
    yield { type: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4:** Run — expect PASS. Adjust stub `text` to ensure exact prompt strings match; if test fails on hash mismatch, copy the prompt string from a failure log.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/index.ts packages/query/test/golden/answer-flow.test.ts
git commit -m "feat(query): answer() composes two-pass reasoning + streaming"
```

---

## Task 11: Scaffold `@buddy/server`

**Files:**
- Create: `packages/server/{package.json,tsconfig.json,tsconfig.build.json,tsup.config.ts,vitest.config.ts}`
- Create: `packages/server/src/index.ts` stub

- [ ] **Step 1: package.json**

```json
{
  "name": "@buddy/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsup && tsc --project tsconfig.build.json --emitDeclarationOnly --declaration --declarationMap",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@buddy/shared": "workspace:*",
    "@buddy/query": "workspace:*",
    "@hono/node-server": "^1.13.0",
    "better-sqlite3": "^11.3.0",
    "chokidar": "^3.6.0",
    "hono": "^4.6.0",
    "lru-cache": "^11.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.14.0",
    "pdf-lib": "^1.17.1",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: tsconfig.json + tsconfig.build.json + tsup.config.ts + vitest.config.ts** — mirror query package, plus `references: [{ "path": "../shared" }, { "path": "../query" }]` in tsconfig.

- [ ] **Step 3: src/index.ts stub** — `export {};`

- [ ] **Step 4:** `pnpm install && pnpm -F @buddy/server typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/server/ pnpm-lock.yaml
git commit -m "feat(server): scaffold @buddy/server package"
```

---

## Task 12: `db/migrations/001-init.sql` + `db/client.ts`

**Files:**
- Create: `packages/server/src/db/migrations/001-init.sql`
- Create: `packages/server/src/db/client.ts`
- Test: `packages/server/test/db/client.test.ts`

- [ ] **Step 1: 001-init.sql** (verbatim from spec §6.2 plus a meta table)

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  citations       TEXT,
  trace           TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_topic ON conversations(topic, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
```

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client.js';

describe('openDb + runMigrations', () => {
  it('opens :memory: and creates expected tables', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('conversations');
    expect(names).toContain('messages');
    expect(names).toContain('_migrations');
    db.close();
  });

  it('is idempotent', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    runMigrations(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM _migrations').get()).toEqual({ n: 1 });
    db.close();
  });
});
```

- [ ] **Step 3:** Run — expect FAIL.

- [ ] **Step 4: Implement**

```ts
import Database, { type Database as Db } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function runMigrations(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: number }[]).map((r) => r.id),
  );
  const insert = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');
  for (const f of files) {
    const id = Number.parseInt(f.split('-')[0], 10);
    if (applied.has(id)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    db.exec(sql);
    insert.run(id, Date.now());
  }
}
```

  **Note:** because tsup bundles `src/index.ts`, the SQL files don't ship in `dist/` by default. Add to `tsup.config.ts`: `loader: { '.sql': 'text' }` then `import sql001 from './migrations/001-init.sql'` and embed at compile time. Or: leave at runtime read + configure `tsup` to `copy: ['src/db/migrations/*.sql']`. Either approach works — pick one and document; tests pass with the dev (tsx) runtime regardless.

- [ ] **Step 5:** Run — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/ packages/server/test/db/client.test.ts
git commit -m "feat(server): sqlite client + migration runner"
```

---

## Task 13: `db/repo/conversations.ts`

**Files:**
- Create: `packages/server/src/db/repo/conversations.ts`
- Test: `packages/server/test/db/conversations.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client.js';
import { conversationsRepo } from '../../src/db/repo/conversations.js';

describe('conversationsRepo', () => {
  let repo: ReturnType<typeof conversationsRepo>;
  let db: ReturnType<typeof openDb>;
  beforeEach(() => { db = openDb(':memory:'); runMigrations(db); repo = conversationsRepo(db); });

  it('creates conversation with generated id + timestamps', () => {
    const id = repo.create({ topic: 'tax', title: 'My chat' });
    expect(id).toMatch(/^conv_/);
    const row = repo.get(id);
    expect(row?.topic).toBe('tax');
    expect(row?.title).toBe('My chat');
    expect(row?.deleted_at).toBeNull();
  });

  it('listByTopic excludes soft-deleted and orders by updated_at DESC', () => {
    const id1 = repo.create({ topic: 'tax', title: 'A' });
    const id2 = repo.create({ topic: 'tax', title: 'B' });
    repo.touch(id2);
    const id3 = repo.create({ topic: 'other', title: 'C' });
    repo.softDelete(id1);
    const list = repo.listByTopic('tax');
    expect(list.map((r) => r.id)).toEqual([id2]);
    expect(repo.listByTopic('other').map((r) => r.id)).toEqual([id3]);
  });

  it('rename updates title and updated_at', () => {
    const id = repo.create({ topic: 't', title: 'A' });
    const before = repo.get(id)!.updated_at;
    repo.rename(id, 'B');
    expect(repo.get(id)?.title).toBe('B');
    expect(repo.get(id)!.updated_at).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Database } from 'better-sqlite3';
import { convId } from '@buddy/shared';

export interface ConversationRow {
  id: string;
  topic: string;
  title: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function conversationsRepo(db: Database) {
  const insert = db.prepare(`INSERT INTO conversations (id, topic, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
  const getStmt = db.prepare(`SELECT * FROM conversations WHERE id = ?`);
  const listStmt = db.prepare(`SELECT * FROM conversations WHERE topic = ? AND deleted_at IS NULL ORDER BY updated_at DESC`);
  const renameStmt = db.prepare(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`);
  const softDeleteStmt = db.prepare(`UPDATE conversations SET deleted_at = ? WHERE id = ?`);
  const touchStmt = db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`);

  return {
    create(opts: { topic: string; title: string }): string {
      const id = convId();
      const now = Date.now();
      insert.run(id, opts.topic, opts.title, now, now);
      return id;
    },
    get(id: string): ConversationRow | undefined { return getStmt.get(id) as ConversationRow | undefined; },
    listByTopic(topic: string): ConversationRow[] { return listStmt.all(topic) as ConversationRow[]; },
    rename(id: string, title: string): void { renameStmt.run(title, Date.now(), id); },
    softDelete(id: string): void { softDeleteStmt.run(Date.now(), id); },
    touch(id: string): void { touchStmt.run(Date.now(), id); },
  };
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/repo/conversations.ts packages/server/test/db/conversations.test.ts
git commit -m "feat(server): conversations repo"
```

---

## Task 14: `db/repo/messages.ts`

**Files:**
- Create: `packages/server/src/db/repo/messages.ts`
- Test: `packages/server/test/db/messages.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client.js';
import { messagesRepo } from '../../src/db/repo/messages.js';
import { conversationsRepo } from '../../src/db/repo/conversations.js';

describe('messagesRepo', () => {
  let db: ReturnType<typeof openDb>;
  let convs: ReturnType<typeof conversationsRepo>;
  let msgs: ReturnType<typeof messagesRepo>;
  let cid: string;
  beforeEach(() => {
    db = openDb(':memory:'); runMigrations(db);
    convs = conversationsRepo(db); msgs = messagesRepo(db);
    cid = convs.create({ topic: 't', title: 'x' });
  });

  it('inserts user message with no citations/trace', () => {
    const id = msgs.insert({ conversation_id: cid, role: 'user', content: 'hi' });
    expect(id).toMatch(/^msg_/);
    const all = msgs.listByConversation(cid);
    expect(all[0]).toMatchObject({ id, role: 'user', content: 'hi', citations: [], trace: null });
  });

  it('inserts assistant message with citations + trace as JSON columns', () => {
    msgs.insert({
      conversation_id: cid, role: 'assistant', content: 'a',
      citations: [{ doc: 'a.pdf', node_ids: ['n1'], pages: [1] }],
      trace: { doc_selector: { reasoning: 'r', doc_ids: ['d1'] } },
    });
    const all = msgs.listByConversation(cid);
    expect(all[0].citations[0]).toMatchObject({ doc: 'a.pdf' });
    expect(all[0].trace?.doc_selector?.doc_ids).toEqual(['d1']);
  });

  it('orders by created_at ASC', () => {
    const a = msgs.insert({ conversation_id: cid, role: 'user', content: '1' });
    const b = msgs.insert({ conversation_id: cid, role: 'assistant', content: '2' });
    expect(msgs.listByConversation(cid).map((m) => m.id)).toEqual([a, b]);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Database } from 'better-sqlite3';
import { msgId, type Citation, type ReasoningTrace, type Message } from '@buddy/shared';

export function messagesRepo(db: Database) {
  const insertStmt = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, citations, trace, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const listStmt = db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`);

  return {
    insert(opts: {
      conversation_id: string;
      role: 'user' | 'assistant';
      content: string;
      citations?: Citation[];
      trace?: ReasoningTrace | null;
    }): string {
      const id = msgId();
      insertStmt.run(
        id, opts.conversation_id, opts.role, opts.content,
        opts.citations ? JSON.stringify(opts.citations) : null,
        opts.trace ? JSON.stringify(opts.trace) : null,
        Date.now(),
      );
      return id;
    },
    listByConversation(cid: string): Message[] {
      const rows = listStmt.all(cid) as {
        id: string; role: 'user' | 'assistant'; content: string;
        citations: string | null; trace: string | null; created_at: number;
      }[];
      return rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        citations: r.citations ? JSON.parse(r.citations) : [],
        trace: r.trace ? JSON.parse(r.trace) : null,
        created_at: r.created_at,
      }));
    },
  };
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/repo/messages.ts packages/server/test/db/messages.test.ts
git commit -m "feat(server): messages repo"
```

---

## Task 15: `db/repo/topics.ts` (filesystem scan)

**Files:**
- Create: `packages/server/src/db/repo/topics.ts`
- Test: `packages/server/test/db/topics.test.ts`

**Note:** topics live in the filesystem (`<dataDir>/<topic>/`), not the database. This module just lists them and counts indexed docs.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listTopics, listDocs } from '../../src/db/repo/topics.js';

describe('listTopics', () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tp-')); });

  it('returns empty array when dataDir is missing', async () => {
    expect(await listTopics(path.join(dataDir, 'nope'))).toEqual([]);
  });

  it('lists subdirectories with .index folders as topics', async () => {
    await fs.mkdir(path.join(dataDir, 'tax', '.index'), { recursive: true });
    await fs.writeFile(path.join(dataDir, 'tax', '.index', 'd1.tree.json'), JSON.stringify({
      doc_id: 'd1', doc_name: 'a.pdf', doc_description: '', structure: [],
    }));
    await fs.mkdir(path.join(dataDir, 'no-index'), { recursive: true });   // no .index → excluded
    const topics = await listTopics(dataDir);
    expect(topics).toEqual([{ topic: 'tax', doc_count: 1, last_built_at: expect.any(Number) }]);
  });
});

describe('listDocs', () => {
  it('returns docs from .index/*.tree.json with page_count from end_index max', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tp2-'));
    await fs.mkdir(path.join(dataDir, 'tax', '.index'), { recursive: true });
    await fs.writeFile(path.join(dataDir, 'tax', '.index', 'd1.tree.json'), JSON.stringify({
      doc_id: 'd1', doc_name: 'a.pdf', doc_description: 'd',
      structure: [{ title: 't', start_index: 1, end_index: 5, node_id: 'n', nodes: [], images: [], tables: [] }],
    }));
    const docs = await listDocs(dataDir, 'tax');
    expect(docs[0]).toMatchObject({ doc_id: 'd1', doc_name: 'a.pdf', page_count: 5 });
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveIndexDir, type DocSummary, type TopicSummary, type DocOutput, type TreeNode } from '@buddy/shared';

function maxEnd(nodes: TreeNode[]): number {
  let max = 0;
  for (const n of nodes) {
    max = Math.max(max, n.end_index, maxEnd(n.nodes));
  }
  return max;
}

export async function listTopics(dataDir: string): Promise<TopicSummary[]> {
  let entries: import('node:fs').Dirent[];
  try { entries = await fs.readdir(dataDir, { withFileTypes: true }); }
  catch { return []; }
  const out: TopicSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const indexDir = resolveIndexDir(dataDir, e.name);
    let files: string[];
    try { files = await fs.readdir(indexDir); } catch { continue; }
    const treeFiles = files.filter((f) => f.endsWith('.tree.json'));
    if (treeFiles.length === 0) continue;
    let last = 0;
    for (const f of treeFiles) {
      const stat = await fs.stat(path.join(indexDir, f));
      last = Math.max(last, stat.mtimeMs);
    }
    out.push({ topic: e.name, doc_count: treeFiles.length, last_built_at: Math.round(last) });
  }
  return out;
}

export async function listDocs(dataDir: string, topic: string): Promise<DocSummary[]> {
  const indexDir = resolveIndexDir(dataDir, topic);
  let files: string[];
  try { files = await fs.readdir(indexDir); } catch { return []; }
  const out: DocSummary[] = [];
  for (const f of files) {
    if (!f.endsWith('.tree.json')) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(indexDir, f), 'utf8')) as DocOutput;
      out.push({
        doc_id: raw.doc_id, doc_name: raw.doc_name, doc_description: raw.doc_description,
        page_count: Math.max(1, maxEnd(raw.structure)),
      });
    } catch { /* skip */ }
  }
  return out;
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/repo/topics.ts packages/server/test/db/topics.test.ts
git commit -m "feat(server): topics + docs filesystem repo"
```

---

## Task 16: `sse.ts` writer helper

**Files:**
- Create: `packages/server/src/sse.ts`

**Hono pattern:** return `new Response(stream, { headers: { 'content-type': 'text/event-stream' } })`. We build a small helper around `ReadableStream` to format events.

- [ ] **Step 1: Implement** (test piggybacks on chat route test)

```ts
export interface SseEvent { event: string; data: unknown; }

export function formatSse(ev: SseEvent): string {
  return 'event: ' + ev.event + '\ndata: ' + JSON.stringify(ev.data) + '\n\n';
}

export function sseStream(source: AsyncIterable<SseEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of source) controller.enqueue(encoder.encode(formatSse(ev)));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(formatSse({ event: 'error', data: { message } })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/sse.ts
git commit -m "feat(server): sse helper"
```

---

## Task 17: `routes/topics.ts`

**Files:**
- Create: `packages/server/src/routes/topics.ts`
- Test: `packages/server/test/routes/topics.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Hono } from 'hono';
import { topicsRoutes } from '../../src/routes/topics.js';

describe('topics routes', () => {
  it('GET /api/topics returns topic list', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-'));
    await fs.mkdir(path.join(dataDir, 'tax', '.index'), { recursive: true });
    await fs.writeFile(path.join(dataDir, 'tax', '.index', 'd1.tree.json'), JSON.stringify({
      doc_id: 'd1', doc_name: 'a.pdf', doc_description: '', structure: [],
    }));
    const app = new Hono().route('/api', topicsRoutes({ dataDir }));
    const res = await app.request('/api/topics');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].topic).toBe('tax');
  });

  it('GET /api/topics/:topic/docs returns doc summaries', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rt2-'));
    await fs.mkdir(path.join(dataDir, 'tax', '.index'), { recursive: true });
    await fs.writeFile(path.join(dataDir, 'tax', '.index', 'd1.tree.json'), JSON.stringify({
      doc_id: 'd1', doc_name: 'a.pdf', doc_description: 'about A',
      structure: [{ title: 't', start_index: 1, end_index: 3, node_id: 'n', nodes: [], images: [], tables: [] }],
    }));
    const app = new Hono().route('/api', topicsRoutes({ dataDir }));
    const res = await app.request('/api/topics/tax/docs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toMatchObject({ doc_id: 'd1', page_count: 3 });
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { Hono } from 'hono';
import { listTopics, listDocs } from '../db/repo/topics.js';

interface Deps { dataDir: string; }

export function topicsRoutes(deps: Deps): Hono {
  const app = new Hono();
  app.get('/topics', async (c) => c.json(await listTopics(deps.dataDir)));
  app.get('/topics/:topic/docs', async (c) => {
    const topic = c.req.param('topic');
    return c.json(await listDocs(deps.dataDir, topic));
  });
  return app;
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/topics.ts packages/server/test/routes/topics.test.ts
git commit -m "feat(server): topics routes"
```

---

## Task 18: `routes/conversations.ts`

**Files:**
- Create: `packages/server/src/routes/conversations.ts`
- Test: `packages/server/test/routes/conversations.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { openDb, runMigrations } from '../../src/db/client.js';
import { conversationsRepo } from '../../src/db/repo/conversations.js';
import { messagesRepo } from '../../src/db/repo/messages.js';
import { conversationsRoutes } from '../../src/routes/conversations.js';

describe('conversations routes', () => {
  let app: Hono;
  beforeEach(() => {
    const db = openDb(':memory:'); runMigrations(db);
    const convs = conversationsRepo(db); const msgs = messagesRepo(db);
    app = new Hono().route('/api', conversationsRoutes({ convs, msgs }));
  });

  it('POST creates and GET ?topic returns it', async () => {
    const c = await app.request('/api/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'tax', title: 'A' }),
    });
    expect(c.status).toBe(200);
    const { id } = await c.json();
    const list = await (await app.request('/api/conversations?topic=tax')).json();
    expect(list[0].id).toBe(id);
  });

  it('PATCH renames', async () => {
    const { id } = await (await app.request('/api/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 't', title: 'A' }),
    })).json();
    const r = await app.request('/api/conversations/' + id, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'B' }),
    });
    expect(r.status).toBe(200);
  });

  it('DELETE soft-deletes (excluded from list)', async () => {
    const { id } = await (await app.request('/api/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 't', title: 'A' }),
    })).json();
    await app.request('/api/conversations/' + id, { method: 'DELETE' });
    const list = await (await app.request('/api/conversations?topic=t')).json();
    expect(list).toEqual([]);
  });

  it('GET /:id/messages returns ordered messages', async () => {
    const { id } = await (await app.request('/api/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 't', title: 'A' }),
    })).json();
    // No messages yet
    const empty = await (await app.request('/api/conversations/' + id + '/messages')).json();
    expect(empty).toEqual([]);
  });

  it('POST validates required fields', async () => {
    const r = await app.request('/api/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: '' }),
    });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { Hono } from 'hono';
import { createConversationReqSchema, patchConversationReqSchema } from '@buddy/shared';
import type { conversationsRepo } from '../db/repo/conversations.js';
import type { messagesRepo } from '../db/repo/messages.js';

interface Deps {
  convs: ReturnType<typeof conversationsRepo>;
  msgs: ReturnType<typeof messagesRepo>;
}

export function conversationsRoutes(deps: Deps): Hono {
  const app = new Hono();

  app.get('/conversations', (c) => {
    const topic = c.req.query('topic');
    if (!topic) return c.json({ error: 'topic required' }, 400);
    return c.json(deps.convs.listByTopic(topic)
      .map((r) => ({ id: r.id, title: r.title, updated_at: r.updated_at })));
  });

  app.post('/conversations', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createConversationReqSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid body' }, 400);
    const id = deps.convs.create({ topic: parsed.data.topic, title: parsed.data.title ?? 'New chat' });
    return c.json({ id });
  });

  app.patch('/conversations/:id', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = patchConversationReqSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid body' }, 400);
    deps.convs.rename(c.req.param('id'), parsed.data.title);
    return c.json({ ok: true });
  });

  app.delete('/conversations/:id', (c) => {
    deps.convs.softDelete(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.get('/conversations/:id/messages', (c) => {
    return c.json(deps.msgs.listByConversation(c.req.param('id')));
  });

  return app;
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/conversations.ts packages/server/test/routes/conversations.test.ts
git commit -m "feat(server): conversations CRUD routes"
```

---

## Task 19: `routes/chat.ts` SSE + auto-title

**Files:**
- Create: `packages/server/src/routes/chat.ts`
- Test: `packages/server/test/routes/chat.test.ts`

**Flow per spec §6.4:**
1. Validate body. Lookup conversation. Insert user message.
2. Call `query.answer(...)`, iterate events. Map to SSE events:
   - `token` → `event: token data: {delta}`
   - `citations` → `event: citations data: [...]`
   - `trace` → `event: trace data: {...}`
   - `done` → after accumulating final text, insert assistant message; emit `event: done data: {message_id}`.
   - `error` → `event: error data: {message}`. Insert assistant message with content = "(failed)" so transcript remains coherent.
3. On first user message of a fresh conversation with default title, auto-title from first 60 chars of user query (no extra LLM call in v1; spec allows simple fallback).
4. Always `convs.touch(id)`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openDb, runMigrations } from '../../src/db/client.js';
import { conversationsRepo } from '../../src/db/repo/conversations.js';
import { messagesRepo } from '../../src/db/repo/messages.js';
import { chatRoutes } from '../../src/routes/chat.js';
import type { AnswerEvent } from '@buddy/query';

async function readSse(res: Response): Promise<{ event: string; data: any }[]> {
  const text = await res.text();
  const out: { event: string; data: any }[] = [];
  for (const block of text.split('\n\n').filter(Boolean)) {
    const ev = /event:\s*(\S+)/.exec(block)?.[1] ?? '';
    const data = /data:\s*(.*)/.exec(block)?.[1] ?? 'null';
    out.push({ event: ev, data: JSON.parse(data) });
  }
  return out;
}

describe('chat route', () => {
  it('emits token+citations+done and persists messages + auto-title', async () => {
    const db = openDb(':memory:'); runMigrations(db);
    const convs = conversationsRepo(db); const msgs = messagesRepo(db);
    const cid = convs.create({ topic: 't', title: 'New chat' });

    async function* stubAnswer(): AsyncIterable<AnswerEvent> {
      yield { type: 'trace', trace: { doc_selector: { reasoning: 'r', doc_ids: ['d1'] } } };
      yield { type: 'citations', citations: [{ doc: 'a.pdf', node_ids: ['n1'], pages: [1] }] };
      yield { type: 'token', delta: 'hello ' };
      yield { type: 'token', delta: 'world' };
      yield { type: 'done' };
    }

    const app = new Hono().route('/api', chatRoutes({
      convs, msgs,
      answer: () => stubAnswer(),
    }));

    const res = await app.request('/api/chat/stream', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: cid, query: 'what is up' }),
    });
    expect(res.status).toBe(200);
    const events = await readSse(res);
    const types = events.map((e) => e.event);
    expect(types).toContain('trace');
    expect(types).toContain('citations');
    expect(types.filter((t) => t === 'token').length).toBe(2);
    expect(types[types.length - 1]).toBe('done');

    const stored = msgs.listByConversation(cid);
    expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(stored[1].content).toBe('hello world');
    expect(stored[1].citations[0].doc).toBe('a.pdf');

    expect(convs.get(cid)?.title).toBe('what is up');   // auto-titled
  });

  it('handles error event by inserting failed message and emitting error', async () => {
    const db = openDb(':memory:'); runMigrations(db);
    const convs = conversationsRepo(db); const msgs = messagesRepo(db);
    const cid = convs.create({ topic: 't', title: 'X' });
    async function* errAnswer(): AsyncIterable<AnswerEvent> {
      yield { type: 'error', message: 'boom' };
    }
    const app = new Hono().route('/api', chatRoutes({ convs, msgs, answer: () => errAnswer() }));
    const res = await app.request('/api/chat/stream', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: cid, query: 'q' }),
    });
    const events = await readSse(res);
    expect(events.some((e) => e.event === 'error')).toBe(true);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { Hono } from 'hono';
import { chatStreamReqSchema, type Citation, type ReasoningTrace } from '@buddy/shared';
import type { AnswerEvent } from '@buddy/query';
import { sseStream, type SseEvent } from '../sse.js';
import type { conversationsRepo } from '../db/repo/conversations.js';
import type { messagesRepo } from '../db/repo/messages.js';

const DEFAULT_TITLE = 'New chat';
const TITLE_MAX = 60;

interface Deps {
  convs: ReturnType<typeof conversationsRepo>;
  msgs: ReturnType<typeof messagesRepo>;
  answer: (opts: { topic: string; query: string; history: { role: 'user' | 'assistant'; content: string }[] }) => AsyncIterable<AnswerEvent>;
}

export function chatRoutes(deps: Deps): Hono {
  const app = new Hono();

  app.post('/chat/stream', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = chatStreamReqSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid body' }, 400);
    const conv = deps.convs.get(parsed.data.conversation_id);
    if (!conv) return c.json({ error: 'conversation not found' }, 404);

    deps.msgs.insert({ conversation_id: conv.id, role: 'user', content: parsed.data.query });
    if (conv.title === DEFAULT_TITLE) {
      deps.convs.rename(conv.id,
        parsed.data.query.slice(0, TITLE_MAX) + (parsed.data.query.length > TITLE_MAX ? '…' : ''));
    }

    const history = deps.msgs.listByConversation(conv.id)
      .map((m) => ({ role: m.role, content: m.content }));
    // exclude the just-inserted user turn from history (it's the current query)
    history.pop();

    const iterable = deps.answer({ topic: conv.topic, query: parsed.data.query, history });

    const finalText: string[] = [];
    let pendingCitations: Citation[] = [];
    let pendingTrace: ReasoningTrace | null = null;

    async function* toSse(): AsyncIterable<SseEvent> {
      for await (const ev of iterable) {
        switch (ev.type) {
          case 'token':
            finalText.push(ev.delta);
            yield { event: 'token', data: { delta: ev.delta } };
            break;
          case 'citations':
            pendingCitations = ev.citations;
            yield { event: 'citations', data: ev.citations };
            break;
          case 'trace':
            pendingTrace = ev.trace;
            yield { event: 'trace', data: ev.trace };
            break;
          case 'done': {
            const msgId = deps.msgs.insert({
              conversation_id: conv.id, role: 'assistant',
              content: finalText.join(''),
              citations: pendingCitations,
              trace: pendingTrace,
            });
            deps.convs.touch(conv.id);
            yield { event: 'done', data: { message_id: msgId } };
            return;
          }
          case 'error': {
            deps.msgs.insert({
              conversation_id: conv.id, role: 'assistant',
              content: '(failed: ' + ev.message + ')',
              citations: [],
              trace: pendingTrace,
            });
            deps.convs.touch(conv.id);
            yield { event: 'error', data: { message: ev.message } };
            return;
          }
        }
      }
    }

    return sseStream(toSse());
  });

  return app;
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/test/routes/chat.test.ts
git commit -m "feat(server): chat SSE route + auto-title"
```

---

## Task 20: `pdf-cache.ts` + `routes/pdf.ts`

**Files:**
- Create: `packages/server/src/pdf-cache.ts`
- Create: `packages/server/src/routes/pdf.ts`
- Test: `packages/server/test/routes/pdf.test.ts`

**Behavior:** `/api/pdf/:topic/:doc?page=N&scale=2` returns PNG. Disk-cache at `<dataDir>/<topic>/.index/<docId>/pages/<page>@<scale>.png`. In-memory LRU caps open PDF handles at 4. `doc` parameter = doc_id (not filename) — server resolves to actual file via the tree (`doc_name`).

- [ ] **Step 1: pdf-cache.ts**

```ts
import { LRUCache } from 'lru-cache';
import { openPdf, type PdfDoc } from '@buddy/shared';
import fs from 'node:fs/promises';

export function createPdfCache(max = 4) {
  const cache = new LRUCache<string, PdfDoc>({ max });
  return {
    async load(filePath: string): Promise<PdfDoc> {
      const hit = cache.get(filePath);
      if (hit) return hit;
      const bytes = await fs.readFile(filePath);
      const doc = openPdf(bytes);
      cache.set(filePath, doc);
      return doc;
    },
  };
}
```

- [ ] **Step 2: Failing route test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { Hono } from 'hono';
import { pdfRoutes } from '../../src/routes/pdf.js';
import { createPdfCache } from '../../src/pdf-cache.js';

async function tinyPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  return Buffer.from(await pdf.save());
}

describe('pdf route', () => {
  it('returns PNG for valid page', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
    const topic = 'tax', docId = 'd1';
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.writeFile(pdfPath, await tinyPdf());
    await fs.writeFile(path.join(dataDir, topic, '.index', docId + '.tree.json'), JSON.stringify({
      doc_id: docId, doc_name: 'a.pdf', doc_description: '',
      structure: [{ title: 't', start_index: 1, end_index: 1, node_id: 'n', nodes: [], images: [], tables: [] }],
    }));

    const app = new Hono().route('/api', pdfRoutes({
      dataDir, cache: createPdfCache(), pdfPathFor: (t, name) => path.join(dataDir, t, name),
    }));
    const res = await app.request('/api/pdf/tax/d1?page=1&scale=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('returns 404 for unknown doc_id', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf2-'));
    const app = new Hono().route('/api', pdfRoutes({
      dataDir, cache: createPdfCache(), pdfPathFor: (t, name) => path.join(dataDir, t, name),
    }));
    const res = await app.request('/api/pdf/tax/missing?page=1');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid page param', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf3-'));
    const app = new Hono().route('/api', pdfRoutes({
      dataDir, cache: createPdfCache(), pdfPathFor: () => '',
    }));
    const res = await app.request('/api/pdf/tax/d1?page=abc');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Implement `routes/pdf.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { renderPage, resolveIndexDir, type DocOutput } from '@buddy/shared';
import type { createPdfCache } from '../pdf-cache.js';

interface Deps {
  dataDir: string;
  cache: ReturnType<typeof createPdfCache>;
  pdfPathFor: (topic: string, docName: string) => string;
}

async function readDoc(dataDir: string, topic: string, docId: string): Promise<DocOutput | null> {
  try {
    const raw = await fs.readFile(path.join(resolveIndexDir(dataDir, topic), docId + '.tree.json'), 'utf8');
    return JSON.parse(raw) as DocOutput;
  } catch { return null; }
}

export function pdfRoutes(deps: Deps): Hono {
  const app = new Hono();

  app.get('/pdf/:topic/:docId', async (c) => {
    const page = Number.parseInt(c.req.query('page') ?? '', 10);
    const scale = Number.parseFloat(c.req.query('scale') ?? '2');
    if (!Number.isFinite(page) || page < 1) return c.json({ error: 'invalid page' }, 400);

    const { topic, docId } = c.req.param();
    const doc = await readDoc(deps.dataDir, topic, docId);
    if (!doc) return c.json({ error: 'doc not found' }, 404);

    const cacheDir = path.join(resolveIndexDir(deps.dataDir, topic), docId, 'pages');
    const cacheFile = path.join(cacheDir, page + '@' + scale + '.png');
    try {
      const cached = await fs.readFile(cacheFile);
      return new Response(cached, { headers: { 'content-type': 'image/png' } });
    } catch { /* miss */ }

    const pdfPath = deps.pdfPathFor(topic, doc.doc_name);
    let pdfDoc;
    try { pdfDoc = await deps.cache.load(pdfPath); }
    catch { return c.json({ error: 'pdf load failed' }, 500); }

    let png: Buffer;
    try { png = renderPage(pdfDoc, page - 1, scale).png; }
    catch { return c.json({ error: 'render failed' }, 500); }

    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, png);
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  });

  return app;
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/pdf-cache.ts packages/server/src/routes/pdf.ts packages/server/test/routes/pdf.test.ts
git commit -m "feat(server): pdf preview route with disk + LRU cache"
```

---

## Task 21: `static.ts` (serve web dist)

**Files:**
- Create: `packages/server/src/static.ts`

**Behavior:** In prod, serve `packages/web/dist/index.html` + assets. In dev, do nothing (Vite serves separately). v1: simplest — if `webDistDir` exists, mount `serveStatic`. Plan 5 builds `dist`; until then this is inert.

- [ ] **Step 1: Implement**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

interface Opts { webDistDir?: string; }

export function staticRoutes(opts: Opts): Hono {
  const app = new Hono();
  if (!opts.webDistDir || !fs.existsSync(opts.webDistDir)) return app;
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), opts.webDistDir) }));
  // SPA fallback
  app.get('/*', (c) => {
    const html = fs.readFileSync(path.join(opts.webDistDir!, 'index.html'), 'utf8');
    return c.html(html);
  });
  return app;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/static.ts
git commit -m "feat(server): static routes (web dist)"
```

---

## Task 22: `index.ts` — `createApp()` composition

**Files:**
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/deps.ts`

- [ ] **Step 1: deps.ts**

```ts
import type { conversationsRepo } from './db/repo/conversations.js';
import type { messagesRepo } from './db/repo/messages.js';
import type { createPdfCache } from './pdf-cache.js';
import type { GeminiClient } from '@buddy/shared';
import type { TopicCache } from '@buddy/query';

export interface ServerDeps {
  dataDir: string;
  convs: ReturnType<typeof conversationsRepo>;
  msgs: ReturnType<typeof messagesRepo>;
  pdfCache: ReturnType<typeof createPdfCache>;
  topicCache: TopicCache;
  gemini: GeminiClient;
  webDistDir?: string;
  pdfPathFor: (topic: string, docName: string) => string;
}
```

- [ ] **Step 2: index.ts**

```ts
import { Hono } from 'hono';
import { answer as queryAnswer } from '@buddy/query';
import { topicsRoutes } from './routes/topics.js';
import { conversationsRoutes } from './routes/conversations.js';
import { chatRoutes } from './routes/chat.js';
import { pdfRoutes } from './routes/pdf.js';
import { staticRoutes } from './static.js';
import type { ServerDeps } from './deps.js';

export function createApp(deps: ServerDeps): Hono {
  const app = new Hono();

  app.route('/api', topicsRoutes({ dataDir: deps.dataDir }));
  app.route('/api', conversationsRoutes({ convs: deps.convs, msgs: deps.msgs }));
  app.route('/api', chatRoutes({
    convs: deps.convs, msgs: deps.msgs,
    answer: ({ topic, query, history }) => queryAnswer({
      dataDir: deps.dataDir, topic, query, history,
      gemini: deps.gemini, pdfPathFor: (docName) => deps.pdfPathFor(topic, docName),
    }),
  }));
  app.route('/api', pdfRoutes({
    dataDir: deps.dataDir, cache: deps.pdfCache, pdfPathFor: deps.pdfPathFor,
  }));

  if (deps.webDistDir) app.route('/', staticRoutes({ webDistDir: deps.webDistDir }));

  return app;
}

export { createPdfCache } from './pdf-cache.js';
export { openDb, runMigrations } from './db/client.js';
export { conversationsRepo } from './db/repo/conversations.js';
export { messagesRepo } from './db/repo/messages.js';
export type { ServerDeps } from './deps.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts packages/server/src/deps.ts
git commit -m "feat(server): createApp composes routes"
```

---

## Task 23: Integration test — end-to-end chat flow

**Files:**
- Create: `packages/server/test/integration/chat-flow.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createApp, openDb, runMigrations, conversationsRepo, messagesRepo, createPdfCache } from '../../src/index.js';
import { createTopicCache } from '@buddy/query';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { docSelectorPrompt } from '@buddy/query/src/prompts/doc-selector.js';
import { treeReasonerPrompt } from '@buddy/query/src/prompts/tree-reasoner.js';
import { answerPrompt } from '@buddy/query/src/prompts/answer.js';

it('full chat round-trip persists messages and streams SSE', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-'));
  const topic = 'tax', docId = 'd1';
  await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
  // PDF
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([200, 200]);
  p.drawText('Revenue grew 10%.', { x: 10, y: 100, size: 12, font: f });
  const pdfPath = path.join(dataDir, topic, 'a.pdf');
  await fs.writeFile(pdfPath, Buffer.from(await pdf.save()));
  // Tree
  const doc: DocOutput = {
    doc_id: docId, doc_name: 'a.pdf', doc_description: 'finance',
    structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
  };
  await fs.writeFile(path.join(dataDir, topic, '.index', docId + '.tree.json'), JSON.stringify(doc));

  // Stub responses keyed exactly by prompt hash
  const treePrompt = treeReasonerPrompt([doc], 'how was revenue?', '');
  const aPrompt = answerPrompt('how was revenue?', [{
    doc_id: docId, doc_name: 'a.pdf', node_id: 'n1', title: 'Q3',
    page_range: [1, 1], text: '--- page 1 ---\nRevenue grew 10%.',
    image_captions: [], tables: [],
  }], []);
  const responses = new Map();
  responses.set(hashPrompt([treePrompt]), { text: JSON.stringify({
    reasoning: 'pick Q3', selections: [{ doc_id: docId, node_ids: ['n1'] }],
  }) });
  responses.set(hashPrompt([aPrompt]), { text: 'Revenue grew 10%.' });
  const gemini = createStubGemini({ responses });

  const db = openDb(':memory:'); runMigrations(db);
  const convs = conversationsRepo(db); const msgs = messagesRepo(db);
  const topicCache = createTopicCache({ dataDir, watch: false });
  const app = createApp({
    dataDir, convs, msgs,
    pdfCache: createPdfCache(),
    topicCache, gemini,
    pdfPathFor: (t, name) => path.join(dataDir, t, name),
  });

  // Create conversation
  const { id: cid } = await (await app.request('/api/conversations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic, title: 'New chat' }),
  })).json();

  // Stream chat
  const res = await app.request('/api/chat/stream', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation_id: cid, query: 'how was revenue?' }),
  });
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).toContain('event: trace');
  expect(text).toContain('event: citations');
  expect(text).toContain('event: token');
  expect(text).toContain('event: done');

  // Messages persisted
  const stored = msgs.listByConversation(cid);
  expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(stored[1].content).toContain('Revenue grew 10%');
});
```

  **Note:** importing `@buddy/query/src/prompts/...` directly requires either a `tsconfig.paths` mapping or making prompts publicly re-exported from `@buddy/query/index`. Pick whichever is simpler — preferably re-export prompts as `export * as prompts from './prompts/...'` from `@buddy/query` and reference them via `prompts.docSelectorPrompt(...)`. Adjust imports above accordingly.

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3:** Fix prompt-export pathway, re-run — expect PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/test/integration/chat-flow.test.ts packages/query/src/index.ts
git commit -m "test(server): end-to-end chat-flow integration"
```

---

## Task 24: `apps/serve` bootstrap

**Files:**
- Create: `apps/serve/package.json`
- Create: `apps/serve/tsconfig.json`
- Create: `apps/serve/src/index.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "@buddy/serve",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "build": "tsup",
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@buddy/server": "workspace:*",
    "@buddy/query": "workspace:*",
    "@buddy/shared": "workspace:*",
    "@hono/node-server": "^1.13.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "./dist", "rootDir": "./src" }, "include": ["src/**/*"] }
```

- [ ] **Step 3: src/index.ts**

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import {
  loadConfig, createRealGemini, createLogger, type Config,
} from '@buddy/shared';
import { createTopicCache } from '@buddy/query';
import {
  createApp, openDb, runMigrations, conversationsRepo, messagesRepo, createPdfCache,
} from '@buddy/server';

async function main(): Promise<void> {
  const cfg: Config = loadConfig();
  const logger = createLogger({ level: cfg.logLevel });

  const dbPath = path.join(cfg.dataDir, 'buddy.sqlite');
  const db = openDb(dbPath);
  runMigrations(db);

  const topicCache = createTopicCache({ dataDir: cfg.dataDir, watch: true,
    onChange: (topic) => logger.info({ topic }, 'tree cache reloaded') });

  const gemini = createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });

  const webDist = path.resolve(fileURLToPath(import.meta.url), '../../../../packages/web/dist');

  const app = createApp({
    dataDir: cfg.dataDir,
    convs: conversationsRepo(db),
    msgs: messagesRepo(db),
    pdfCache: createPdfCache(4),
    topicCache, gemini,
    webDistDir: webDist,
    pdfPathFor: (topic, docName) => path.join(cfg.dataDir, topic, docName),
  });

  serve({ fetch: app.fetch, port: cfg.port }, (info) => {
    logger.info({ port: info.port }, 'buddy server listening');
  });

  const shutdown = async () => {
    logger.info('shutting down');
    await topicCache.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4:** Typecheck:

```bash
pnpm install
pnpm -F @buddy/serve typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/serve/ pnpm-lock.yaml
git commit -m "feat(serve): bootstrap app"
```

---

## Task 25: Smoke test — manual run

- [ ] **Step 1:** Ensure `.env` exists (or copy `.env.example`) with valid `GEMINI_API_KEY`.

- [ ] **Step 2:** Start server:

```bash
pnpm -F @buddy/serve start
```

Expected: log line "buddy server listening port=3000".

- [ ] **Step 3:** Probe API:

```bash
curl http://localhost:3000/api/topics
```

Expected: JSON array (may be empty if no built docs yet).

- [ ] **Step 4:** If a topic+doc already built (from plan-2/plan-3 work):

```bash
curl -X POST http://localhost:3000/api/conversations -H "content-type: application/json" -d '{"topic":"<your-topic>"}'
# → { id: "conv_..." }
curl -X POST http://localhost:3000/api/chat/stream -H "content-type: application/json" -d '{"conversation_id":"<id>","query":"summarize"}'
```

Expected: SSE stream with `trace`/`citations`/`token`/`done`.

- [ ] **Step 5:** Ctrl+C → "shutting down" log line.

- [ ] **Step 6:** No commit (verification only). Document any deviations needed (port collision, mupdf wasm path issue) in the memory status update later.

---

## Task 26: Final verification

- [ ] **Step 1: Typecheck all**

```bash
pnpm -r typecheck
```

Expected: clean across `shared`, `pipeline`, `query`, `server`, `build-index`, `serve`.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 3: All tests**

```bash
pnpm -r test
```

Expected: all green. Plan 4 adds ~40 new tests (query: ~12, server: ~25, integration: 1+). Total target: prior 130+ ≈ 170+ tests across repo.

- [ ] **Step 4: Build dist**

```bash
pnpm -F @buddy/shared build
pnpm -F @buddy/pipeline build
pnpm -F @buddy/query build
pnpm -F @buddy/server build
pnpm -F @buddy/serve build
```

Expected: ESM + DTS clean for all five.

- [ ] **Step 5: Append memory status** in `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` under "## Status (auto-updated)":

```
- 2026-MM-DD: Plan 4 complete. @buddy/query (doc-selector → tree-reasoner → retrieval → streaming answer w/ forest-union fallback) + @buddy/server (Hono + SQLite + SSE + PDF preview + topic watcher) + apps/serve bootstrap. End-to-end chat round-trip verified against fixture topic. <NN> new tests.
```

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/plans/2026-05-21-query-server.md
git commit -m "chore(plan): plan 4 query+server"
```

---

## Self-Review Notes (author)

- **Spec §5 coverage:** topic-loader (5.1, 5.5), doc-selector (5.2, 5.6 forest-union), tree-reasoner (5.2, 5.6), retrieval (5.2), answer-generator (5.2), history (5.3), trace events (5.4). Gemini context-cache (5.5) deferred — out-of-scope marker added; the `cache.ts` helper in `@buddy/shared` already exists from plan 1 and the chat route does not wire it. Mark as known v1 gap.
- **Spec §6 coverage:** module layout (6.1), schema (6.2 verbatim), every API endpoint (6.3) → Tasks 17, 18, 19, 20. Chat flow (6.4) → Task 19. PDF preview (6.5) → Task 20. Static hosting (6.6) → Task 21. Startup (6.7) → Task 24.
- **Spec §10 error handling coverage:** LLM retry already in `@buddy/shared` plan 1; SSE mid-stream error → Task 19 emits `error` event + persists failed message; DB migration fail at startup → process.exit(1) via `runMigrations` throw in `apps/serve`; PDF load fail → 500 in pdf route.
- **No placeholders.** All step bodies include actual code or commands.
- **Type consistency:** `AnswerEvent` referenced identically in query/index.ts (Task 10), chat route (Task 19), and integration test (Task 23). `Citation`/`ReasoningTrace` come from `@buddy/shared/schemas/api.ts` (plan 1) and are consumed consistently. `ServerDeps` defined in Task 22, consumed in Task 24. ✅
- **Stub gemini map keys:** all query/server tests using stub use `hashPrompt([promptString])` as the key — matches the plan-1 stub implementation. Verified.
- **Caveats engineer should know:**
  - tsup does not bundle SQL files by default → Task 12 includes a note to either embed via loader or copy via tsup. Pick one — don't skip.
  - Importing prompts cross-package (Task 23 integration test) may need a re-export from `@buddy/query`. Note included.
  - `@hono/node-server`'s `serveStatic` path is relative to `process.cwd()` — Task 21 documents.
