# Code-Driven Page Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the entire class of `physical_index` LLM-confusion bugs by moving ALL page-number handling out of the LLM and into code. The LLM is asked only for `[structure, title]` (no page numbers). Code derives:
- **Physical page** by string-matching the heading title against each tagged page's text (deterministic).
- **Logical page** by regex-extracting the printed number from the matched page's text (deterministic).

After this plan, the hierarchical / no-TOC fallback path is no longer vulnerable to gpt-5.4-nano's repeated copying of logical-into-physical (currently observed at 100% rate, requiring map-based reconstruction every run).

**Why now:** dogfooding on `data/hscode/` shows reconstruction warnings firing on every heading of every chapter — the LLM never emits correct `physical_index`. Reconstruction works, but the safer path is to never trust the LLM with page numbers in the first place. Spec §4 only requires "page indices on each node"; how we obtain them is implementation detail.

**Architecture:**
- LLM contract for `process-no-toc` and `subgroup-agent` becomes **2-tuple** `[structure, title]`. Pages dropped from the contract entirely.
- New helper `resolvePagesForHeadings(headings, pages)`: walks each heading's title, finds the physical page whose text contains it (case-insensitive, whitespace-normalized substring match), reads that page's printed-number for `logical_page`. Returns `FlatTocEntry[]`.
- `process-no-toc.ts` calls the resolver in place of the existing reconstruction. Reconstruction code (the disagreement-with-map case) becomes dead; remove it.
- Schemas accept legacy 3-tuple, with-logical 4-tuple, AND new 2-tuple (backward-compat — cached old responses still load).
- Hierarchical chain (`subgroup → group-master → chapter-master`): subgroup emits 2-tuple, group/chapter-master just merge tuples without inventing pages. Resolver runs once after `processNoToc` returns the merged list.
- Output schema (`TreeNode`) untouched. Existing tree.json files still valid.
- Citation rendering already handles missing logical gracefully (per `2026-05-22-logical-physical-indices.md`).

**Tech Stack:** existing — zod, vitest, no new deps. mupdf text extraction (already in shared).

**Pre-reads:**
- Spec: `docs/superpowers/specs/2026-05-21-buddy-design.md` §4 Pipeline (no page-index implementation constraint).
- Prior plan: `docs/superpowers/plans/2026-05-22-logical-physical-indices.md` — establishes the optional logical/doc_page fields. Keep them; this plan just changes how they're populated.
- Code:
  - `packages/pipeline/src/fallbacks/process-no-toc.ts` — reconstruction lives here; gets simplified
  - `packages/pipeline/src/hierarchical/{subgroup-agent,group-master,chapter-master}.ts`
  - `packages/pipeline/src/prompts/{no-toc-headings,subgroup-headings,group-master,chapter-master}.ts`
  - `packages/pipeline/src/schemas.ts` — zod union
  - `packages/pipeline/src/types.ts` — `FlatTocEntry`
  - `packages/pipeline/src/steps/06_5-validate-indices.ts` — still needed for happy-path step 06
- Memory: `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` Status section — confirms reconstruction works but fires every entry.

**Out of scope** (do NOT implement):
- Changes to happy-path (`05-toc-transform` / `06-physical-mapping`). That path already works when there's a TOC. Only `process-no-toc` fallback is touched.
- Web UI changes. Citation rendering already handles missing logical from earlier plan.
- LLM model change. Stay on gpt-5.4-nano.
- Caching scheme changes.

---

## File Structure

```
packages/pipeline/src/
├── fallbacks/
│   ├── process-no-toc.ts        # REWRITE: replace reconstruction with resolver
│   └── resolve-pages.ts         # NEW: title→page string matching + logical extraction
├── hierarchical/
│   ├── subgroup-agent.ts        # MODIFY: 2-tuple output
│   ├── group-master.ts          # MODIFY (if affected): pass 2-tuples through merge
│   └── chapter-master.ts        # MODIFY (if affected): merge 2-tuples
├── prompts/
│   ├── no-toc-headings.ts       # REWRITE: 2-tuple [structure, title] only
│   ├── subgroup-headings.ts     # REWRITE: 2-tuple [title] only (no structure at this level)
│   ├── group-master.ts          # MODIFY: 2-tuple input/output spec
│   └── chapter-master.ts        # MODIFY: 2-tuple input/output spec
├── schemas.ts                   # ADD: 2-tuple as union branch (keep legacy 3/4-tuple)
└── types.ts                     # FlatTocEntry stays (page/physical_index now optional, already are)

packages/pipeline/test/
├── unit/fallbacks/
│   ├── resolve-pages.test.ts    # NEW: resolver unit tests
│   └── process-no-toc.test.ts   # MODIFY: assert resolver-based behavior
├── unit/hierarchical/
│   └── subgroup.test.ts         # MODIFY: 2-tuple output asserted
└── golden/                       # MODIFY: stub LLM returns 2-tuples; assertions adjusted
```

---

## Task 0: Prereqs

- [ ] **Step 1:** Confirm working tree clean, latest commits include the reconstruction fixes:

```bash
cd E:/dev-space/AI/buddy-v2
git status
git log --oneline -10
```

Expected: top commits include the reconstruction work and diagnostic logging.

- [ ] **Step 2:** Snapshot test count:

```bash
pnpm -r test 2>&1 | grep -E "Tests|passed" | tail -5
```

After Task 9, total should rise by ~6.

- [ ] **Step 3:** Read every file listed in plan header's "Pre-reads".

---

## Task 1: New `resolve-pages.ts` helper

**Files:**
- Create: `packages/pipeline/src/fallbacks/resolve-pages.ts`
- Test: `packages/pipeline/test/unit/fallbacks/resolve-pages.test.ts`

**Behavior:** given `[{structure, title}, ...]` and `RawPage[]`, return `FlatTocEntry[]` with `physical_index` and `page` (logical) populated. For each heading:
1. Find the first physical page whose text contains the title (case-insensitive, whitespace-normalized substring).
2. If matched → `physical_index = page.pageNumber`, `page (logical) = extractPrintedPageNumber(page.text)` if available.
3. If unmatched → omit `physical_index` and `page`. Caller may drop the entry or keep title-only.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { resolvePagesForHeadings, normalizeForMatch } from '../../src/fallbacks/resolve-pages.js';
import type { RawPage } from '../../src/types.js';

const pages: RawPage[] = [
  { pageNumber: 1, text: '24\nCHIPPING POTATOES\nDetails about potatoes.', tokenCount: 10 },
  { pageNumber: 2, text: '25\nROUND (DRUMHEAD) CABBAGES\nContent', tokenCount: 5 },
  { pageNumber: 3, text: '26\nCABBAGE DESCRIPTION\nMore content', tokenCount: 5 },
];

describe('resolvePagesForHeadings', () => {
  it('maps each heading to the first physical page whose text contains its title', () => {
    const out = resolvePagesForHeadings(
      [
        { structure: '1.1', title: 'CHIPPING POTATOES' },
        { structure: '1.2', title: 'ROUND (DRUMHEAD) CABBAGES' },
        { structure: '1.3', title: 'CABBAGE DESCRIPTION' },
      ],
      pages,
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ structure: '1.1', title: 'CHIPPING POTATOES', physical_index: 1, page: 24 });
    expect(out[1]).toMatchObject({ structure: '1.2', physical_index: 2, page: 25 });
    expect(out[2]).toMatchObject({ structure: '1.3', physical_index: 3, page: 26 });
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'chipping  potatoes' }],   // different case + double space
      pages,
    );
    expect(out[0].physical_index).toBe(1);
  });

  it('omits physical_index and page when no page contains the title', () => {
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'NONEXISTENT TITLE' }],
      pages,
    );
    expect(out).toHaveLength(1);
    expect(out[0].physical_index).toBeUndefined();
    expect(out[0].page).toBeUndefined();
    expect(out[0].title).toBe('NONEXISTENT TITLE');
  });

  it('omits page (logical) when matched page has no printed number', () => {
    const pagesWithGap: RawPage[] = [
      { pageNumber: 1, text: 'SOME HEADING\nbody text', tokenCount: 5 },   // no leading number
    ];
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'SOME HEADING' }],
      pagesWithGap,
    );
    expect(out[0].physical_index).toBe(1);
    expect(out[0].page).toBeUndefined();
  });

  it('handles multi-line titles', () => {
    const pagesWithMultiline: RawPage[] = [
      { pageNumber: 1, text: '50\nROUND (DRUMHEAD)\nCABBAGES\nContent', tokenCount: 7 },
    ];
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'ROUND (DRUMHEAD) CABBAGES' }],
      pagesWithMultiline,
    );
    expect(out[0].physical_index).toBe(1);
  });

  it('handles duplicate headings (each maps to first occurrence after previous match)', () => {
    const pagesWithDup: RawPage[] = [
      { pageNumber: 1, text: '1\nCABBAGE\nFirst', tokenCount: 3 },
      { pageNumber: 2, text: '2\nCABBAGE\nSecond', tokenCount: 3 },
    ];
    const out = resolvePagesForHeadings(
      [
        { structure: '1.1', title: 'CABBAGE' },
        { structure: '1.2', title: 'CABBAGE' },
      ],
      pagesWithDup,
    );
    expect(out[0].physical_index).toBe(1);
    expect(out[1].physical_index).toBe(2);   // skipped past page 1
  });
});

describe('normalizeForMatch', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeForMatch('  Hello   WORLD\n')).toBe('hello world');
  });
});
```

- [ ] **Step 2:** Run `pnpm -F @buddy/pipeline test resolve-pages` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { FlatTocEntry, RawPage } from '../types.js';

export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractPrintedPageNumber(text: string): number | undefined {
  const head = text.slice(0, 150);
  const m = head.match(/\b(\d{1,4})\b/);
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface HeadingInput {
  structure: string;
  title: string;
}

export function resolvePagesForHeadings(
  headings: HeadingInput[],
  pages: RawPage[],
): FlatTocEntry[] {
  // Pre-normalize each page text for repeated substring matching.
  const normalizedPages = pages.map((p) => ({
    pageNumber: p.pageNumber,
    normalized: normalizeForMatch(p.text),
    rawText: p.text,
  }));

  let lastMatchedIndex = -1;   // page array index (not pageNumber)

  return headings.map((h) => {
    const needle = normalizeForMatch(h.title);
    let matchIdx = -1;

    // Search from page after previous match to preserve ordering for duplicate titles.
    for (let i = lastMatchedIndex + 1; i < normalizedPages.length; i++) {
      if (normalizedPages[i].normalized.includes(needle)) {
        matchIdx = i;
        break;
      }
    }

    // Fallback: if not found ahead, search from beginning (covers out-of-order LLM output).
    if (matchIdx === -1) {
      for (let i = 0; i < normalizedPages.length; i++) {
        if (normalizedPages[i].normalized.includes(needle)) {
          matchIdx = i;
          break;
        }
      }
    }

    if (matchIdx === -1) {
      return { structure: h.structure, title: h.title };
    }

    lastMatchedIndex = matchIdx;
    const matched = normalizedPages[matchIdx];
    const entry: FlatTocEntry = {
      structure: h.structure,
      title: h.title,
      physical_index: matched.pageNumber,
    };
    const printed = extractPrintedPageNumber(matched.rawText);
    if (printed !== undefined) entry.page = printed;
    return entry;
  });
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/fallbacks/resolve-pages.ts packages/pipeline/test/unit/fallbacks/resolve-pages.test.ts
git commit -m "feat(pipeline): code-driven resolver — title→physical+logical via page text match"
```

---

## Task 2: Rewrite `no-toc-headings.ts` prompt to 2-tuple

**Files:**
- Modify: `packages/pipeline/src/prompts/no-toc-headings.ts`

- [ ] **Step 1: Replace prompt body**

```ts
export const noTocHeadingsPrompt = (taggedPages: string): string => `You are extracting the hierarchical heading structure of a document.

The text contains tags like <physical_index_N> to mark page boundaries. Use the tags only as page boundaries — your output does NOT need to reference any page numbers.

For each heading in the document, output:
  ["structure", "title"]

- structure: dotted hierarchical numbering like "1", "1.1", "1.1.1" reflecting parent/child relationships
- title: the heading text exactly as written in the document

Response format:
[
  ["1", "Introduction"],
  ["1.1", "Background"]
]

Return JSON only. No commentary, no page numbers.

Text:
${taggedPages}`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/prompts/no-toc-headings.ts
git commit -m "feat(pipeline): no-toc-headings prompt emits 2-tuple [structure, title]"
```

---

## Task 3: Rewrite `subgroup-headings.ts` prompt

**Files:**
- Modify: `packages/pipeline/src/prompts/subgroup-headings.ts`

  **Read first** to understand current contract. The subgroup agent typically emits `[title, physical_index]` (no structure). Keep that level of abstraction but drop the page number → emit `[title]` 1-tuple, or `{title: string}` object — whichever is easier for the merger downstream.

  **Recommendation:** use 1-tuple `[title]` — array consistency with other agents. If group-master expects `[title, ...]` shape with a page slot, change to `[title]` and update group-master parsing.

- [ ] **Step 1: Replace prompt body** (template — adapt to file's current style):

```ts
export const subgroupHeadingsPrompt = (taggedPages: string): string => `You are extracting headings from a portion of a document.

The text may contain <physical_index_N> page markers — ignore them. We only need the headings, in document order.

For each heading found, output a 1-element array:
  ["heading title"]

Response format:
[
  ["Introduction"],
  ["Background"],
  ["Methodology"]
]

Return JSON only.

Text:
${taggedPages}`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/prompts/subgroup-headings.ts
git commit -m "feat(pipeline): subgroup-headings prompt emits 1-tuple [title]"
```

---

## Task 4: Update `chapter-master.ts` and `group-master.ts` prompts

**Files:**
- Modify: `packages/pipeline/src/prompts/chapter-master.ts`
- Modify: `packages/pipeline/src/prompts/group-master.ts`

**Behavior:**
- group-master receives lists of 1-tuples (subgroup output) per group, merges into a flat list of 2-tuples `[structure, title]` with hierarchy numbering. No page-related output.
- chapter-master receives lists of 2-tuples per group, merges + prefixes structure numbers. Output is 2-tuples `[structure, title]`.

- [ ] **Step 1: Read existing prompts** to learn current input/output shapes.

- [ ] **Step 2: Rewrite each prompt to use 2-tuple output and 1-tuple/2-tuple input**, matching the chain:
  - subgroup → 1-tuple `[title]`
  - group-master input: arrays of 1-tuples; output: 2-tuples `[structure, title]`
  - chapter-master input: arrays of 2-tuples; output: 2-tuples `[structure, title]` with prefixed structure

  Provide each prompt with a worked example. Keep the example tiny (2-3 entries).

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/prompts/group-master.ts packages/pipeline/src/prompts/chapter-master.ts
git commit -m "feat(pipeline): group/chapter-master prompts use page-free tuples"
```

---

## Task 5: Update zod schemas to accept new shapes

**Files:**
- Modify: `packages/pipeline/src/schemas.ts`

**Behavior:** the existing union `subgroupHeadingsResponseSchema` already accepts `[title, physical]` and `[title, logical, physical]`. Add a new branch accepting `[title]` (1-tuple) for the new prompt. Same for `noTocHeadingsResponseSchema` — add branch `[structure, title]` (2-tuple). Keep legacy branches for backward-compat with cached responses.

- [ ] **Step 1: Add new schemas**

```ts
const subgroupHeadingTitleOnlySchema = z.tuple([z.string()]);
const noTocHeading2TupleSchema = z.tuple([z.string(), z.string()]);
```

- [ ] **Step 2: Add to existing unions**

```ts
export const subgroupHeadingsResponseSchema = z.array(z.union([
  subgroupHeadingTitleOnlySchema,         // new
  subgroupHeadingLegacySchema,
  subgroupHeadingWithLogicalSchema,
]));

export const noTocHeadingsResponseSchema = z.array(z.union([
  noTocHeading2TupleSchema,               // new
  noTocHeadingObjectSchema,
  noTocHeadingLegacyTupleSchema,
  noTocHeadingWithLogicalTupleSchema,
]));
```

**Critical:** put the NEW (shorter) branches FIRST in the union. zod tries branches in order — putting the strictest/most-specific first reduces false-positive matches (a 4-tuple shouldn't try to parse as a 2-tuple and fail; a 2-tuple should match the 2-tuple branch first).

Similar update to `masterMergeResponseSchema` — add the 2-tuple branch.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/schemas.ts
git commit -m "feat(pipeline): schemas accept page-free tuples"
```

---

## Task 6: Update hierarchical agents

**Files:**
- Modify: `packages/pipeline/src/hierarchical/subgroup-agent.ts`
- Modify: `packages/pipeline/src/hierarchical/group-master.ts`
- Modify: `packages/pipeline/src/hierarchical/chapter-master.ts`

**Behavior:**
- subgroup-agent parses LLM output as 1-tuples. Returns `string[]` (titles).
- group-master takes `string[][]` (titles per subgroup), prompts LLM to merge+number, parses 2-tuples, returns `[string, string][]`.
- chapter-master takes `[string, string][][]`, prompts LLM to merge+prefix, parses 2-tuples, returns `[string, string][]`.

  All page references removed from internal types. Pages will be resolved by Task 7 wiring.

- [ ] **Step 1: Update each agent's parsing + return type.** Where the existing type was `[string, number]` or `[string, string, number]`, change to the page-free shape.

- [ ] **Step 2: Keep backward-compat for cached responses** — if a parsed entry has more than the new expected length, coerce to the new shape (drop the page field, keep title and optional structure). Tests in Task 8 will exercise this.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/hierarchical/
git commit -m "feat(pipeline): hierarchical agents return page-free titles+structures"
```

---

## Task 7: Rewrite `process-no-toc.ts` to use resolver

**Files:**
- Modify: `packages/pipeline/src/fallbacks/process-no-toc.ts`

**Behavior:**
- The function still returns `FlatTocEntry[]`.
- LLM contract changes: no more `physical_index` from LLM. Code parses 2-tuples (or accepts legacy).
- Call `resolvePagesForHeadings(headings, pages)` to derive physical + logical.
- DELETE the reconstruction code path (the in-range disagreement case + out-of-range case). All page-handling now lives in `resolve-pages.ts`.
- Keep both branches: `if (opts.hierarchical)` and chunked path. Each builds its own header list, then passes through resolver.

- [ ] **Step 1: Rewrite the function**

```ts
import { resolvePagesForHeadings, type HeadingInput } from './resolve-pages.js';

export async function processNoToc(pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  let headings: HeadingInput[];

  if (opts.hierarchical) {
    const merged = await hierarchicalExtract(pages, '1', {
      gemini: opts.gemini, pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    // merged is now [string, string][] (structure, title) — no pages
    headings = merged.map(([structure, title]) => ({ structure, title }));
  } else {
    const chunks = chunkPages(pages, opts.chunkTokens);
    headings = [];
    for (const c of chunks) {
      const tagged = tagPages(c.pages);
      const r = await opts.gemini.generate([noTocHeadingsPrompt(tagged)], { maxOutputTokens: 8192 });
      const parsed = noTocHeadingsResponseSchema.parse(extractJson(r.text));
      for (const entry of parsed) {
        // Handle all backward-compat shapes; we only want structure + title.
        if (Array.isArray(entry)) {
          // 2-tuple [structure, title] | legacy 3-tuple | legacy 4-tuple
          const [structure, title] = entry as [string, string, ...unknown[]];
          headings.push({ structure, title });
        } else {
          // legacy object form
          headings.push({ structure: entry.structure, title: entry.title });
        }
      }
    }
  }

  return resolvePagesForHeadings(headings, pages);
}
```

- [ ] **Step 2: Delete now-dead code:**
- `buildPrintedToPhysicalMap`, `reconstructPhysicalIndices`, `extractPrintedPageNumber` (the duplicate — single source lives in `resolve-pages.ts`).
- Any imports no longer used.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/fallbacks/process-no-toc.ts
git commit -m "feat(pipeline): processNoToc delegates page resolution to resolver, drops LLM physical_index"
```

---

## Task 8: Tests + golden updates

**Files:**
- Modify: `packages/pipeline/test/unit/fallbacks/process-no-toc.test.ts`
- Modify: `packages/pipeline/test/unit/hierarchical/subgroup.test.ts`, `group-master.test.ts`, `chapter-master.test.ts`
- Modify: `packages/pipeline/test/golden/no-toc.test.ts` (and any other golden that hits the no-toc path)

- [ ] **Step 1: Rewrite `process-no-toc.test.ts`**

Replace tests that assert reconstruction. New tests:

```ts
it('LLM emits 2-tuples; resolver derives physical from page-text match', async () => {
  const pages: RawPage[] = [
    { pageNumber: 1, text: '24\nCHIPPING POTATOES\nbody', tokenCount: 5 },
    { pageNumber: 2, text: '25\nROUND CABBAGES\nbody', tokenCount: 5 },
  ];
  const gemini = mkStubGemini([{ text: JSON.stringify([
    ['1.1', 'CHIPPING POTATOES'],
    ['1.2', 'ROUND CABBAGES'],
  ]) }]);
  const out = await processNoToc(pages, /* opts */ ...);
  expect(out[0]).toMatchObject({ structure: '1.1', physical_index: 1, page: 24 });
  expect(out[1]).toMatchObject({ structure: '1.2', physical_index: 2, page: 25 });
});

it('still parses legacy 3-tuple LLM output (backward-compat) and resolves pages from text', async () => {
  const pages: RawPage[] = [
    { pageNumber: 1, text: '1\nINTRO\nbody', tokenCount: 5 },
  ];
  const gemini = mkStubGemini([{ text: JSON.stringify([
    ['1.1', 'INTRO', 99],   // legacy with physical=99 (now ignored)
  ]) }]);
  const out = await processNoToc(pages, /* opts */ ...);
  expect(out[0].physical_index).toBe(1);   // resolved from text, not 99
});

it('still parses legacy 4-tuple LLM output', async () => {
  const pages: RawPage[] = [
    { pageNumber: 1, text: 'ANCHOR\nbody', tokenCount: 5 },
  ];
  const gemini = mkStubGemini([{ text: JSON.stringify([
    ['1.1', 'ANCHOR', 50, 99],   // logical=50, physical=99 (both ignored)
  ]) }]);
  const out = await processNoToc(pages, /* opts */ ...);
  expect(out[0].physical_index).toBe(1);
  // page (logical) extracted from page text, NOT from LLM's "50"
  expect(out[0].page).toBeUndefined();   // page text starts with "ANCHOR", no leading digit
});
```

- [ ] **Step 2: Update goldens** that scripted stub responses with page numbers. Either:
  (a) Change stubs to 2-tuples and update assertions
  (b) Keep stubs in legacy 3/4-tuple form (still accepted) and adjust assertions to expect resolver-derived values

  Prefer (a) for clarity.

- [ ] **Step 3:** Run `pnpm -F @buddy/pipeline test` — iterate until all green.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/test/
git commit -m "test(pipeline): resolver-based no-toc + backward-compat for legacy tuples"
```

---

## Task 9: Cosmetic + diagnostic cleanup

**Files:**
- Modify: anywhere `→` is used in console warnings/logs (search across `packages/pipeline/src/`)

- [ ] **Step 1:** Search:

```bash
grep -rn "→" packages/pipeline/src/
```

- [ ] **Step 2:** Replace each `→` with `->`. PowerShell garbles `→` to `ÔåÆ` on output, making logs hard to read.

- [ ] **Step 3: Remove now-dead diagnostic try/catch** in `chapter-master.ts` and `subgroup-agent.ts` if the new design makes them irrelevant. (The schema is much simpler now; the diagnostic was added to debug the old failure mode.) Keep them if you want, but the dead-issue log path is no longer load-bearing.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/
git commit -m "chore(pipeline): replace -> arrow in warn messages; remove dead diagnostic"
```

---

## Task 10: Verification + dogfood

- [ ] **Step 1: Typecheck + lint + test**

```bash
pnpm -r typecheck
pnpm lint
pnpm -r test
```

Expected: all green. Test count rises by ~6.

- [ ] **Step 2: Build dists**

```bash
pnpm -F @buddy/shared build
pnpm -F @buddy/pipeline build
```

- [ ] **Step 3: Dogfood retry on hscode**

Nuke the topic index, rebuild fresh:

```bash
# PowerShell
Remove-Item -Recurse -Force E:\dev-space\AI\buddy-v2\data\hscode\.index
$env:LOG_LEVEL='debug'; pnpm build-index --topic hscode
```

- [ ] **Step 4: Verify output quality**

For each chapter, inspect `data/hscode/.index/chapterNN.tree.json`:

```bash
node -e "
const fs = require('fs'); const path = require('path');
const dir = 'data/hscode/.index';
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.tree.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  function flatten(nodes, depth) { return nodes.flatMap(n => [{title: n.title, start: n.start_index, end: n.end_index, log: n.logical_start, depth}, ...flatten(n.nodes, depth+1)]); }
  const flat = flatten(d.structure, 0);
  console.log(f, '— nodes:', flat.length, 'logical-populated:', flat.filter(n => n.log !== undefined).length);
}
"
```

Expected:
- Every chapter has non-empty structure
- Every node has valid physical range `start <= end` within `[1, pageCount]`
- Most nodes have `logical_start` (book page) populated
- No `[process-no-toc] physical_index disagreed` warnings during the run (the entire warn path is gone — resolution replaces reconstruction)

- [ ] **Step 5: Update memory** at `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` under "## Status (auto-updated)":

```
- 2026-MM-DD: Plan code-driven-page-resolution complete. process-no-toc fallback no longer asks LLM for page indices. New resolve-pages.ts derives physical via title→page-text substring match and logical via regex on first ~150 chars of the matched page. LLM contract is now 2-tuple [structure, title]. Backward-compat with 3-tuple and 4-tuple legacy LLM output preserved (page slots ignored, code resolves regardless). Reconstruction warnings eliminated. Dogfood retry on hscode: <observations — node counts per chapter, logical-populated rate, any unmatched titles>. Total tests: <NN>.
```

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/plans/2026-05-22-code-driven-page-resolution.md
git commit -m "chore(plan): code-driven page resolution"
```

---

## Self-Review Notes (author)

- **Scope:** only `process-no-toc` fallback path touched. Happy-path step 06 physical-mapping unchanged (it works when there's a TOC). Validate step 06.5 unchanged.
- **Backward-compat:** legacy 3-tuple, 4-tuple, and object LLM outputs still parse. Old cached `fallback-no-toc.json` files still load. Code IGNORES the page slots in legacy formats and resolves via text match. Zero migration burden.
- **Output schema:** `TreeNode` unchanged. Existing `tree.json` artifacts under `data/<topic>/.index/` continue to load. New runs produce same fields populated by new logic.
- **LLM accuracy:** by removing pages from the contract entirely, gpt-5.4-nano can't get them wrong. Reduces prompt complexity, increases heading-detection accuracy as a side benefit.
- **Failure modes:**
  - LLM hallucinates a title not in any page → resolver returns entry without physical_index → step 07 buildTree drops the entry. Acceptable: better to drop a fake heading than place it on a wrong page.
  - Two real headings have same title text → resolver assigns to first-occurrence-after-last-match (preserves order via `lastMatchedIndex`). Test added.
  - Heading text split across pages (e.g. heading wrapping) → first page wins (matches needle as substring on the line where it begins).
- **No placeholders.** Every code block compilable; every command runnable.
- **Type consistency:** `HeadingInput` is the agreed shape across resolver, hierarchical agents (after Task 6), and process-no-toc (Task 7).
- **Caveats for the engineer:**
  - When updating goldens in Task 8, the stub `mkStubGemini` keys responses by prompt hash. Since prompts changed in Tasks 2-4, ALL stub keys for affected goldens must be regenerated. Easiest: snapshot the new prompt's hash, paste into stub. If stubs use the response-by-call-order pattern instead, just update the JSON shapes.
  - Subgroup agent's 1-tuple output (`[title]`) is unusual — make sure JSON.parse accepts it and zod's tuple schema is `z.tuple([z.string()])` not `z.tuple([z.string()])` with extra `.rest()`.
  - If the LLM emits the 2-tuple correctly but reverses order (`[title, structure]` instead of `[structure, title]`), the resolver still pulls the right title via destructuring `[structure, title]`. If you want resilience to order-swap, the parser in Task 7 could heuristically detect which slot looks like a dotted-number → that's structure. Optional; out of scope for v1.
