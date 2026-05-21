# Pipeline-Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@buddy/pipeline` (text-only path) — the 10-step PageIndex pipeline + fallback chain + verification & fix + hierarchical agents + per-step file caching + `apps/build-index` CLI. Ships: end-to-end `pdf → data/<topic>/.index/<doc>.tree.json` for text-only docs (no images, no tables — those land in plan #3).

**Architecture:** Pure-function steps composed by a linear orchestrator (Approach C from spec §4.2). Each step accepts a typed `Ctx` (gemini client, logger, pool, cfg, cache dir) and returns a typed result. Cross-cutting concerns (`withRetry`, `withLogger`, `withCache`) are wrapper HOFs applied inside each step module, not inside the orchestrator. LLM calls go through the shared `LlmPool` from `@buddy/shared`. Hierarchical agent fan-out (sub-group → group-master → chapter-master) is invoked from Step 8 when a node exceeds `MAX_PAGES_PER_NODE` and `HIERARCHICAL_PROCESSING=true`.

**Tech Stack:** TypeScript strict ESM, Node ≥ 20, tsup build, Vitest, zod, pino, p-limit, mupdf, `@google/generative-ai`, nanoid, `gpt-tokenizer` (cl100k_base — Gemini-compatible enough for relative sizing), `commander` (CLI), `globby` (CLI doc discovery).

**Spec reference:** `docs/superpowers/specs/2026-05-21-buddy-design.md` §4 (pipeline), §10 (errors), §11 (testing). PageIndex source docs: `invest-page-index/docs/steps/01..10`, `invest-page-index/docs/fallback-modes.md`, `invest-page-index/optimize/hierarchical-agent-architecture.md`, `invest-page-index/docs/edge-cases/`.

**Foundation already shipped (read first):**
- `packages/shared/src/llm/{types,gemini,stub,retry,pool}.ts` — `GeminiClient`, `createStubGemini`, `withRetry`, `createLlmPool`.
- `packages/shared/src/schemas/tree.ts` — `TreeNode`, `DocOutput`, `treeNodeSchema`, `docOutputSchema`.
- `packages/shared/src/{config,paths,pdf,ids,logger}.ts`.

---

## File Structure

```
packages/pipeline/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts                          # public: buildDoc, buildTopic
    ├── types.ts                          # Ctx, BuildOpts, FlatTocEntry, RawPage, etc.
    ├── orchestrator.ts                   # composes steps + branching
    ├── tokens.ts                         # countTokens (gpt-tokenizer wrapper)
    ├── cache.ts                          # withCache: per-step file cache
    ├── wrappers/
    │   └── with-logger.ts
    ├── prompts/                          # one .ts per prompt; export functions
    │   ├── detect-toc.ts
    │   ├── detect-page-numbers.ts
    │   ├── toc-transform.ts
    │   ├── toc-transform-check.ts
    │   ├── physical-mapping.ts
    │   ├── verify-mapping.ts
    │   ├── fix-mapping.ts
    │   ├── title-at-start.ts
    │   ├── split-large.ts
    │   ├── summarize-node.ts
    │   ├── doc-description.ts
    │   ├── no-toc-headings.ts
    │   ├── subgroup-headings.ts
    │   ├── group-master.ts
    │   └── chapter-master.ts
    ├── steps/
    │   ├── 01-extract.ts
    │   ├── 02-detect-toc.ts
    │   ├── 03-toc-content.ts
    │   ├── 04-detect-page-numbers.ts
    │   ├── 05-toc-transform.ts
    │   ├── 06-physical-mapping.ts
    │   ├── 06_5-validate-indices.ts
    │   ├── 06_6-verify-fix.ts
    │   ├── 06_7-add-preface.ts
    │   ├── 06_8-title-at-start.ts
    │   ├── 07-build-tree.ts
    │   ├── 08-split-large.ts
    │   ├── 09-add-summaries.ts
    │   └── 10-output-json.ts
    ├── fallbacks/
    │   ├── process-no-toc.ts
    │   └── process-toc-no-page-numbers.ts
    ├── hierarchical/
    │   ├── chunk.ts                      # 6k-token chunking w/ 1-page overlap
    │   ├── subgroup-agent.ts
    │   ├── group-master.ts
    │   ├── chapter-master.ts
    │   └── orchestrator.ts               # parallel fan-out
    ├── json-utils.ts                     # robust extract-json (markdown fences, truncation)
    └── schemas.ts                        # zod for step IO (FlatToc, MappedEntry, etc.)
└── test/
    ├── unit/                             # one *.test.ts per src file
    ├── fixtures/
    │   ├── make-tiny-pdf.ts              # pdf-lib in-memory generator
    │   └── responses/                    # canned LLM responses keyed by hash
    └── golden/
        ├── small-with-toc.test.ts        # full buildDoc, stubbed LLM, snapshot tree
        ├── no-toc.test.ts
        └── toc-no-page-numbers.test.ts

apps/build-index/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                          # entrypoint (`#!/usr/bin/env node`)
    └── cli.ts                            # commander setup
```

---

## Task 1: Scaffold `@buddy/pipeline` package

**Files:**
- Create: `packages/pipeline/package.json`
- Create: `packages/pipeline/tsconfig.json`
- Create: `packages/pipeline/tsup.config.ts`
- Create: `packages/pipeline/src/index.ts` (stub)
- Create: `packages/pipeline/tsconfig.build.json` (composite=false for tsup; mirrors shared)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@buddy/pipeline",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsup", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@buddy/shared": "workspace:*",
    "gpt-tokenizer": "^2.5.0",
    "nanoid": "^5.0.7",
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

- [ ] **Step 2: Write `tsconfig.json`**

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

- [ ] **Step 3: Write `tsconfig.build.json`**

```json
{ "extends": "./tsconfig.json", "compilerOptions": { "composite": false, "incremental": false } }
```

- [ ] **Step 4: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: './tsconfig.build.json' },
  clean: true,
  sourcemap: true,
  target: 'node20',
});
```

- [ ] **Step 5: Write stub `src/index.ts`**

```ts
export {};
```

- [ ] **Step 6: Install + verify build**

Run: `pnpm install`
Run: `pnpm --filter @buddy/pipeline build`
Expected: `dist/index.js` + `dist/index.d.ts` produced, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline pnpm-lock.yaml
git commit -m "feat(pipeline): scaffold @buddy/pipeline package"
```

---

## Task 2: `tokens.ts` — token counting helper

**Files:**
- Create: `packages/pipeline/src/tokens.ts`
- Create: `packages/pipeline/test/unit/tokens.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/unit/tokens.test.ts
import { describe, expect, it } from 'vitest';
import { countTokens } from '../../src/tokens.js';

describe('countTokens', () => {
  it('returns 0 for empty', () => { expect(countTokens('')).toBe(0); });
  it('returns positive int for non-empty', () => {
    const n = countTokens('Hello world, this is a test.');
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });
  it('scales roughly with length', () => {
    const a = countTokens('short');
    const b = countTokens('short '.repeat(100));
    expect(b).toBeGreaterThan(a * 10);
  });
});
```

- [ ] **Step 2: Run test — expect fail (no module)**

Run: `pnpm --filter @buddy/pipeline exec vitest run test/unit/tokens.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement**

```ts
// src/tokens.ts
import { encode } from 'gpt-tokenizer';

export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @buddy/pipeline exec vitest run test/unit/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/tokens.ts packages/pipeline/test/unit/tokens.test.ts
git commit -m "feat(pipeline): add token counter"
```

---

## Task 3: `types.ts` — Ctx, BuildOpts, core types

**Files:**
- Create: `packages/pipeline/src/types.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// src/types.ts
import type { GeminiClient, LlmPool, Logger, Config } from '@buddy/shared';

export interface RawPage {
  pageNumber: number;       // 1-based physical page
  text: string;
  tokenCount: number;
}

export interface FlatTocEntry {
  structure: string;        // "1", "1.1", ...
  title: string;
  page?: number;            // logical page from TOC text (Step 5)
  physical_index?: number;  // 1-based physical (Step 6)
  appear_start?: 'yes' | 'no'; // Step 6.8
}

export interface BuildOpts {
  addSummaries: boolean;
  hierarchicalProcessing: boolean;
  maxPagesPerNode: number;
  maxTokensPerNode: number;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
  maxRetries: number;
  tocCheckPageNum: number;  // default 20
  force: boolean;
  forceFromStep?: string;
}

export interface Ctx {
  cfg: Config;
  gemini: GeminiClient;
  pool: LlmPool;
  logger: Logger;
  runId: string;
  topic: string;
  docId: string;
  pdfPath: string;
  cacheDir: string;         // resolveDocCacheDir(cfg.dataDir, topic, docId)
  opts: BuildOpts;
}

export function buildOptsFromConfig(cfg: Config, override: Partial<BuildOpts> = {}): BuildOpts {
  return {
    addSummaries: cfg.addSummaries,
    hierarchicalProcessing: cfg.hierarchicalProcessing,
    maxPagesPerNode: cfg.maxPagesPerNode,
    maxTokensPerNode: 20000,
    subgroupTokenSize: cfg.subgroupTokenSize,
    maxRetrievalsPerMaster: cfg.maxRetrievalsPerMaster,
    maxRetries: cfg.maxRetries,
    tocCheckPageNum: 20,
    force: false,
    ...override,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @buddy/pipeline typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/types.ts
git commit -m "feat(pipeline): add core types"
```

---

## Task 4: `json-utils.ts` — robust JSON extraction

**Files:**
- Create: `packages/pipeline/src/json-utils.ts`
- Create: `packages/pipeline/test/unit/json-utils.test.ts`

Reason: LLM responses arrive wrapped in markdown fences, truncated, with prose preface. Single helper per `edge-cases/llm-response.md`.

- [ ] **Step 1: Write failing tests**

```ts
// test/unit/json-utils.test.ts
import { describe, expect, it } from 'vitest';
import { extractJson } from '../../src/json-utils.js';

describe('extractJson', () => {
  it('parses raw JSON object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('strips plain ``` fences', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('truncates trailing garbage at last valid }', () => {
    expect(extractJson('{"a":1,"b":2} blah blah')).toEqual({ a: 1, b: 2 });
  });
  it('parses array', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });
  it('recovers truncated array at last valid ]', () => {
    expect(extractJson('[{"x":1},{"x":2}] trailing')).toEqual([{ x: 1 }, { x: 2 }]);
  });
  it('throws on unparseable', () => {
    expect(() => extractJson('not json at all')).toThrow();
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @buddy/pipeline exec vitest run test/unit/json-utils.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/json-utils.ts
export function extractJson<T = unknown>(text: string): T {
  let s = text.trim();
  // strip ```json ... ``` or ``` ... ```
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence?.[1]) s = fence[1].trim();
  // first attempt: raw parse
  try { return JSON.parse(s) as T; } catch { /* fallback */ }
  // find first { or [
  const startObj = s.indexOf('{');
  const startArr = s.indexOf('[');
  const start = startArr === -1 ? startObj
    : startObj === -1 ? startArr
    : Math.min(startObj, startArr);
  if (start === -1) throw new Error('extractJson: no JSON start found');
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  // walk forward, track depth respecting strings
  let depth = 0, inStr = false, esc = false, lastValid = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) lastValid = i; }
    }
  }
  if (lastValid === -1) throw new Error('extractJson: no balanced close');
  return JSON.parse(s.slice(start, lastValid + 1)) as T;
}
```

- [ ] **Step 4: Run — pass**

Expected: all 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/json-utils.ts packages/pipeline/test/unit/json-utils.test.ts
git commit -m "feat(pipeline): add robust JSON extractor"
```

---

## Task 5: `cache.ts` — per-step file cache

**Files:**
- Create: `packages/pipeline/src/cache.ts`
- Create: `packages/pipeline/test/unit/cache.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/cache.test.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withCache } from '../../src/cache.js';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcache-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('withCache', () => {
  it('runs fn on miss, returns its result, writes file', async () => {
    let calls = 0;
    const r = await withCache({ cacheDir: dir, step: 'step01', force: false }, async () => { calls++; return { ok: 1 }; });
    expect(r).toEqual({ ok: 1 });
    expect(calls).toBe(1);
    const stat = await fs.stat(path.join(dir, 'step01.json'));
    expect(stat.isFile()).toBe(true);
  });

  it('skips fn on hit, returns cached', async () => {
    let calls = 0;
    const fn = async () => { calls++; return { v: calls }; };
    await withCache({ cacheDir: dir, step: 's', force: false }, fn);
    const r = await withCache({ cacheDir: dir, step: 's', force: false }, fn);
    expect(r).toEqual({ v: 1 });
    expect(calls).toBe(1);
  });

  it('force=true re-runs even on hit', async () => {
    let calls = 0;
    const fn = async () => { calls++; return { v: calls }; };
    await withCache({ cacheDir: dir, step: 's', force: false }, fn);
    const r = await withCache({ cacheDir: dir, step: 's', force: true }, fn);
    expect(r).toEqual({ v: 2 });
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

```ts
// src/cache.ts
import fs from 'node:fs/promises';
import path from 'node:path';

export interface CacheKey {
  cacheDir: string;
  step: string;
  force: boolean;
}

export async function withCache<T>(key: CacheKey, fn: () => Promise<T>): Promise<T> {
  const file = path.join(key.cacheDir, `${key.step}.json`);
  if (!key.force) {
    try {
      const buf = await fs.readFile(file, 'utf8');
      return JSON.parse(buf) as T;
    } catch { /* miss */ }
  }
  const result = await fn();
  await fs.mkdir(key.cacheDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(result), 'utf8');
  return result;
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/cache.ts packages/pipeline/test/unit/cache.test.ts
git commit -m "feat(pipeline): add per-step file cache"
```

---

## Task 6: `wrappers/with-logger.ts` — step timing + log wrapper

**Files:**
- Create: `packages/pipeline/src/wrappers/with-logger.ts`
- Create: `packages/pipeline/test/unit/with-logger.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/with-logger.test.ts
import { describe, expect, it, vi } from 'vitest';
import { withLogger } from '../../src/wrappers/with-logger.js';

describe('withLogger', () => {
  it('logs start + end, returns result', async () => {
    const info = vi.fn();
    const logger = { info, child: () => ({ info } as never) } as never;
    const r = await withLogger({ logger, step: 'step01' }, async () => 42);
    expect(r).toBe(42);
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls[0]?.[0]).toMatchObject({ step: 'step01', phase: 'start' });
    expect(info.mock.calls[1]?.[0]).toMatchObject({ step: 'step01', phase: 'end' });
  });

  it('logs error + rethrows', async () => {
    const error = vi.fn();
    const logger = { info: vi.fn(), error, child: () => ({} as never) } as never;
    await expect(withLogger({ logger, step: 's' }, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/wrappers/with-logger.ts
import type { Logger } from '@buddy/shared';

export interface LoggerOpts { logger: Logger; step: string; }

export async function withLogger<T>(opts: LoggerOpts, fn: () => Promise<T>): Promise<T> {
  const { logger, step } = opts;
  const t0 = Date.now();
  logger.info({ step, phase: 'start' }, `[${step}] start`);
  try {
    const r = await fn();
    logger.info({ step, phase: 'end', ms: Date.now() - t0 }, `[${step}] end`);
    return r;
  } catch (err) {
    logger.error({ step, phase: 'error', err }, `[${step}] error`);
    throw err;
  }
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/wrappers packages/pipeline/test/unit/with-logger.test.ts
git commit -m "feat(pipeline): add withLogger step wrapper"
```

---

## Task 7: `schemas.ts` — zod schemas for step IO

**Files:**
- Create: `packages/pipeline/src/schemas.ts`
- Create: `packages/pipeline/test/unit/schemas.test.ts`

- [ ] **Step 1: Write schemas**

```ts
// src/schemas.ts
import { z } from 'zod';

export const rawPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
  tokenCount: z.number().int().nonnegative(),
});

export const flatTocEntrySchema = z.object({
  structure: z.string(),
  title: z.string(),
  page: z.number().int().positive().optional(),
  physical_index: z.number().int().positive().optional(),
  appear_start: z.enum(['yes', 'no']).optional(),
});

export const detectTocResponseSchema = z.object({
  thinking: z.string().optional(),
  toc_detected: z.enum(['yes', 'no']),
});

export const detectPageNumbersResponseSchema = z.object({
  thinking: z.string().optional(),
  page_index_given_in_toc: z.enum(['yes', 'no']),
});

export const tocTransformResponseSchema = z.object({
  table_of_contents: z.array(z.object({
    structure: z.string(),
    title: z.string(),
    page: z.number().int().positive(),
  })),
});

export const physicalMappingResponseSchema = z.array(z.object({
  structure: z.string(),
  title: z.string(),
  physical_index: z.string(),  // "<physical_index_5>"
}));

export const verifyMappingResponseSchema = z.object({
  results: z.array(z.object({ structure: z.string(), correct: z.enum(['yes', 'no']) })),
});

export const subgroupHeadingsResponseSchema = z.array(z.tuple([z.string(), z.number().int().positive()]));

export const masterMergeResponseSchema = z.array(
  z.union([
    z.tuple([z.string(), z.string(), z.number().int().positive()]),
    z.object({ action: z.literal('retrieve'), pages: z.array(z.number().int().positive()), reason: z.string() }),
  ]),
);
```

- [ ] **Step 2: Test parses pass on valid samples**

```ts
// test/unit/schemas.test.ts
import { describe, expect, it } from 'vitest';
import * as S from '../../src/schemas.js';

describe('schemas', () => {
  it('detectTocResponse', () => {
    expect(() => S.detectTocResponseSchema.parse({ toc_detected: 'yes' })).not.toThrow();
    expect(() => S.detectTocResponseSchema.parse({ toc_detected: 'maybe' })).toThrow();
  });
  it('flatTocEntry', () => {
    expect(() => S.flatTocEntrySchema.parse({ structure: '1.1', title: 'Intro', page: 5 })).not.toThrow();
  });
  it('subgroupHeadings', () => {
    expect(() => S.subgroupHeadingsResponseSchema.parse([['Intro', 1], ['Bg', 3]])).not.toThrow();
  });
});
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/schemas.ts packages/pipeline/test/unit/schemas.test.ts
git commit -m "feat(pipeline): add step IO zod schemas"
```

---

## Task 8: `prompts/` — all prompt builders

**Files:**
- Create: `packages/pipeline/src/prompts/*.ts` (one file per prompt, ~15 files)

Each prompt is a pure function `(input) => string`. No tests needed (pure string templating verified through step tests).

- [ ] **Step 1: Write `prompts/detect-toc.ts`**

```ts
export const detectTocPrompt = (pageText: string): string => `Your job is to detect if there is a table of contents in the given text.

Given text:
${pageText}

Return JSON:
{ "thinking": "<reasoning>", "toc_detected": "yes" | "no" }

Note: abstract, summary, figure list, table list are NOT table of contents.`;
```

- [ ] **Step 2: Write `prompts/detect-page-numbers.ts`**

```ts
export const detectPageNumbersPrompt = (tocText: string): string => `Your job is to detect if there are page numbers/indices in the table of contents.

Given text:
${tocText}

Return JSON:
{ "thinking": "<reasoning>", "page_index_given_in_toc": "yes" | "no" }`;
```

- [ ] **Step 3: Write `prompts/toc-transform.ts`**

```ts
export const tocTransformPrompt = (tocText: string): string => `Transform the table of contents into JSON format.

"structure" is the hierarchy index (1, 1.1, 1.2, 2, etc.)

Response format:
{
  "table_of_contents": [
    { "structure": "1", "title": "Executive Summary", "page": 1 },
    { "structure": "1.1", "title": "Overview", "page": 3 }
  ]
}

Given table of contents:
${tocText}`;

export const tocTransformContinuePrompt = (priorJson: string): string => `Continue the JSON structure below. Output ONLY the remaining items as a JSON array continuation, no preamble.

Prior output:
${priorJson}`;
```

- [ ] **Step 4: Write `prompts/toc-transform-check.ts`**

```ts
export const tocTransformCheckPrompt = (rawToc: string, jsonOut: string): string => `Does the JSON below contain ALL items from the raw TOC?

Raw TOC:
${rawToc}

JSON output:
${jsonOut}

Return JSON: { "complete": "yes" | "no" }`;
```

- [ ] **Step 5: Write `prompts/physical-mapping.ts`**

```ts
import type { FlatTocEntry } from '../types.js';

export const physicalMappingPrompt = (tocJson: FlatTocEntry[], taggedPages: string): string => `You are given a table of contents in JSON format and several pages of a document.
Add the physical_index to the table of contents.

The provided pages contain tags like <physical_index_X> to indicate page location.

Response format:
[
  { "structure": "1", "title": "Executive Summary", "physical_index": "<physical_index_5>" }
]

TOC:
${JSON.stringify(tocJson)}

Pages:
${taggedPages}`;
```

- [ ] **Step 6: Write `prompts/verify-mapping.ts`**

```ts
import type { FlatTocEntry } from '../types.js';

export const verifyMappingPrompt = (entries: FlatTocEntry[], taggedPages: string): string => `For each TOC entry, verify whether its assigned physical_index page actually contains that section title.

Entries:
${JSON.stringify(entries)}

Pages (tagged):
${taggedPages}

Return JSON:
{ "results": [{ "structure": "<s>", "correct": "yes" | "no" }] }`;
```

- [ ] **Step 7: Write `prompts/fix-mapping.ts`**

```ts
import type { FlatTocEntry } from '../types.js';

export const fixMappingPrompt = (incorrect: FlatTocEntry[], taggedPages: string): string => `The following TOC entries have wrong physical_index. Find the correct page in the tagged pages.

Wrong entries:
${JSON.stringify(incorrect)}

Pages:
${taggedPages}

Return JSON array of corrected entries:
[{ "structure": "<s>", "title": "<t>", "physical_index": "<physical_index_N>" }]`;
```

- [ ] **Step 8: Write `prompts/title-at-start.ts`**

```ts
export const titleAtStartPrompt = (title: string, pageText: string): string => `Does the section titled "${title}" begin at the very START of this page, or does it begin in the middle (after other content)?

Page text:
${pageText}

Return JSON: { "appear_start": "yes" | "no" }`;
```

- [ ] **Step 9: Write `prompts/split-large.ts`**

```ts
export const splitLargePrompt = (taggedPages: string): string => `You are an expert at extracting hierarchical structure.
Identify section headings in the text below. The text contains <physical_index_N> tags marking page boundaries.

Return JSON array:
[
  { "structure": "1",   "title": "Introduction", "physical_index": "<physical_index_1>" },
  { "structure": "1.1", "title": "Background",   "physical_index": "<physical_index_3>" }
]

Only extract real section/chapter headings, not every bold line.

Text:
${taggedPages}`;
```

- [ ] **Step 10: Write `prompts/summarize-node.ts`**

```ts
export const summarizeNodePrompt = (text: string): string => `You are given a part of a document. Generate a 2-3 sentence description of the main points covered.

Document part:
${text}

Directly return the description as plain text (no JSON, no preamble).`;
```

- [ ] **Step 11: Write `prompts/doc-description.ts`**

```ts
import type { TreeNode } from '@buddy/shared';

export const docDescriptionPrompt = (titles: TreeNode[]): string => `Given the section titles of a document, generate a 2-3 sentence description of what the document is about.

Top-level titles:
${titles.map(t => `- ${t.title}`).join('\n')}

Directly return the description as plain text.`;
```

- [ ] **Step 12: Write `prompts/no-toc-headings.ts`**

```ts
export const noTocHeadingsPrompt = (taggedPages: string): string => `You are an expert in extracting hierarchical tree structure.
Generate the tree structure of the document.

The text contains tags like <physical_index_N> to mark page boundaries.

Response format:
[
  { "structure": "1",   "title": "Introduction", "physical_index": "<physical_index_1>" },
  { "structure": "1.1", "title": "Background",   "physical_index": "<physical_index_3>" }
]

Text:
${taggedPages}`;
```

- [ ] **Step 13: Write `prompts/subgroup-headings.ts`**

```ts
export const subgroupHeadingsPrompt = (content: string): string => `Extract all section headings from the text below.

For each heading, output: [title, page_number]

Output format (JSON array of arrays):
[
  ["Introduction", 85],
  ["Background", 87]
]

Only extract clear section/chapter headings, not every bold text.
Output ONLY the JSON array, nothing else.

Text:
${content}`;
```

- [ ] **Step 14: Write `prompts/group-master.ts`**

```ts
export const groupMasterPrompt = (subgroupResults: [string, number][][], retrievedPages?: string): string => `You are merging heading lists from sub-groups into a structured TOC.

Sub-group outputs:
${subgroupResults.map((r, i) => `Sub-group ${i + 1}: ${JSON.stringify(r)}`).join('\n')}

${retrievedPages ? `Retrieved page content:\n${retrievedPages}\n` : ''}
Determine parent-child relationships and assign hierarchy numbers (1, 1.1, 1.1.1, etc.).

If you need specific page content to resolve hierarchy ambiguity, output:
{ "action": "retrieve", "pages": [<page>], "reason": "<reason>" }

Otherwise output the merged structure as a JSON array:
[
  ["1",   "Introduction", 85],
  ["1.1", "Background",   87]
]`;
```

- [ ] **Step 15: Write `prompts/chapter-master.ts`**

```ts
export const chapterMasterPrompt = (groupTocs: [string, string, number][][], chapterPrefix: string): string => `You are merging group TOCs for chapter "${chapterPrefix}".

Group TOCs:
${groupTocs.map((g, i) => `Group ${i + 1}: ${JSON.stringify(g)}`).join('\n')}

Merge in page order, resolve boundary conflicts, and prefix all structure numbers with "${chapterPrefix}.".

Return JSON array:
[
  ["${chapterPrefix}.1",   "Introduction", 85],
  ["${chapterPrefix}.1.1", "Background",   87]
]`;
```

- [ ] **Step 16: Export from `src/index.ts` (barrel — add later); typecheck**

Run: `pnpm --filter @buddy/pipeline typecheck`
Expected: PASS.

- [ ] **Step 17: Commit**

```bash
git add packages/pipeline/src/prompts
git commit -m "feat(pipeline): add all LLM prompts"
```

---

## Task 9: Step 01 — PDF extraction

**Files:**
- Create: `packages/pipeline/src/steps/01-extract.ts`
- Create: `packages/pipeline/test/unit/steps/01-extract.test.ts`
- Create: `packages/pipeline/test/fixtures/make-tiny-pdf.ts`

- [ ] **Step 1: Write fixture helper**

```ts
// test/fixtures/make-tiny-pdf.ts
import { PDFDocument, StandardFonts } from 'pdf-lib';

export async function makeTinyPdf(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([400, 600]);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      page.drawText(line, { x: 40, y: 560 - i * 16, size: 12, font });
    });
  }
  return Buffer.from(await doc.save());
}
```

- [ ] **Step 2: Write failing step test**

```ts
// test/unit/steps/01-extract.test.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractPages } from '../../../src/steps/01-extract.js';
import { makeTinyPdf } from '../../fixtures/make-tiny-pdf.js';

let pdfPath: string;
beforeEach(async () => {
  const buf = await makeTinyPdf(['Hello world', 'Second page text']);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p01-'));
  pdfPath = path.join(dir, 'a.pdf');
  await fs.writeFile(pdfPath, buf);
});
afterEach(async () => { await fs.rm(path.dirname(pdfPath), { recursive: true, force: true }); });

describe('extractPages', () => {
  it('returns one entry per page with text + tokenCount', async () => {
    const pages = await extractPages(pdfPath);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.pageNumber).toBe(1);
    expect(pages[0]?.text).toContain('Hello world');
    expect(pages[0]?.tokenCount).toBeGreaterThan(0);
    expect(pages[1]?.text).toContain('Second page');
  });
});
```

- [ ] **Step 3: Run — fail**

- [ ] **Step 4: Implement**

```ts
// src/steps/01-extract.ts
import fs from 'node:fs/promises';
import { getPageCount, getPageText, openPdf } from '@buddy/shared';
import { countTokens } from '../tokens.js';
import type { RawPage } from '../types.js';

export async function extractPages(pdfPath: string): Promise<RawPage[]> {
  const buf = await fs.readFile(pdfPath);
  const doc = openPdf(buf);
  const n = getPageCount(doc);
  const pages: RawPage[] = [];
  for (let i = 0; i < n; i++) {
    const text = getPageText(doc, i);
    pages.push({ pageNumber: i + 1, text, tokenCount: countTokens(text) });
  }
  return pages;
}
```

- [ ] **Step 5: Pass + commit**

```bash
git add packages/pipeline/src/steps/01-extract.ts packages/pipeline/test packages/pipeline/test/fixtures/make-tiny-pdf.ts
git commit -m "feat(pipeline): step 01 PDF extraction"
```

---

## Task 10: Step 02 — TOC detection

**Files:**
- Create: `packages/pipeline/src/steps/02-detect-toc.ts`
- Create: `packages/pipeline/test/unit/steps/02-detect-toc.test.ts`

- [ ] **Step 1: Failing test**

```ts
// test/unit/steps/02-detect-toc.test.ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { detectTocPages } from '../../../src/steps/02-detect-toc.js';
import { detectTocPrompt } from '../../../src/prompts/detect-toc.js';
import type { RawPage } from '../../../src/types.js';

const page = (n: number, text: string): RawPage => ({ pageNumber: n, text, tokenCount: 100 });

describe('detectTocPages', () => {
  it('returns consecutive yes pages, stops on no', async () => {
    const pages = [page(1, 'cover'), page(2, 'toc1'), page(3, 'toc2'), page(4, 'body')];
    const responses = new Map([
      [hashPrompt([detectTocPrompt('cover')]), { text: '{"toc_detected":"no"}' }],
      [hashPrompt([detectTocPrompt('toc1')]), { text: '{"toc_detected":"yes"}' }],
      [hashPrompt([detectTocPrompt('toc2')]), { text: '{"toc_detected":"yes"}' }],
      [hashPrompt([detectTocPrompt('body')]), { text: '{"toc_detected":"no"}' }],
    ]);
    const gemini = createStubGemini({ responses });
    const result = await detectTocPages(pages, { gemini, maxScan: 20 });
    expect(result).toEqual([2, 3]);
  });

  it('returns [] when no TOC found in first maxScan pages', async () => {
    const pages = [page(1, 'a'), page(2, 'b')];
    const responses = new Map([
      [hashPrompt([detectTocPrompt('a')]), { text: '{"toc_detected":"no"}' }],
      [hashPrompt([detectTocPrompt('b')]), { text: '{"toc_detected":"no"}' }],
    ]);
    const gemini = createStubGemini({ responses });
    expect(await detectTocPages(pages, { gemini, maxScan: 20 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/02-detect-toc.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { detectTocPrompt } from '../prompts/detect-toc.js';
import { detectTocResponseSchema } from '../schemas.js';
import type { RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; maxScan: number; }

export async function detectTocPages(pages: RawPage[], opts: Opts): Promise<number[]> {
  const result: number[] = [];
  let lastYes = true;
  for (let i = 0; i < pages.length; i++) {
    if (i >= opts.maxScan && !lastYes) break;
    const text = pages[i]?.text ?? '';
    const r = await opts.gemini.generate([detectTocPrompt(text)]);
    const parsed = detectTocResponseSchema.parse(extractJson(r.text));
    if (parsed.toc_detected === 'yes') {
      result.push(pages[i]!.pageNumber);
      lastYes = true;
    } else {
      lastYes = false;
    }
  }
  return result;
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/02-detect-toc.ts packages/pipeline/test/unit/steps/02-detect-toc.test.ts
git commit -m "feat(pipeline): step 02 TOC detection"
```

---

## Task 11: Step 03 — TOC content extraction

**Files:**
- Create: `packages/pipeline/src/steps/03-toc-content.ts`
- Create: `packages/pipeline/test/unit/steps/03-toc-content.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { extractTocContent } from '../../../src/steps/03-toc-content.js';
import type { RawPage } from '../../../src/types.js';

const p = (n: number, text: string): RawPage => ({ pageNumber: n, text, tokenCount: 0 });

describe('extractTocContent', () => {
  it('concatenates pages by 1-based number', () => {
    const out = extractTocContent([p(1, 'A'), p(2, 'B'), p(3, 'C')], [2, 3]);
    expect(out).toBe('BC');
  });
  it('replaces .... with :', () => {
    const out = extractTocContent([p(1, 'Intro ........ 5')], [1]);
    expect(out).toBe('Intro : 5');
  });
  it('replaces ". . . . " with :', () => {
    const out = extractTocContent([p(1, 'Intro . . . . . 5')], [1]);
    expect(out).toContain(': 5');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/03-toc-content.ts
import type { RawPage } from '../types.js';

export function extractTocContent(pages: RawPage[], tocPageNumbers: number[]): string {
  const byNum = new Map(pages.map(p => [p.pageNumber, p]));
  let text = '';
  for (const n of tocPageNumbers) text += byNum.get(n)?.text ?? '';
  text = text.replace(/\.{5,}/g, ': ');
  text = text.replace(/(?:\. ){5,}\.?/g, ': ');
  return text;
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/03-toc-content.ts packages/pipeline/test/unit/steps/03-toc-content.test.ts
git commit -m "feat(pipeline): step 03 TOC content extraction"
```

---

## Task 12: Step 04 — page-number detection

**Files:**
- Create: `packages/pipeline/src/steps/04-detect-page-numbers.ts`
- Create: `packages/pipeline/test/unit/steps/04-detect-page-numbers.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { detectPageNumbers } from '../../../src/steps/04-detect-page-numbers.js';
import { detectPageNumbersPrompt } from '../../../src/prompts/detect-page-numbers.js';

describe('detectPageNumbers', () => {
  it('returns true on yes', async () => {
    const toc = '1. Intro: 1\n2. Body: 5';
    const responses = new Map([
      [hashPrompt([detectPageNumbersPrompt(toc)]), { text: '{"page_index_given_in_toc":"yes"}' }],
    ]);
    expect(await detectPageNumbers(toc, { gemini: createStubGemini({ responses }) })).toBe(true);
  });
  it('returns false on no', async () => {
    const toc = '1. Intro\n2. Body';
    const responses = new Map([
      [hashPrompt([detectPageNumbersPrompt(toc)]), { text: '{"page_index_given_in_toc":"no"}' }],
    ]);
    expect(await detectPageNumbers(toc, { gemini: createStubGemini({ responses }) })).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/04-detect-page-numbers.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { detectPageNumbersPrompt } from '../prompts/detect-page-numbers.js';
import { detectPageNumbersResponseSchema } from '../schemas.js';

interface Opts { gemini: GeminiClient; }

export async function detectPageNumbers(tocText: string, opts: Opts): Promise<boolean> {
  const r = await opts.gemini.generate([detectPageNumbersPrompt(tocText)]);
  return detectPageNumbersResponseSchema.parse(extractJson(r.text)).page_index_given_in_toc === 'yes';
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/04-detect-page-numbers.ts packages/pipeline/test/unit/steps/04-detect-page-numbers.test.ts
git commit -m "feat(pipeline): step 04 page-number detection"
```

---

## Task 13: Step 05 — TOC transform (text → JSON)

**Files:**
- Create: `packages/pipeline/src/steps/05-toc-transform.ts`
- Create: `packages/pipeline/test/unit/steps/05-toc-transform.test.ts`

- [ ] **Step 1: Failing test (happy path; continuation path noted as edge case)**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { transformToc } from '../../../src/steps/05-toc-transform.js';
import { tocTransformPrompt } from '../../../src/prompts/toc-transform.js';

describe('transformToc', () => {
  it('parses flat TOC entries from LLM JSON', async () => {
    const toc = '1. Intro: 1\n2. Body: 5';
    const responses = new Map([
      [hashPrompt([tocTransformPrompt(toc)]), {
        text: '{"table_of_contents":[{"structure":"1","title":"Intro","page":1},{"structure":"2","title":"Body","page":5}]}',
      }],
    ]);
    const out = await transformToc(toc, { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([
      { structure: '1', title: 'Intro', page: 1 },
      { structure: '2', title: 'Body', page: 5 },
    ]);
  });
});
```

- [ ] **Step 2: Implement (v1 — no continuation handling; add later if real fixtures exceed limit)**

```ts
// src/steps/05-toc-transform.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tocTransformPrompt } from '../prompts/toc-transform.js';
import { tocTransformResponseSchema } from '../schemas.js';
import type { FlatTocEntry } from '../types.js';

interface Opts { gemini: GeminiClient; }

export async function transformToc(tocText: string, opts: Opts): Promise<FlatTocEntry[]> {
  const r = await opts.gemini.generate([tocTransformPrompt(tocText)], { maxOutputTokens: 8192 });
  const parsed = tocTransformResponseSchema.parse(extractJson(r.text));
  return parsed.table_of_contents.map(e => ({ structure: e.structure, title: e.title, page: e.page }));
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/05-toc-transform.ts packages/pipeline/test/unit/steps/05-toc-transform.test.ts
git commit -m "feat(pipeline): step 05 TOC text→JSON"
```

---

## Task 14: Page-tagging helper

**Files:**
- Create: `packages/pipeline/src/page-tag.ts`
- Create: `packages/pipeline/test/unit/page-tag.test.ts`

Reason: Multiple steps (06, 06.6, 08, no-TOC) emit `<physical_index_N>page text</physical_index_N>` block format and parse it back. Centralize.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parsePhysicalIndexTag, tagPages } from '../../src/page-tag.js';
import type { RawPage } from '../../src/types.js';

describe('page-tag', () => {
  it('tags pages by 1-based pageNumber', () => {
    const out = tagPages([{ pageNumber: 5, text: 'hello', tokenCount: 0 }, { pageNumber: 6, text: 'world', tokenCount: 0 }] as RawPage[]);
    expect(out).toBe('<physical_index_5>\nhello\n</physical_index_5>\n<physical_index_6>\nworld\n</physical_index_6>');
  });
  it('parses tag to int', () => {
    expect(parsePhysicalIndexTag('<physical_index_42>')).toBe(42);
    expect(parsePhysicalIndexTag('physical_index_42')).toBe(42);
  });
  it('throws on unparseable', () => {
    expect(() => parsePhysicalIndexTag('garbage')).toThrow();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/page-tag.ts
import type { RawPage } from './types.js';

export function tagPages(pages: RawPage[]): string {
  return pages.map(p => `<physical_index_${p.pageNumber}>\n${p.text}\n</physical_index_${p.pageNumber}>`).join('\n');
}

export function parsePhysicalIndexTag(s: string): number {
  const m = s.match(/physical_index_(\d+)/);
  if (!m?.[1]) throw new Error(`unparseable physical_index tag: ${s}`);
  return Number.parseInt(m[1], 10);
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/page-tag.ts packages/pipeline/test/unit/page-tag.test.ts
git commit -m "feat(pipeline): add page-tag helpers"
```

---

## Task 15: Step 06 — physical page mapping

**Files:**
- Create: `packages/pipeline/src/steps/06-physical-mapping.ts`
- Create: `packages/pipeline/test/unit/steps/06-physical-mapping.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { mapPhysical } from '../../../src/steps/06-physical-mapping.js';
import { physicalMappingPrompt } from '../../../src/prompts/physical-mapping.js';
import { tagPages } from '../../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../../src/types.js';

describe('mapPhysical', () => {
  it('applies most-common offset to all entries', async () => {
    const toc: FlatTocEntry[] = [
      { structure: '1', title: 'Intro', page: 1 },
      { structure: '2', title: 'Body', page: 5 },
      { structure: '3', title: 'End', page: 10 },
    ];
    const pages: RawPage[] = [3, 4, 5, 6, 7].map(n => ({ pageNumber: n, text: '', tokenCount: 0 }));
    const tagged = tagPages(pages);
    const mockResponse = JSON.stringify([
      { structure: '1', title: 'Intro', physical_index: '<physical_index_5>' },
      { structure: '2', title: 'Body', physical_index: '<physical_index_9>' },
      // structure 3 not found by LLM
    ]);
    const responses = new Map([
      [hashPrompt([physicalMappingPrompt(toc, tagged)]), { text: mockResponse }],
    ]);
    const out = await mapPhysical(toc, pages, { gemini: createStubGemini({ responses }), searchAfterToc: 0 });
    expect(out[0]?.physical_index).toBe(5);  // page 1 + offset 4
    expect(out[1]?.physical_index).toBe(9);  // page 5 + offset 4
    expect(out[2]?.physical_index).toBe(14); // page 10 + offset 4
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/06-physical-mapping.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { physicalMappingPrompt } from '../prompts/physical-mapping.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; searchAfterToc?: number; }

function mostCommon(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = nums[0]!, max = 0;
  for (const [k, v] of counts) if (v > max) { max = v; best = k; }
  return best;
}

export async function mapPhysical(toc: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  const tagged = tagPages(pages);
  const r = await opts.gemini.generate([physicalMappingPrompt(toc, tagged)], { maxOutputTokens: 8192 });
  const found = physicalMappingResponseSchema.parse(extractJson(r.text));
  const byStructure = new Map(found.map(f => [f.structure, parsePhysicalIndexTag(f.physical_index)]));

  const diffs: number[] = [];
  for (const entry of toc) {
    const phys = byStructure.get(entry.structure);
    if (phys !== undefined && entry.page !== undefined) diffs.push(phys - entry.page);
  }
  const offset = mostCommon(diffs);
  if (offset === null) return toc.map(e => ({ ...e }));
  return toc.map(e => ({ ...e, physical_index: e.page !== undefined ? e.page + offset : undefined }));
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/06-physical-mapping.ts packages/pipeline/test/unit/steps/06-physical-mapping.test.ts
git commit -m "feat(pipeline): step 06 physical page mapping"
```

---

## Task 16: Steps 06.5 — validate indices

**Files:**
- Create: `packages/pipeline/src/steps/06_5-validate-indices.ts`
- Create: `packages/pipeline/test/unit/steps/06_5.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { validateIndices } from '../../../src/steps/06_5-validate-indices.js';

describe('validateIndices', () => {
  it('clears physical_index that exceeds page count', () => {
    const out = validateIndices(
      [{ structure: '1', title: 'A', physical_index: 5 }, { structure: '2', title: 'B', physical_index: 99 }],
      10,
    );
    expect(out[0]?.physical_index).toBe(5);
    expect(out[1]?.physical_index).toBeUndefined();
  });
  it('clears physical_index < 1', () => {
    const out = validateIndices([{ structure: '1', title: 'A', physical_index: 0 }], 10);
    expect(out[0]?.physical_index).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/06_5-validate-indices.ts
import type { FlatTocEntry } from '../types.js';

export function validateIndices(toc: FlatTocEntry[], pageCount: number): FlatTocEntry[] {
  return toc.map(e => {
    if (e.physical_index === undefined) return { ...e };
    if (e.physical_index < 1 || e.physical_index > pageCount) {
      const { physical_index: _drop, ...rest } = e;
      return rest;
    }
    return { ...e };
  });
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/06_5-validate-indices.ts packages/pipeline/test/unit/steps/06_5.test.ts
git commit -m "feat(pipeline): step 06.5 validate physical indices"
```

---

## Task 17: Step 06.6 — verify & fix

**Files:**
- Create: `packages/pipeline/src/steps/06_6-verify-fix.ts`
- Create: `packages/pipeline/test/unit/steps/06_6.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { verifyAndFix } from '../../../src/steps/06_6-verify-fix.js';
import { verifyMappingPrompt } from '../../../src/prompts/verify-mapping.js';
import { tagPages } from '../../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../../src/types.js';

const pages: RawPage[] = [1, 2, 3].map(n => ({ pageNumber: n, text: '', tokenCount: 0 }));

describe('verifyAndFix', () => {
  it('reports accuracy 1.0 when all correct', async () => {
    const entries: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 1 },
      { structure: '2', title: 'B', physical_index: 2 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([verifyMappingPrompt(entries, tagged)]), {
        text: '{"results":[{"structure":"1","correct":"yes"},{"structure":"2","correct":"yes"}]}',
      }],
    ]);
    const out = await verifyAndFix(entries, pages, { gemini: createStubGemini({ responses }), maxFixRetries: 3 });
    expect(out.accuracy).toBe(1);
    expect(out.entries).toEqual(entries);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/06_6-verify-fix.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { verifyMappingPrompt } from '../prompts/verify-mapping.js';
import { fixMappingPrompt } from '../prompts/fix-mapping.js';
import { verifyMappingResponseSchema, physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; maxFixRetries: number; }

export interface VerifyResult { accuracy: number; entries: FlatTocEntry[]; }

async function verifyOnce(entries: FlatTocEntry[], pages: RawPage[], gemini: GeminiClient) {
  const tagged = tagPages(pages);
  const r = await gemini.generate([verifyMappingPrompt(entries, tagged)], { maxOutputTokens: 4096 });
  const parsed = verifyMappingResponseSchema.parse(extractJson(r.text));
  const correctStructs = new Set(parsed.results.filter(x => x.correct === 'yes').map(x => x.structure));
  return { correctStructs, total: parsed.results.length };
}

export async function verifyAndFix(entries: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<VerifyResult> {
  let current = entries.filter(e => e.physical_index !== undefined);
  if (current.length === 0) return { accuracy: 0, entries };
  const { correctStructs, total } = await verifyOnce(current, pages, opts.gemini);
  const accuracy = total === 0 ? 0 : correctStructs.size / total;

  let working = entries.map(e => ({ ...e }));
  let pendingWrong = working.filter(e => e.physical_index !== undefined && !correctStructs.has(e.structure));
  for (let attempt = 0; attempt < opts.maxFixRetries && pendingWrong.length > 0; attempt++) {
    const tagged = tagPages(pages);
    const r = await opts.gemini.generate([fixMappingPrompt(pendingWrong, tagged)], { maxOutputTokens: 4096 });
    const fixed = physicalMappingResponseSchema.parse(extractJson(r.text));
    const byStruct = new Map(fixed.map(f => [f.structure, parsePhysicalIndexTag(f.physical_index)]));
    working = working.map(e => byStruct.has(e.structure) ? { ...e, physical_index: byStruct.get(e.structure) } : e);
    const v = await verifyOnce(working.filter(e => e.physical_index !== undefined), pages, opts.gemini);
    pendingWrong = working.filter(e => e.physical_index !== undefined && !v.correctStructs.has(e.structure));
  }

  return { accuracy, entries: working };
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/06_6-verify-fix.ts packages/pipeline/test/unit/steps/06_6.test.ts
git commit -m "feat(pipeline): step 06.6 verify & fix mapping"
```

---

## Task 18: Step 06.7 — add preface

**Files:**
- Create: `packages/pipeline/src/steps/06_7-add-preface.ts`
- Create: `packages/pipeline/test/unit/steps/06_7.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { addPreface } from '../../../src/steps/06_7-add-preface.js';

describe('addPreface', () => {
  it('prepends Preface when first entry physical_index > 1', () => {
    const out = addPreface([{ structure: '1', title: 'Intro', physical_index: 5 }]);
    expect(out[0]).toEqual({ structure: '0', title: 'Preface', physical_index: 1 });
    expect(out[1]?.structure).toBe('1');
  });
  it('no-op when first physical_index is 1', () => {
    const inp = [{ structure: '1', title: 'Intro', physical_index: 1 }];
    expect(addPreface(inp)).toEqual(inp);
  });
  it('no-op when first physical_index undefined', () => {
    const inp = [{ structure: '1', title: 'Intro' }];
    expect(addPreface(inp)).toEqual(inp);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/06_7-add-preface.ts
import type { FlatTocEntry } from '../types.js';

export function addPreface(toc: FlatTocEntry[]): FlatTocEntry[] {
  const first = toc[0];
  if (!first || first.physical_index === undefined || first.physical_index <= 1) return toc;
  return [{ structure: '0', title: 'Preface', physical_index: 1 }, ...toc];
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/06_7-add-preface.ts packages/pipeline/test/unit/steps/06_7.test.ts
git commit -m "feat(pipeline): step 06.7 add preface"
```

---

## Task 19: Step 06.8 — title-at-start

**Files:**
- Create: `packages/pipeline/src/steps/06_8-title-at-start.ts`
- Create: `packages/pipeline/test/unit/steps/06_8.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { checkTitleAtStart } from '../../../src/steps/06_8-title-at-start.js';
import { titleAtStartPrompt } from '../../../src/prompts/title-at-start.js';
import type { RawPage } from '../../../src/types.js';

describe('checkTitleAtStart', () => {
  it('annotates each entry with appear_start in parallel', async () => {
    const pages: RawPage[] = [{ pageNumber: 1, text: 'page1text', tokenCount: 0 }];
    const responses = new Map([
      [hashPrompt([titleAtStartPrompt('Intro', 'page1text')]), { text: '{"appear_start":"yes"}' }],
    ]);
    const gemini = createStubGemini({ responses });
    const pool = async <T,>(fn: () => Promise<T>) => fn();
    const out = await checkTitleAtStart(
      [{ structure: '1', title: 'Intro', physical_index: 1 }],
      pages,
      { gemini, pool },
    );
    expect(out[0]?.appear_start).toBe('yes');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/06_8-title-at-start.ts
import type { GeminiClient, LlmPool } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { titleAtStartPrompt } from '../prompts/title-at-start.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; pool: LlmPool; }

export async function checkTitleAtStart(toc: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  const byNum = new Map(pages.map(p => [p.pageNumber, p]));
  return Promise.all(toc.map(entry => opts.pool(async () => {
    if (entry.physical_index === undefined) return { ...entry };
    const page = byNum.get(entry.physical_index);
    if (!page) return { ...entry };
    const r = await opts.gemini.generate([titleAtStartPrompt(entry.title, page.text)]);
    const parsed = extractJson<{ appear_start: 'yes' | 'no' }>(r.text);
    return { ...entry, appear_start: parsed.appear_start };
  })));
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/06_8-title-at-start.ts packages/pipeline/test/unit/steps/06_8.test.ts
git commit -m "feat(pipeline): step 06.8 title-at-start check"
```

---

## Task 20: Step 07 — build hierarchical tree

**Files:**
- Create: `packages/pipeline/src/steps/07-build-tree.ts`
- Create: `packages/pipeline/test/unit/steps/07-build-tree.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildTree } from '../../../src/steps/07-build-tree.js';
import type { FlatTocEntry } from '../../../src/types.js';

describe('buildTree', () => {
  it('builds parent-child + end_index from siblings', () => {
    const toc: FlatTocEntry[] = [
      { structure: '1',   title: 'Exec', physical_index: 5, appear_start: 'yes' },
      { structure: '1.1', title: 'Fin',  physical_index: 7, appear_start: 'yes' },
      { structure: '1.2', title: 'Risk', physical_index: 10, appear_start: 'yes' },
      { structure: '2',   title: 'Anal', physical_index: 15, appear_start: 'yes' },
      { structure: '3',   title: 'Conc', physical_index: 40, appear_start: 'yes' },
    ];
    const tree = buildTree(toc, 50);
    expect(tree).toHaveLength(3);
    expect(tree[0]?.title).toBe('Exec');
    expect(tree[0]?.start_index).toBe(5);
    expect(tree[0]?.end_index).toBe(14);
    expect(tree[0]?.nodes).toHaveLength(2);
    expect(tree[0]?.nodes[0]?.title).toBe('Fin');
    expect(tree[0]?.nodes[0]?.end_index).toBe(9);
    expect(tree[0]?.nodes[1]?.end_index).toBe(14);
    expect(tree[2]?.end_index).toBe(50);
  });

  it('respects appear_start=no (next section starts mid-page → prev ends on same page)', () => {
    const toc: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 1, appear_start: 'yes' },
      { structure: '2', title: 'B', physical_index: 5, appear_start: 'no' },
    ];
    const tree = buildTree(toc, 10);
    expect(tree[0]?.end_index).toBe(5);  // shares page 5
  });

  it('skips entries missing physical_index', () => {
    const tree = buildTree(
      [{ structure: '1', title: 'A', physical_index: 1 }, { structure: '2', title: 'B' }],
      5,
    );
    expect(tree).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/07-build-tree.ts
import { nodeId } from '@buddy/shared';
import type { TreeNode } from '@buddy/shared';
import type { FlatTocEntry } from '../types.js';

interface WorkingNode extends TreeNode { _structure: string; _appearStart: 'yes' | 'no'; }

function parentStructure(s: string): string | null {
  const parts = s.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : null;
}

export function buildTree(toc: FlatTocEntry[], totalPages: number): TreeNode[] {
  const valid = toc.filter(e => e.physical_index !== undefined);
  const ordered = [...valid].sort((a, b) => a.physical_index! - b.physical_index!);

  // assign end_index via next-sibling-or-parent's-next rule
  // We treat all entries as a flat ordered list first to compute raw end_index, then nest.
  const flat: WorkingNode[] = ordered.map(e => ({
    title: e.title,
    start_index: e.physical_index!,
    end_index: 0, // filled below
    node_id: nodeId(),
    nodes: [],
    images: [],
    tables: [],
    _structure: e.structure,
    _appearStart: e.appear_start ?? 'yes',
  }));

  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i]!;
    const next = flat[i + 1];
    if (!next) cur.end_index = totalPages;
    else cur.end_index = next._appearStart === 'no' ? next.start_index : next.start_index - 1;
    if (cur.end_index < cur.start_index) cur.end_index = cur.start_index;
  }

  // nest by structure
  const byStruct = new Map<string, WorkingNode>();
  for (const n of flat) byStruct.set(n._structure, n);
  const roots: WorkingNode[] = [];
  for (const n of flat) {
    const ps = parentStructure(n._structure);
    const parent = ps !== null ? byStruct.get(ps) : null;
    if (parent && parent !== n) parent.nodes.push(stripWorking(n));
    else roots.push(n);
  }
  return roots.map(stripWorking);
}

function stripWorking(n: WorkingNode): TreeNode {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _structure: _s, _appearStart: _a, ...rest } = n;
  return rest;
}
```

- [ ] **Step 3: Pass + commit**

Note: The nested-`stripWorking` will double-wrap if called recursively; fix: only strip once during emit. Adjust if test fails — the `parent.nodes.push(stripWorking(n))` mutates `parent` (still a WorkingNode), so `parent.nodes` ends up with `TreeNode` entries. Final root strip then walks roots. Since `roots` is `WorkingNode[]` and `stripWorking` returns shallow `TreeNode`, children inside already are `TreeNode`. Add a final recursive sanity pass if needed — but the current shape should work because we set `n.nodes = []` initially, then push stripped children into the working parent's `nodes` array (typed as TreeNode[] via the cast). If TS complains, change `WorkingNode.nodes` to `TreeNode[]`. Run typecheck; fix as needed.

```bash
git add packages/pipeline/src/steps/07-build-tree.ts packages/pipeline/test/unit/steps/07-build-tree.test.ts
git commit -m "feat(pipeline): step 07 build hierarchical tree"
```

---

## Task 21: Hierarchical agents — chunk + sub-group

**Files:**
- Create: `packages/pipeline/src/hierarchical/chunk.ts`
- Create: `packages/pipeline/src/hierarchical/subgroup-agent.ts`
- Create: `packages/pipeline/test/unit/hierarchical/chunk.test.ts`
- Create: `packages/pipeline/test/unit/hierarchical/subgroup.test.ts`

- [ ] **Step 1: Test for `chunkPages`**

```ts
// test/unit/hierarchical/chunk.test.ts
import { describe, expect, it } from 'vitest';
import { chunkPages } from '../../../src/hierarchical/chunk.js';
import type { RawPage } from '../../../src/types.js';

const p = (n: number, tokens: number): RawPage => ({ pageNumber: n, text: `p${n}`, tokenCount: tokens });

describe('chunkPages', () => {
  it('packs pages until tokenBudget hit', () => {
    const chunks = chunkPages([p(1, 3000), p(2, 3000), p(3, 3000), p(4, 3000)], 7000);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.pages[0]?.pageNumber).toBe(1);
  });
  it('1-page overlap between chunks', () => {
    const chunks = chunkPages([p(1, 6000), p(2, 6000), p(3, 6000)], 7000);
    const c0Last = chunks[0]?.pages.at(-1)?.pageNumber;
    const c1First = chunks[1]?.pages[0]?.pageNumber;
    expect(c1First).toBe(c0Last);
  });
});
```

- [ ] **Step 2: Implement `chunk.ts`**

```ts
// src/hierarchical/chunk.ts
import type { RawPage } from '../types.js';

export interface Chunk { pages: RawPage[]; }

export function chunkPages(pages: RawPage[], tokenBudget: number): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < pages.length) {
    let tokens = 0;
    const buf: RawPage[] = [];
    let j = i;
    while (j < pages.length && (tokens === 0 || tokens + (pages[j]?.tokenCount ?? 0) <= tokenBudget)) {
      buf.push(pages[j]!);
      tokens += pages[j]?.tokenCount ?? 0;
      j++;
    }
    chunks.push({ pages: buf });
    if (j >= pages.length) break;
    i = j - 1; // 1-page overlap
  }
  return chunks;
}
```

- [ ] **Step 3: Test for subgroup agent**

```ts
// test/unit/hierarchical/subgroup.test.ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { subgroupAgent } from '../../../src/hierarchical/subgroup-agent.js';
import { subgroupHeadingsPrompt } from '../../../src/prompts/subgroup-headings.js';
import { tagPages } from '../../../src/page-tag.js';
import type { RawPage } from '../../../src/types.js';

describe('subgroupAgent', () => {
  it('returns [title, page] tuples', async () => {
    const pages: RawPage[] = [{ pageNumber: 5, text: 'x', tokenCount: 0 }];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([subgroupHeadingsPrompt(tagged)]), { text: '[["Intro", 5], ["Bg", 7]]' }],
    ]);
    const out = await subgroupAgent({ pages }, { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['Intro', 5], ['Bg', 7]]);
  });

  it('returns [] on error', async () => {
    const pages: RawPage[] = [{ pageNumber: 1, text: 'x', tokenCount: 0 }];
    const gemini = createStubGemini({ responses: new Map() }); // unmatched → throws
    const out = await subgroupAgent({ pages }, { gemini });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 4: Implement subgroup**

```ts
// src/hierarchical/subgroup-agent.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages } from '../page-tag.js';
import { subgroupHeadingsPrompt } from '../prompts/subgroup-headings.js';
import { subgroupHeadingsResponseSchema } from '../schemas.js';
import type { Chunk } from './chunk.js';

export type Heading = [string, number];

interface Opts { gemini: GeminiClient; }

export async function subgroupAgent(chunk: Chunk, opts: Opts): Promise<Heading[]> {
  try {
    const tagged = tagPages(chunk.pages);
    const r = await opts.gemini.generate([subgroupHeadingsPrompt(tagged)], { maxOutputTokens: 2048 });
    return subgroupHeadingsResponseSchema.parse(extractJson(r.text));
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Pass + commit**

```bash
git add packages/pipeline/src/hierarchical packages/pipeline/test/unit/hierarchical
git commit -m "feat(pipeline): hierarchical chunk + subgroup agent"
```

---

## Task 22: Hierarchical agents — group master + chapter master + orchestrator

**Files:**
- Create: `packages/pipeline/src/hierarchical/group-master.ts`
- Create: `packages/pipeline/src/hierarchical/chapter-master.ts`
- Create: `packages/pipeline/src/hierarchical/orchestrator.ts`
- Create: tests in `test/unit/hierarchical/`

- [ ] **Step 1: Group master test**

```ts
// test/unit/hierarchical/group-master.test.ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { groupMaster } from '../../../src/hierarchical/group-master.js';
import { groupMasterPrompt } from '../../../src/prompts/group-master.js';
import type { Heading } from '../../../src/hierarchical/subgroup-agent.js';

describe('groupMaster', () => {
  it('returns structured tuples on direct merge', async () => {
    const sub: Heading[][] = [[['Intro', 5]], [['Bg', 7]]];
    const responses = new Map([
      [hashPrompt([groupMasterPrompt(sub, undefined)]), { text: '[["1","Intro",5],["1.1","Bg",7]]' }],
    ]);
    const out = await groupMaster(sub, [], { gemini: createStubGemini({ responses }), maxRetrievals: 3 });
    expect(out).toEqual([['1', 'Intro', 5], ['1.1', 'Bg', 7]]);
  });
});
```

- [ ] **Step 2: Implement group master (retrieval loop)**

```ts
// src/hierarchical/group-master.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { groupMasterPrompt } from '../prompts/group-master.js';
import { masterMergeResponseSchema } from '../schemas.js';
import { tagPages } from '../page-tag.js';
import type { Heading } from './subgroup-agent.js';
import type { RawPage } from '../types.js';

export type StructuredHeading = [string, string, number];

interface Opts { gemini: GeminiClient; maxRetrievals: number; }

export async function groupMaster(
  subgroupResults: Heading[][],
  pages: RawPage[],
  opts: Opts,
): Promise<StructuredHeading[]> {
  let retrieved: string | undefined;
  const byNum = new Map(pages.map(p => [p.pageNumber, p]));
  for (let attempt = 0; attempt <= opts.maxRetrievals; attempt++) {
    const r = await opts.gemini.generate(
      [groupMasterPrompt(subgroupResults, retrieved)],
      { maxOutputTokens: 4096 },
    );
    const parsed = masterMergeResponseSchema.parse(extractJson(r.text));
    // retrieve action?
    const action = parsed.find(p => !Array.isArray(p)) as { action: 'retrieve'; pages: number[] } | undefined;
    if (action && attempt < opts.maxRetrievals) {
      const slice = action.pages.map(n => byNum.get(n)).filter((p): p is RawPage => !!p);
      retrieved = (retrieved ? retrieved + '\n' : '') + tagPages(slice);
      continue;
    }
    return parsed.filter((p): p is StructuredHeading => Array.isArray(p));
  }
  return [];
}
```

- [ ] **Step 3: Chapter master test + implement**

```ts
// test/unit/hierarchical/chapter-master.test.ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { chapterMaster } from '../../../src/hierarchical/chapter-master.js';
import { chapterMasterPrompt } from '../../../src/prompts/chapter-master.js';

describe('chapterMaster', () => {
  it('merges with prefix', async () => {
    const groups: [string, string, number][][] = [[['1', 'A', 5]], [['1', 'B', 10]]];
    const responses = new Map([
      [hashPrompt([chapterMasterPrompt(groups, '3')]), { text: '[["3.1","A",5],["3.2","B",10]]' }],
    ]);
    const out = await chapterMaster(groups, '3', { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['3.1', 'A', 5], ['3.2', 'B', 10]]);
  });
});
```

```ts
// src/hierarchical/chapter-master.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { chapterMasterPrompt } from '../prompts/chapter-master.js';
import { masterMergeResponseSchema } from '../schemas.js';
import type { StructuredHeading } from './group-master.js';

interface Opts { gemini: GeminiClient; }

export async function chapterMaster(
  groupTocs: StructuredHeading[][],
  chapterPrefix: string,
  opts: Opts,
): Promise<StructuredHeading[]> {
  const r = await opts.gemini.generate([chapterMasterPrompt(groupTocs, chapterPrefix)], { maxOutputTokens: 8192 });
  const parsed = masterMergeResponseSchema.parse(extractJson(r.text));
  return parsed.filter((p): p is StructuredHeading => Array.isArray(p));
}
```

- [ ] **Step 4: Orchestrator**

```ts
// src/hierarchical/orchestrator.ts
import type { GeminiClient, LlmPool } from '@buddy/shared';
import { chunkPages } from './chunk.js';
import { subgroupAgent, type Heading } from './subgroup-agent.js';
import { groupMaster, type StructuredHeading } from './group-master.js';
import { chapterMaster } from './chapter-master.js';
import type { RawPage } from '../types.js';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
  groupSize?: number;          // sub-groups per group master (default 3)
}

export async function hierarchicalExtract(
  pages: RawPage[],
  chapterPrefix: string,
  opts: Opts,
): Promise<StructuredHeading[]> {
  const chunks = chunkPages(pages, opts.subgroupTokenSize);
  const headings = await Promise.all(chunks.map(c => opts.pool(() => subgroupAgent(c, { gemini: opts.gemini }))));
  const groupSize = opts.groupSize ?? 3;
  const groups: { headings: Heading[][]; pages: RawPage[] }[] = [];
  for (let i = 0; i < headings.length; i += groupSize) {
    const slice = headings.slice(i, i + groupSize);
    const groupPages = chunks.slice(i, i + groupSize).flatMap(c => c.pages);
    groups.push({ headings: slice, pages: groupPages });
  }
  const groupTocs = await Promise.all(
    groups.map(g => opts.pool(() => groupMaster(g.headings, g.pages, {
      gemini: opts.gemini, maxRetrievals: opts.maxRetrievalsPerMaster,
    }))),
  );
  return chapterMaster(groupTocs, chapterPrefix, { gemini: opts.gemini });
}
```

- [ ] **Step 5: Pass + commit**

```bash
git add packages/pipeline/src/hierarchical/{group-master,chapter-master,orchestrator}.ts packages/pipeline/test/unit/hierarchical
git commit -m "feat(pipeline): hierarchical group + chapter masters + orchestrator"
```

---

## Task 23: Step 08 — split large nodes (recursive, uses hierarchical agents)

**Files:**
- Create: `packages/pipeline/src/steps/08-split-large.ts`
- Create: `packages/pipeline/test/unit/steps/08-split-large.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { splitLargeNodes } from '../../../src/steps/08-split-large.js';
import { splitLargePrompt } from '../../../src/prompts/split-large.js';
import { tagPages } from '../../../src/page-tag.js';
import type { RawPage } from '../../../src/types.js';
import type { TreeNode } from '@buddy/shared';

const page = (n: number, tokens = 100): RawPage => ({ pageNumber: n, text: `p${n}`, tokenCount: tokens });

describe('splitLargeNodes', () => {
  it('passes through when no node oversized', async () => {
    const tree: TreeNode[] = [{ title: 'A', start_index: 1, end_index: 5, node_id: 'n1', nodes: [], images: [], tables: [] }];
    const pages = [page(1), page(2), page(3), page(4), page(5)];
    const out = await splitLargeNodes(tree, pages, {
      gemini: createStubGemini({ responses: new Map() }),
      pool: async <T,>(fn: () => Promise<T>) => fn(),
      maxPages: 10, maxTokens: 1000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.nodes).toHaveLength(0);
  });

  it('splits oversized node using non-hierarchical LLM call', async () => {
    const tree: TreeNode[] = [{ title: 'Big', start_index: 1, end_index: 5, node_id: 'n1', nodes: [], images: [], tables: [] }];
    const pages = [page(1, 5000), page(2, 5000), page(3, 5000), page(4, 5000), page(5, 5000)];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([splitLargePrompt(tagged)]), {
        text: '[{"structure":"1","title":"Sub1","physical_index":"<physical_index_1>"},{"structure":"2","title":"Sub2","physical_index":"<physical_index_3>"}]',
      }],
    ]);
    const out = await splitLargeNodes(tree, pages, {
      gemini: createStubGemini({ responses }),
      pool: async <T,>(fn: () => Promise<T>) => fn(),
      maxPages: 3, maxTokens: 10000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out[0]?.nodes.length).toBe(2);
    expect(out[0]?.nodes[0]?.title).toBe('Sub1');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/08-split-large.ts
import { nodeId } from '@buddy/shared';
import type { GeminiClient, LlmPool, TreeNode } from '@buddy/shared';
import { hierarchicalExtract } from '../hierarchical/orchestrator.js';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { splitLargePrompt } from '../prompts/split-large.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { RawPage } from '../types.js';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  maxPages: number;
  maxTokens: number;
  hierarchical: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
}

function nodeTokenCount(node: TreeNode, pages: RawPage[]): number {
  let sum = 0;
  for (const p of pages) if (p.pageNumber >= node.start_index && p.pageNumber <= node.end_index) sum += p.tokenCount;
  return sum;
}

function nodePages(node: TreeNode, pages: RawPage[]): RawPage[] {
  return pages.filter(p => p.pageNumber >= node.start_index && p.pageNumber <= node.end_index);
}

async function splitOne(node: TreeNode, pages: RawPage[], opts: Opts): Promise<TreeNode> {
  const slice = nodePages(node, pages);
  let entries: { structure: string; title: string; physical_index: number }[] = [];
  if (opts.hierarchical && slice.length > 10) {
    const result = await hierarchicalExtract(slice, '1', {
      gemini: opts.gemini, pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    entries = result.map(([s, t, p]) => ({ structure: s, title: t, physical_index: p }));
  } else {
    const tagged = tagPages(slice);
    const r = await opts.gemini.generate([splitLargePrompt(tagged)], { maxOutputTokens: 8192 });
    const parsed = physicalMappingResponseSchema.parse(extractJson(r.text));
    entries = parsed.map(e => ({ structure: e.structure, title: e.title, physical_index: parsePhysicalIndexTag(e.physical_index) }));
  }
  if (entries.length === 0) return node;
  entries.sort((a, b) => a.physical_index - b.physical_index);

  const children: TreeNode[] = entries.map((e, i) => {
    const next = entries[i + 1];
    return {
      title: e.title,
      start_index: e.physical_index,
      end_index: next ? Math.max(e.physical_index, next.physical_index - 1) : node.end_index,
      node_id: nodeId(),
      nodes: [],
      images: [],
      tables: [],
    };
  });
  const newEnd = Math.max(node.start_index, (entries[0]?.physical_index ?? node.start_index) - 1);
  const parent: TreeNode = { ...node, end_index: newEnd, nodes: children };
  // recurse on children
  const recursed = await Promise.all(parent.nodes.map(c => splitNodeIfBig(c, pages, opts)));
  return { ...parent, nodes: recursed };
}

async function splitNodeIfBig(node: TreeNode, pages: RawPage[], opts: Opts): Promise<TreeNode> {
  const pageCount = node.end_index - node.start_index + 1;
  const tokens = nodeTokenCount(node, pages);
  if (pageCount > opts.maxPages && tokens > opts.maxTokens) {
    return splitOne(node, pages, opts);
  }
  if (node.nodes.length === 0) return node;
  const recursed = await Promise.all(node.nodes.map(c => splitNodeIfBig(c, pages, opts)));
  return { ...node, nodes: recursed };
}

export async function splitLargeNodes(tree: TreeNode[], pages: RawPage[], opts: Opts): Promise<TreeNode[]> {
  return Promise.all(tree.map(n => splitNodeIfBig(n, pages, opts)));
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/08-split-large.ts packages/pipeline/test/unit/steps/08-split-large.test.ts
git commit -m "feat(pipeline): step 08 split large nodes"
```

---

## Task 24: Step 09 — add summaries (parallel)

**Files:**
- Create: `packages/pipeline/src/steps/09-add-summaries.ts`
- Create: `packages/pipeline/test/unit/steps/09-add-summaries.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { addSummaries } from '../../../src/steps/09-add-summaries.js';
import { summarizeNodePrompt } from '../../../src/prompts/summarize-node.js';
import type { RawPage } from '../../../src/types.js';
import type { TreeNode } from '@buddy/shared';

describe('addSummaries', () => {
  it('attaches summary to each node', async () => {
    const tree: TreeNode[] = [{
      title: 'A', start_index: 1, end_index: 2, node_id: 'n1',
      nodes: [{ title: 'A.1', start_index: 1, end_index: 1, node_id: 'n2', nodes: [], images: [], tables: [] }],
      images: [], tables: [],
    }];
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'page1', tokenCount: 1 },
      { pageNumber: 2, text: 'page2', tokenCount: 1 },
    ];
    const responses = new Map([
      [hashPrompt([summarizeNodePrompt('page1\npage2')]), { text: 'sum-A' }],
      [hashPrompt([summarizeNodePrompt('page1')]), { text: 'sum-A1' }],
    ]);
    const pool = async <T,>(fn: () => Promise<T>) => fn();
    const out = await addSummaries(tree, pages, { gemini: createStubGemini({ responses }), pool });
    expect(out[0]?.summary).toBe('sum-A');
    expect(out[0]?.nodes[0]?.summary).toBe('sum-A1');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/09-add-summaries.ts
import type { GeminiClient, LlmPool, TreeNode } from '@buddy/shared';
import { summarizeNodePrompt } from '../prompts/summarize-node.js';
import type { RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; pool: LlmPool; }

function nodeText(node: TreeNode, pages: RawPage[]): string {
  return pages
    .filter(p => p.pageNumber >= node.start_index && p.pageNumber <= node.end_index)
    .map(p => p.text)
    .join('\n');
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) { out.push(n); out.push(...flatten(n.nodes)); }
  return out;
}

export async function addSummaries(tree: TreeNode[], pages: RawPage[], opts: Opts): Promise<TreeNode[]> {
  const all = flatten(tree);
  const summaries = await Promise.all(all.map(n => opts.pool(async () => {
    const text = nodeText(n, pages);
    if (!text.trim()) return '';
    const r = await opts.gemini.generate([summarizeNodePrompt(text)], { maxOutputTokens: 512 });
    return r.text.trim();
  })));
  const byId = new Map(all.map((n, i) => [n.node_id, summaries[i] ?? '']));
  const attach = (n: TreeNode): TreeNode => ({ ...n, summary: byId.get(n.node_id) || undefined, nodes: n.nodes.map(attach) });
  return tree.map(attach);
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/09-add-summaries.ts packages/pipeline/test/unit/steps/09-add-summaries.test.ts
git commit -m "feat(pipeline): step 09 add node summaries"
```

---

## Task 25: Step 10 — output JSON (doc description + write file)

**Files:**
- Create: `packages/pipeline/src/steps/10-output-json.ts`
- Create: `packages/pipeline/test/unit/steps/10-output-json.test.ts`

- [ ] **Step 1: Failing test**

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt, docOutputSchema } from '@buddy/shared';
import { outputJson } from '../../../src/steps/10-output-json.js';
import { docDescriptionPrompt } from '../../../src/prompts/doc-description.js';
import type { TreeNode } from '@buddy/shared';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p10-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('outputJson', () => {
  it('writes valid DocOutput JSON', async () => {
    const tree: TreeNode[] = [{
      title: 'Root', start_index: 1, end_index: 10, node_id: 'old',
      nodes: [], images: [], tables: [],
    }];
    const responses = new Map([
      [hashPrompt([docDescriptionPrompt(tree)]), { text: 'A doc about stuff.' }],
    ]);
    const gemini = createStubGemini({ responses });
    const result = await outputJson(tree, {
      docId: 'doc_x', docName: 'a.pdf', outPath: path.join(dir, 'out.json'),
      gemini, generateDescription: true,
    });
    expect(result.doc_id).toBe('doc_x');
    expect(result.doc_description).toBe('A doc about stuff.');
    docOutputSchema.parse(result);
    const read = JSON.parse(await fs.readFile(path.join(dir, 'out.json'), 'utf8'));
    expect(read.doc_name).toBe('a.pdf');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/steps/10-output-json.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { nodeId, type GeminiClient, type DocOutput, type TreeNode } from '@buddy/shared';
import { docDescriptionPrompt } from '../prompts/doc-description.js';

interface Opts {
  docId: string;
  docName: string;
  outPath: string;
  gemini: GeminiClient;
  generateDescription: boolean;
}

function assignIds(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(n => ({ ...n, node_id: nodeId(), nodes: assignIds(n.nodes) }));
}

export async function outputJson(tree: TreeNode[], opts: Opts): Promise<DocOutput> {
  const withIds = assignIds(tree);
  let description = '';
  if (opts.generateDescription && withIds.length > 0) {
    const r = await opts.gemini.generate([docDescriptionPrompt(withIds)], { maxOutputTokens: 256 });
    description = r.text.trim();
  }
  const out: DocOutput = {
    doc_id: opts.docId,
    doc_name: opts.docName,
    doc_description: description,
    structure: withIds,
  };
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await fs.writeFile(opts.outPath, JSON.stringify(out, null, 2), 'utf8');
  return out;
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/steps/10-output-json.ts packages/pipeline/test/unit/steps/10-output-json.test.ts
git commit -m "feat(pipeline): step 10 output JSON + doc description"
```

---

## Task 26: Fallback — `process-no-toc`

**Files:**
- Create: `packages/pipeline/src/fallbacks/process-no-toc.ts`
- Create: `packages/pipeline/test/unit/fallbacks/process-no-toc.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { processNoToc } from '../../../src/fallbacks/process-no-toc.js';
import { noTocHeadingsPrompt } from '../../../src/prompts/no-toc-headings.js';
import { tagPages } from '../../../src/page-tag.js';
import type { RawPage } from '../../../src/types.js';

describe('processNoToc', () => {
  it('returns flat TOC from LLM scan of all pages', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'a', tokenCount: 10 },
      { pageNumber: 2, text: 'b', tokenCount: 10 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), {
        text: '[{"structure":"1","title":"Intro","physical_index":"<physical_index_1>"},{"structure":"2","title":"Body","physical_index":"<physical_index_2>"}]',
      }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ structure: '1', title: 'Intro', physical_index: 1 });
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/fallbacks/process-no-toc.ts
import type { GeminiClient, LlmPool } from '@buddy/shared';
import { chunkPages } from '../hierarchical/chunk.js';
import { hierarchicalExtract } from '../hierarchical/orchestrator.js';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { noTocHeadingsPrompt } from '../prompts/no-toc-headings.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  chunkTokens: number;
  hierarchical: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
}

export async function processNoToc(pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  if (opts.hierarchical) {
    const result = await hierarchicalExtract(pages, '1', {
      gemini: opts.gemini, pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    return result.map(([structure, title, physical_index]) => ({ structure, title, physical_index }));
  }
  const chunks = chunkPages(pages, opts.chunkTokens);
  const all: FlatTocEntry[] = [];
  for (const c of chunks) {
    const tagged = tagPages(c.pages);
    const r = await opts.gemini.generate([noTocHeadingsPrompt(tagged)], { maxOutputTokens: 8192 });
    const parsed = physicalMappingResponseSchema.parse(extractJson(r.text));
    for (const e of parsed) all.push({ structure: e.structure, title: e.title, physical_index: parsePhysicalIndexTag(e.physical_index) });
  }
  return all;
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/fallbacks/process-no-toc.ts packages/pipeline/test/unit/fallbacks/process-no-toc.test.ts
git commit -m "feat(pipeline): fallback process-no-toc"
```

---

## Task 27: Fallback — `process-toc-no-page-numbers`

**Files:**
- Create: `packages/pipeline/src/fallbacks/process-toc-no-page-numbers.ts`
- Create: `packages/pipeline/test/unit/fallbacks/process-toc-no-page-numbers.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { processTocNoPageNumbers } from '../../../src/fallbacks/process-toc-no-page-numbers.js';
import { physicalMappingPrompt } from '../../../src/prompts/physical-mapping.js';
import { tagPages } from '../../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../../src/types.js';

describe('processTocNoPageNumbers', () => {
  it('finds physical_index for each TOC entry across all pages', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'Intro here', tokenCount: 10 },
      { pageNumber: 5, text: 'Body here', tokenCount: 10 },
    ];
    const tagged = tagPages(pages);
    const toc: FlatTocEntry[] = [{ structure: '1', title: 'Intro' }, { structure: '2', title: 'Body' }];
    const responses = new Map([
      [hashPrompt([physicalMappingPrompt(toc, tagged)]), {
        text: '[{"structure":"1","title":"Intro","physical_index":"<physical_index_1>"},{"structure":"2","title":"Body","physical_index":"<physical_index_5>"}]',
      }],
    ]);
    const out = await processTocNoPageNumbers(toc, pages, { gemini: createStubGemini({ responses }) });
    expect(out[0]?.physical_index).toBe(1);
    expect(out[1]?.physical_index).toBe(5);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/fallbacks/process-toc-no-page-numbers.ts
import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { physicalMappingPrompt } from '../prompts/physical-mapping.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; }

export async function processTocNoPageNumbers(toc: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  const tagged = tagPages(pages);
  const r = await opts.gemini.generate([physicalMappingPrompt(toc, tagged)], { maxOutputTokens: 8192 });
  const parsed = physicalMappingResponseSchema.parse(extractJson(r.text));
  const byStruct = new Map(parsed.map(p => [p.structure, parsePhysicalIndexTag(p.physical_index)]));
  return toc.map(e => ({ ...e, physical_index: byStruct.get(e.structure) }));
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add packages/pipeline/src/fallbacks/process-toc-no-page-numbers.ts packages/pipeline/test/unit/fallbacks/process-toc-no-page-numbers.test.ts
git commit -m "feat(pipeline): fallback process-toc-no-page-numbers"
```

---

## Task 28: Orchestrator — composition of all steps

**Files:**
- Create: `packages/pipeline/src/orchestrator.ts`
- Create: `packages/pipeline/test/unit/orchestrator.test.ts`

- [ ] **Step 1: Implement orchestrator (composition; logic mirrors spec §4.2)**

```ts
// src/orchestrator.ts
import { withRetry } from '@buddy/shared';
import { withLogger } from './wrappers/with-logger.js';
import { withCache } from './cache.js';
import { extractPages } from './steps/01-extract.js';
import { detectTocPages } from './steps/02-detect-toc.js';
import { extractTocContent } from './steps/03-toc-content.js';
import { detectPageNumbers } from './steps/04-detect-page-numbers.js';
import { transformToc } from './steps/05-toc-transform.js';
import { mapPhysical } from './steps/06-physical-mapping.js';
import { validateIndices } from './steps/06_5-validate-indices.js';
import { verifyAndFix } from './steps/06_6-verify-fix.js';
import { addPreface } from './steps/06_7-add-preface.js';
import { checkTitleAtStart } from './steps/06_8-title-at-start.js';
import { buildTree } from './steps/07-build-tree.js';
import { splitLargeNodes } from './steps/08-split-large.js';
import { addSummaries } from './steps/09-add-summaries.js';
import { outputJson } from './steps/10-output-json.js';
import { processNoToc } from './fallbacks/process-no-toc.js';
import { processTocNoPageNumbers } from './fallbacks/process-toc-no-page-numbers.js';
import type { Ctx, FlatTocEntry, RawPage } from './types.js';
import type { DocOutput } from '@buddy/shared';

const ACCURACY_THRESHOLD = 0.6;

async function step<T>(ctx: Ctx, name: string, fn: () => Promise<T>): Promise<T> {
  return withCache({ cacheDir: ctx.cacheDir, step: name, force: ctx.opts.force }, () =>
    withLogger({ logger: ctx.logger, step: name }, () =>
      withRetry(fn, { maxRetries: ctx.opts.maxRetries }),
    ),
  );
}

export async function runPipeline(ctx: Ctx, outPath: string, docName: string): Promise<DocOutput> {
  const pages: RawPage[] = await step(ctx, '01-extract', () => extractPages(ctx.pdfPath));

  const tocPages: number[] = await step(ctx, '02-detect-toc', () =>
    ctx.pool(() => detectTocPages(pages, { gemini: ctx.gemini, maxScan: ctx.opts.tocCheckPageNum })),
  );

  let flatToc: FlatTocEntry[];

  if (tocPages.length === 0) {
    flatToc = await step(ctx, 'fallback-no-toc', () =>
      processNoToc(pages, {
        gemini: ctx.gemini, pool: ctx.pool, chunkTokens: 80000,
        hierarchical: ctx.opts.hierarchicalProcessing,
        subgroupTokenSize: ctx.opts.subgroupTokenSize,
        maxRetrievalsPerMaster: ctx.opts.maxRetrievalsPerMaster,
      }),
    );
  } else {
    const tocText = await step(ctx, '03-toc-content', async () => extractTocContent(pages, tocPages));
    const hasPageNums = await step(ctx, '04-detect-page-numbers', () =>
      ctx.pool(() => detectPageNumbers(tocText, { gemini: ctx.gemini })),
    );
    if (!hasPageNums) {
      flatToc = await step(ctx, 'fallback-no-toc', () =>
        processNoToc(pages, {
          gemini: ctx.gemini, pool: ctx.pool, chunkTokens: 80000,
          hierarchical: ctx.opts.hierarchicalProcessing,
          subgroupTokenSize: ctx.opts.subgroupTokenSize,
          maxRetrievalsPerMaster: ctx.opts.maxRetrievalsPerMaster,
        }),
      );
    } else {
      const tocJson = await step(ctx, '05-toc-transform', () =>
        ctx.pool(() => transformToc(tocText, { gemini: ctx.gemini })),
      );
      let mapped = await step(ctx, '06-physical-mapping', () =>
        ctx.pool(() => mapPhysical(tocJson, pages, { gemini: ctx.gemini })),
      );
      mapped = await step(ctx, '06_5-validate-indices', async () => validateIndices(mapped, pages.length));
      const verifyResult = await step(ctx, '06_6-verify-fix', () =>
        verifyAndFix(mapped, pages, { gemini: ctx.gemini, maxFixRetries: 3 }),
      );
      if (verifyResult.accuracy <= ACCURACY_THRESHOLD) {
        let fallback = await step(ctx, 'fallback-toc-no-pages', () =>
          processTocNoPageNumbers(tocJson, pages, { gemini: ctx.gemini }),
        );
        fallback = await step(ctx, 'fallback-validate', async () => validateIndices(fallback, pages.length));
        const v2 = await step(ctx, 'fallback-verify', () =>
          verifyAndFix(fallback, pages, { gemini: ctx.gemini, maxFixRetries: 3 }),
        );
        if (v2.accuracy <= ACCURACY_THRESHOLD) {
          flatToc = await step(ctx, 'fallback-no-toc', () =>
            processNoToc(pages, {
              gemini: ctx.gemini, pool: ctx.pool, chunkTokens: 80000,
              hierarchical: ctx.opts.hierarchicalProcessing,
              subgroupTokenSize: ctx.opts.subgroupTokenSize,
              maxRetrievalsPerMaster: ctx.opts.maxRetrievalsPerMaster,
            }),
          );
        } else {
          flatToc = v2.entries;
        }
      } else {
        flatToc = verifyResult.entries;
      }
      flatToc = await step(ctx, '06_7-add-preface', async () => addPreface(flatToc));
      flatToc = await step(ctx, '06_8-title-at-start', () =>
        checkTitleAtStart(flatToc, pages, { gemini: ctx.gemini, pool: ctx.pool }),
      );
    }
  }

  let tree = await step(ctx, '07-build-tree', async () => buildTree(flatToc, pages.length));
  tree = await step(ctx, '08-split-large', () =>
    splitLargeNodes(tree, pages, {
      gemini: ctx.gemini, pool: ctx.pool,
      maxPages: ctx.opts.maxPagesPerNode, maxTokens: ctx.opts.maxTokensPerNode,
      hierarchical: ctx.opts.hierarchicalProcessing,
      subgroupTokenSize: ctx.opts.subgroupTokenSize,
      maxRetrievalsPerMaster: ctx.opts.maxRetrievalsPerMaster,
    }),
  );
  if (ctx.opts.addSummaries) {
    tree = await step(ctx, '09-add-summaries', () => addSummaries(tree, pages, { gemini: ctx.gemini, pool: ctx.pool }));
  }
  return outputJson(tree, {
    docId: ctx.docId, docName, outPath, gemini: ctx.gemini,
    generateDescription: ctx.opts.addSummaries,
  });
}
```

- [ ] **Step 2: Orchestrator branch-routing test (stubbed pieces)**

Skip a full integration test here — covered by the golden test in Task 30.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @buddy/pipeline typecheck
git add packages/pipeline/src/orchestrator.ts
git commit -m "feat(pipeline): orchestrator composes all steps + fallbacks"
```

---

## Task 29: Public API — `buildDoc`, `buildTopic`, barrel

**Files:**
- Edit: `packages/pipeline/src/index.ts`
- Create: `packages/pipeline/src/build.ts`
- Create: `packages/pipeline/test/unit/build.test.ts`

- [ ] **Step 1: Implement `build.ts`**

```ts
// src/build.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createLlmPool, createLogger, createRealGemini, docId as makeDocId, runId as makeRunId,
  resolveDocCacheDir, resolveDocTreePath, resolveIndexDir, resolveLogsDir,
  type Config, type DocOutput, type GeminiClient, type LlmPool, type Logger,
} from '@buddy/shared';
import { runPipeline } from './orchestrator.js';
import { buildOptsFromConfig, type BuildOpts, type Ctx } from './types.js';

interface BuildDocArgs {
  cfg: Config;
  topic: string;
  pdfPath: string;
  optsOverride?: Partial<BuildOpts>;
  gemini?: GeminiClient;
  pool?: LlmPool;
  logger?: Logger;
}

export async function buildDoc(args: BuildDocArgs): Promise<DocOutput> {
  const docName = path.basename(args.pdfPath);
  const docId = makeDocId();
  const runId = makeRunId();
  const cacheDir = resolveDocCacheDir(args.cfg.dataDir, args.topic, docId);
  const indexDir = resolveIndexDir(args.cfg.dataDir, args.topic);
  const logsDir = resolveLogsDir(args.cfg.dataDir, args.topic);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(indexDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });

  const logger = (args.logger ?? createLogger({ level: args.cfg.logLevel, destination: path.join(logsDir, `${runId}.log`) }))
    .child({ runId, topic: args.topic, docId, docName });

  const gemini = args.gemini ?? createRealGemini({ apiKey: args.cfg.geminiApiKey, defaultModel: args.cfg.geminiModel });
  const pool = args.pool ?? createLlmPool(args.cfg.maxConcurrentLlm);

  const ctx: Ctx = {
    cfg: args.cfg, gemini, pool, logger, runId,
    topic: args.topic, docId, pdfPath: args.pdfPath, cacheDir,
    opts: buildOptsFromConfig(args.cfg, args.optsOverride),
  };

  const outPath = resolveDocTreePath(args.cfg.dataDir, args.topic, docId);
  return runPipeline(ctx, outPath, docName);
}

interface BuildTopicArgs extends Omit<BuildDocArgs, 'pdfPath'> {
  pdfPaths: string[];
}

export async function buildTopic(args: BuildTopicArgs): Promise<DocOutput[]> {
  const out: DocOutput[] = [];
  for (const pdfPath of args.pdfPaths) {
    try {
      out.push(await buildDoc({ ...args, pdfPath }));
    } catch (err) {
      (args.logger ?? createLogger()).error({ err, pdfPath }, 'buildDoc failed; continuing topic');
    }
  }
  return out;
}
```

- [ ] **Step 2: Update barrel**

```ts
// src/index.ts
export { buildDoc, buildTopic } from './build.js';
export type { BuildOpts, Ctx } from './types.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @buddy/pipeline typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/build.ts packages/pipeline/src/index.ts
git commit -m "feat(pipeline): public buildDoc + buildTopic API"
```

---

## Task 30: Golden test — end-to-end small TOC fixture

**Files:**
- Create: `packages/pipeline/test/golden/small-with-toc.test.ts`
- Create: `packages/pipeline/test/golden/fixtures/small-with-toc.responses.ts`

- [ ] **Step 1: Write fixture LLM responses + fixture PDF generator**

```ts
// test/golden/fixtures/small-with-toc.responses.ts
// Maps prompt-hash → stubbed response. Built up iteratively by running the test,
// reading the "no stub response for prompt hash <prefix>" errors, and adding entries.
// Initial set assumes a 4-page PDF: page1=cover, page2=TOC, page3=Intro, page4=Body.
import { hashPrompt } from '@buddy/shared';
import { detectTocPrompt } from '../../../src/prompts/detect-toc.js';
import { detectPageNumbersPrompt } from '../../../src/prompts/detect-page-numbers.js';
import { tocTransformPrompt } from '../../../src/prompts/toc-transform.js';
// ... import all prompts needed by this fixture

export function buildResponses(samples: { detectToc: Record<string, string>; /* ... */ }): Map<string, { text: string }> {
  const m = new Map<string, { text: string }>();
  for (const [pageText, verdict] of Object.entries(samples.detectToc)) {
    m.set(hashPrompt([detectTocPrompt(pageText)]), { text: `{"toc_detected":"${verdict}"}` });
  }
  // ... rest filled in when running test reveals exact hashes needed
  return m;
}
```

- [ ] **Step 2: Write golden test**

```ts
// test/golden/small-with-toc.test.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLlmPool, createLogger, createStubGemini, loadConfig } from '@buddy/shared';
import { buildDoc } from '../../src/index.js';
import { makeTinyPdf } from '../fixtures/make-tiny-pdf.js';
import { buildResponses } from './fixtures/small-with-toc.responses.js';

let dataDir: string;
let pdfPath: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-'));
  const pdf = await makeTinyPdf([
    'Annual Report 2023',
    '1. Intro: 1\n2. Body: 2',         // page 2 = TOC
    'Intro\nThis is the intro section.',
    'Body\nDetailed analysis content.',
  ]);
  pdfPath = path.join(dataDir, 'doc.pdf');
  await fs.writeFile(pdfPath, pdf);
});
afterEach(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });

describe('golden: small PDF with TOC', () => {
  it('produces a valid DocOutput tree', async () => {
    const cfg = loadConfig({
      GEMINI_API_KEY: 'stub', DATA_DIR: dataDir, ADD_SUMMARIES: 'false',
      HIERARCHICAL_PROCESSING: 'false', IMAGES_ENABLED: 'false', TABLES_ENABLED: 'false',
      MAX_CONCURRENT_LLM: '4', MAX_PAGES_PER_NODE: '100',
    });
    const gemini = createStubGemini({ responses: buildResponses({ detectToc: { /* fill in */ } }) });
    const pool = createLlmPool(4);
    const logger = createLogger({ level: 'error' });
    const out = await buildDoc({ cfg, topic: 'test', pdfPath, gemini, pool, logger });
    expect(out.structure.length).toBeGreaterThan(0);
    expect(out.doc_name).toBe('doc.pdf');
  });
});
```

- [ ] **Step 3: Run test, iteratively add missing prompt-hash entries**

Run: `pnpm --filter @buddy/pipeline exec vitest run test/golden/small-with-toc.test.ts`
Expected first run: FAIL with `no stub response for prompt hash <hex>`. For each missing hash:
1. Identify which prompt builder produced it (from the page-text leak in `parts` if logged, or by binary-searching the stub set).
2. Add an entry to `buildResponses`.
3. Re-run until PASS.

This is intentionally iterative — the spec dictates "golden tree tests: full buildDoc per fixture PDF with stubbed LLM → assert produced tree.json deep-equals expected.tree.json. Update via `pnpm test -u`."

- [ ] **Step 4: Once passing, snapshot the result**

Replace the loose assertions with `expect(out).toMatchSnapshot()`. Re-run with `-u` to capture.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/test/golden packages/pipeline/test/fixtures
git commit -m "test(pipeline): golden end-to-end test for small-with-toc"
```

---

## Task 31: Golden test — no-TOC fallback

**Files:**
- Create: `packages/pipeline/test/golden/no-toc.test.ts`
- Create: `packages/pipeline/test/golden/fixtures/no-toc.responses.ts`

- [ ] **Step 1: Fixture PDF with no TOC (4 pages of body content)**

Same structure as Task 30 but every detect-toc response is `no`, and `processNoToc` is exercised.

```ts
// test/golden/no-toc.test.ts
// (analogous to small-with-toc; only differences: PDF text, expected branch)
```

- [ ] **Step 2: Iteratively fill stubs until pass**

- [ ] **Step 3: Snapshot + commit**

```bash
git add packages/pipeline/test/golden/no-toc.test.ts packages/pipeline/test/golden/fixtures/no-toc.responses.ts packages/pipeline/test/golden/__snapshots__
git commit -m "test(pipeline): golden no-toc fallback"
```

---

## Task 32: Golden test — TOC without page numbers

**Files:**
- Create: `packages/pipeline/test/golden/toc-no-page-numbers.test.ts`
- Create: `packages/pipeline/test/golden/fixtures/toc-no-pages.responses.ts`

- [ ] **Step 1: Fixture PDF — TOC page lists titles only ("1. Intro\n2. Body" — no numbers)**

Detect-toc returns `yes`, detect-page-numbers returns `no` → routes through `processNoToc`. (Per spec §4.2 and `04-detect-page-numbers.md`, "no page numbers" goes direct to `processNoToc`, not `processTocNoPageNumbers`.)

- [ ] **Step 2: Iteratively pass + snapshot + commit**

```bash
git add packages/pipeline/test/golden/toc-no-page-numbers.test.ts packages/pipeline/test/golden/fixtures/toc-no-pages.responses.ts packages/pipeline/test/golden/__snapshots__
git commit -m "test(pipeline): golden toc-no-page-numbers fallback"
```

---

## Task 33: `apps/build-index` CLI scaffold

**Files:**
- Create: `apps/build-index/package.json`
- Create: `apps/build-index/tsconfig.json`
- Create: `apps/build-index/tsup.config.ts`
- Create: `apps/build-index/src/index.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@buddy/build-index",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "buddy-build-index": "./dist/index.js" },
  "scripts": {
    "build": "tsup",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@buddy/pipeline": "workspace:*",
    "@buddy/shared": "workspace:*",
    "commander": "^12.1.0",
    "globby": "^14.0.2"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

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
  "references": [{ "path": "../../packages/shared" }, { "path": "../../packages/pipeline" }]
}
```

- [ ] **Step 3: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  target: 'node20',
});
```

- [ ] **Step 4: Stub `src/index.ts`**

```ts
export {};
```

- [ ] **Step 5: Install + build**

```bash
pnpm install
pnpm --filter @buddy/build-index build
```
Expected: `dist/index.js` produced.

- [ ] **Step 6: Commit**

```bash
git add apps/build-index pnpm-lock.yaml
git commit -m "feat(build-index): scaffold CLI package"
```

---

## Task 34: `apps/build-index` CLI — commander setup + `--topic` flow

**Files:**
- Create: `apps/build-index/src/cli.ts`
- Edit: `apps/build-index/src/index.ts`
- Create: `apps/build-index/src/discover.ts`
- Create: `apps/build-index/test/unit/discover.test.ts`

- [ ] **Step 1: Discover-pdfs test**

```ts
// test/unit/discover.test.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverTopicPdfs, listTopics } from '../../src/discover.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'disc-'));
  await fs.mkdir(path.join(dir, 'topicA'), { recursive: true });
  await fs.writeFile(path.join(dir, 'topicA', 'a.pdf'), 'x');
  await fs.writeFile(path.join(dir, 'topicA', 'b.pdf'), 'x');
  await fs.mkdir(path.join(dir, 'topicB'), { recursive: true });
  await fs.writeFile(path.join(dir, 'topicB', 'c.pdf'), 'x');
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('discover', () => {
  it('listTopics returns subdir names with at least one pdf', async () => {
    expect((await listTopics(dir)).sort()).toEqual(['topicA', 'topicB']);
  });
  it('discoverTopicPdfs returns absolute pdf paths', async () => {
    const pdfs = await discoverTopicPdfs(dir, 'topicA');
    expect(pdfs).toHaveLength(2);
    expect(pdfs.every(p => p.endsWith('.pdf'))).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `discover.ts`**

```ts
// src/discover.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { globby } from 'globby';

export async function listTopics(dataDir: string): Promise<string[]> {
  let entries: string[];
  try { entries = await fs.readdir(dataDir); } catch { return []; }
  const topics: string[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const sub = path.join(dataDir, name);
    const stat = await fs.stat(sub);
    if (!stat.isDirectory()) continue;
    const pdfs = await globby(['*.pdf'], { cwd: sub, absolute: true });
    if (pdfs.length > 0) topics.push(name);
  }
  return topics;
}

export async function discoverTopicPdfs(dataDir: string, topic: string): Promise<string[]> {
  return globby(['*.pdf'], { cwd: path.join(dataDir, topic), absolute: true });
}
```

- [ ] **Step 3: Implement `cli.ts`**

```ts
// src/cli.ts
import path from 'node:path';
import { Command } from 'commander';
import { createLogger, loadConfig } from '@buddy/shared';
import { buildDoc, buildTopic } from '@buddy/pipeline';
import { discoverTopicPdfs, listTopics } from './discover.js';

export function buildCli(): Command {
  const cmd = new Command();
  cmd
    .name('buddy-build-index')
    .description('Build PageIndex trees for buddy-v2 topics')
    .option('--all', 'Build all topics under DATA_DIR')
    .option('--topic <name>', 'Build a single topic')
    .option('--doc <path>', 'Build a single PDF (requires --topic)')
    .option('--force', 'Ignore caches and rebuild')
    .option('--no-summaries', 'Disable summary generation')
    .option('--no-hierarchical', 'Disable hierarchical agents')
    .action(async (opts: {
      all?: boolean; topic?: string; doc?: string; force?: boolean;
      summaries?: boolean; hierarchical?: boolean;
    }) => {
      const cfg = loadConfig();
      const logger = createLogger({ level: cfg.logLevel });
      const override = {
        force: !!opts.force,
        addSummaries: opts.summaries !== false && cfg.addSummaries,
        hierarchicalProcessing: opts.hierarchical !== false && cfg.hierarchicalProcessing,
      };

      if (opts.doc) {
        if (!opts.topic) throw new Error('--doc requires --topic');
        const docPath = path.resolve(opts.doc);
        const out = await buildDoc({ cfg, topic: opts.topic, pdfPath: docPath, optsOverride: override, logger });
        logger.info({ doc: out.doc_id, topic: opts.topic }, 'built doc');
        return;
      }
      if (opts.topic) {
        const pdfs = await discoverTopicPdfs(cfg.dataDir, opts.topic);
        if (pdfs.length === 0) { logger.warn({ topic: opts.topic }, 'no PDFs found'); return; }
        await buildTopic({ cfg, topic: opts.topic, pdfPaths: pdfs, optsOverride: override, logger });
        return;
      }
      if (opts.all) {
        for (const t of await listTopics(cfg.dataDir)) {
          const pdfs = await discoverTopicPdfs(cfg.dataDir, t);
          await buildTopic({ cfg, topic: t, pdfPaths: pdfs, optsOverride: override, logger });
        }
        return;
      }
      cmd.help();
    });
  return cmd;
}
```

- [ ] **Step 4: Wire `src/index.ts`**

```ts
// src/index.ts
import { buildCli } from './cli.js';
buildCli().parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Typecheck + smoke**

```bash
pnpm --filter @buddy/build-index typecheck
pnpm --filter @buddy/build-index exec tsx src/index.ts --help
```
Expected: prints help text, exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/build-index/src apps/build-index/test
git commit -m "feat(build-index): CLI with --all, --topic, --doc, --force"
```

---

## Task 35: Wire root scripts + final verification

**Files:**
- Edit: `package.json` (root) — add `build-index` script
- Edit: `.gitignore` — ensure `data/`, `.tsbuildinfo`, `dist/` listed

- [ ] **Step 1: Add root script**

In root `package.json`, add to `scripts`:

```json
"build-index": "pnpm --filter @buddy/build-index start"
```

- [ ] **Step 2: Verify `.gitignore` contains `data/`, `dist/`, `.tsbuildinfo`, `*.tsbuildinfo`, `node_modules`, `.env`**

If missing, add.

- [ ] **Step 3: Full repo build + test + lint**

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```
All expected: PASS.

- [ ] **Step 4: Smoke-test CLI help**

```bash
pnpm build-index --help
```
Expected: prints commander help.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: wire build-index root script + gitignore"
```

---

## Task 36: Update memory status

**Files:**
- Edit: `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` (append to Status section)

- [ ] **Step 1: Append status line**

```
- <today>: Plan 2 (`pipeline-text`) complete. `@buddy/pipeline` ships 10-step pipeline + fallbacks + hierarchical agents + caching. `apps/build-index` CLI shipped (`--all` / `--topic` / `--doc` / `--force`). Three golden tests pass (small-with-toc, no-toc, toc-no-page-numbers). Plan 3 (`pipeline-multimodal`) next.
```

- [ ] **Step 2: No commit needed** (memory is outside repo).

---

## Self-Review Notes

**Spec coverage:**
- §4.1 module layout — Tasks 1, 8–25 cover every `steps/`, `fallbacks/`, `hierarchical/`, `prompts/`, `wrappers/` file. `image/` + `table/` deferred to plan 3 per scope.
- §4.2 orchestrator — Task 28.
- §4.3 hierarchical agents — Tasks 21–22.
- §4.6 caching — Task 5 + Task 28 wires it into every step.
- §4.7 concurrency — Task 29 wires shared `LlmPool` from `@buddy/shared` into `Ctx`; Tasks 19, 21, 24 use it for fan-out.
- §10 error handling — `withRetry` (shared) wraps every step in Task 28; `buildTopic` (Task 29) continues on per-doc failure.
- §11 testing — unit per file, three golden tests (Tasks 30–32). 80%+ pipeline coverage achievable.

**Out of scope (correctly deferred to plan 3):** image-solution, document-tables, vision LLM, image cropping. Tree schema already has `images: []` and `tables: []` fields (Foundation), so plan 3 only needs to populate them.

**Placeholder scan:** Tasks 30–32 mark stub responses as iteratively filled — this is unavoidable for stubbed-LLM golden tests where prompt hashes must match exact byte-by-byte strings. Acknowledged in the task body.

**Type consistency:** `Ctx`, `BuildOpts`, `FlatTocEntry`, `RawPage` defined once in Task 3 and used throughout. `TreeNode` / `DocOutput` come from `@buddy/shared`. `Heading` / `StructuredHeading` defined once in hierarchical/ and re-used.

**Known sequencing risk:** Task 20 `buildTree` strips working fields. If TS complains during typecheck, switch `WorkingNode.nodes` type to `TreeNode[]` and only emit roots through `stripWorking`; children stored directly as `TreeNode`. Adjust during the task's typecheck step.
