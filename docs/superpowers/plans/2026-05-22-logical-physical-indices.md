# Persist Logical + Physical Page Indices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist both **logical** (book/chapter-internal page number as printed in the PDF) and **physical** (1-indexed PDF page number) page indices on every `TreeNode` end-to-end. Validate both pairs. Surface in citations.

**Why:** Current `TreeNode` keeps only physical (`start_index`/`end_index`). Logical lives in the intermediate `FlatTocEntry.page` field and is dropped at step 07. Real-world PDFs (e.g. `data/hscode/Chapter*.pdf`) restart numbering at each chapter — LLM in `process-no-toc` fallback emits values that look like chapter-internal numbers (e.g. 9 when physical is 40), and we currently store them as `start_index` → invalid ranges like `range 32-9`. Persisting both makes the failure mode visible, enables stronger validation, and lets the UI cite as users actually read the book.

**Architecture:**
- Schema: add **optional** `logical_start?: number` + `logical_end?: number` to `TreeNode` and matching fields to `FlatTocEntry` intermediate. Optional = backward-compat with existing `.index/*.tree.json` files.
- Step 07 (`build-tree`) carries logical from `FlatTocEntry` into `TreeNode`. Logical-end computed analogous to physical-end (next sibling start − 1 / last page of doc for tail).
- Step 06.5 (`validate-indices`) extended: when logical pair present, also require `logical_end >= logical_start`; if invalid → drop logical (keep physical) and warn — do **not** drop the node.
- Step 10 (`output-json`) preserves logical fields. `strip()` helper from `2026-05-21-v1-gap-closure` already drops `_`-prefixed scratch fields — nothing to change there.
- Fallback `process-no-toc` + hierarchical agents: prompts updated so the LLM emits `[structure, title, logical_page, physical_index]`. Existing `[structure, title, physical_index]` shape stays parseable (logical optional).
- Query layer (`retrieval.ts`): no change — uses physical for `getPageText`.
- Web citations: when `logical_start` present on cited node/range, render `"p.<logical> (PDF p.<physical>)"`; otherwise current `"p.<physical>"`.

**Tech Stack:** existing — zod, vitest, no new deps.

**Pre-reads:**
- Spec: `docs/superpowers/specs/2026-05-21-buddy-design.md` §4 Pipeline, §7.6 Reasoning Panel/Citations.
- Existing code (read fully before editing):
  - `packages/shared/src/schemas/tree.ts` — `TreeNode` schema (zod + interface). Edit here first.
  - `packages/pipeline/src/types.ts` — `FlatTocEntry` (already has `page` = logical; add explicit aliases if helpful).
  - `packages/pipeline/src/steps/07-build-tree.ts` — where logical currently disappears.
  - `packages/pipeline/src/steps/06_5-validate-indices.ts` — extend validation rule.
  - `packages/pipeline/src/fallbacks/process-no-toc.ts` — fallback output shape.
  - `packages/pipeline/src/prompts/no-toc-headings.ts` and `packages/pipeline/src/prompts/physical-mapping.ts` — LLM contract.
  - `packages/pipeline/src/hierarchical/{subgroup-agent,group-master,chapter-master}.ts` — fallback chain.
  - `packages/web/src/components/CitationChip.tsx` — render site.
- Memory: `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` Status section for context on most recent OpenAI fix + gap closure.

**Out of scope** (do NOT implement):
- Auto-detect chapter offset to *reconstruct* logical when LLM emits only physical. Optional follow-up if needed.
- Multi-doc citation rendering (current chip already does it).
- Backfilling logical onto existing `.index/*.tree.json` artifacts — they keep working with `logical_*` undefined.

---

## File Structure

```
packages/shared/src/schemas/
└── tree.ts                        # MODIFY: optional logical_start/logical_end on TreeNode + zod

packages/pipeline/src/
├── types.ts                       # MODIFY: rename or alias FlatTocEntry.page → logical_page for clarity (kept backward-compatible)
├── steps/
│   ├── 07-build-tree.ts           # MODIFY: copy logical from FlatTocEntry, compute logical_end
│   └── 06_5-validate-indices.ts   # MODIFY: validate logical pair if present
├── fallbacks/
│   └── process-no-toc.ts          # MODIFY: parse logical from hierarchical chain
├── prompts/
│   ├── no-toc-headings.ts         # MODIFY: ask for [structure, title, logical, physical]
│   ├── physical-mapping.ts        # MODIFY: explain logical vs physical in the prompt header
│   ├── subgroup-headings.ts       # MODIFY (if affected): same shape upgrade
│   └── chapter-master.ts          # MODIFY (if affected): preserve logical when merging
├── hierarchical/
│   ├── subgroup-agent.ts          # MODIFY: parse logical from response if provided
│   ├── group-master.ts            # MODIFY: pass logical through merge
│   └── chapter-master.ts          # MODIFY: preserve logical in final structure
└── schemas.ts                     # MODIFY (if zod schemas for LLM responses live here): allow logical optional

packages/pipeline/test/
├── unit/steps/
│   ├── 07-build-tree.test.ts      # ADD: logical carried through
│   └── 06_5.test.ts               # ADD: logical pair validation
├── unit/fallbacks/
│   └── process-no-toc.test.ts     # ADD: logical parsed from hierarchical result
└── golden/
    └── small-with-toc.test.ts     # MODIFY (if golden fixture asserts schema): add logical fields

packages/web/src/
├── components/
│   └── CitationChip.tsx           # MODIFY: render logical when present
└── (no new files)
```

---

## Task 0: Prereqs

- [ ] **Step 1:** Working tree clean, latest commits include the OpenAI-fix trio:

```bash
cd E:/dev-space/AI/buddy-v2
git status
git log --oneline -10
```

Expected: top of log includes `fix(shared): openai client honors responseSchema via response_format json_object` (or equivalent). If not, abort — bring main up to date first.

- [ ] **Step 2:** Snapshot current test counts:

```bash
pnpm -r test 2>&1 | grep -E "Tests|passed|failed"
```

Record. After Task 8 confirm total tests rose by ~6 with no regressions.

- [ ] **Step 3:** Read every file listed in the plan header's "Pre-reads" — at minimum skim `TreeNode` schema, `FlatTocEntry`, step 07, step 06.5, `process-no-toc`, and one of the hierarchical agents. The plan assumes you understand the existing happy-path vs no-TOC-fallback split.

---

## Task 1: Add `logical_start` + `logical_end` to TreeNode schema

**Files:**
- Modify: `packages/shared/src/schemas/tree.ts`
- Test: existing tests in `packages/shared/test/` (add to schema test file if one exists; otherwise inline assertion below)

- [ ] **Step 1: Failing test (or smoke if no schema test file)**

If `packages/shared/test/schemas/tree.test.ts` (or similar) exists, add:

```ts
import { treeNodeSchema } from '../../src/schemas/tree.js';

it('accepts optional logical_start and logical_end', () => {
  const node = treeNodeSchema.parse({
    title: 't', start_index: 5, end_index: 10,
    logical_start: 1, logical_end: 6,
    node_id: 'n', nodes: [], images: [], tables: [],
  });
  expect(node.logical_start).toBe(1);
  expect(node.logical_end).toBe(6);
});

it('still accepts node without logical fields', () => {
  const node = treeNodeSchema.parse({
    title: 't', start_index: 5, end_index: 10,
    node_id: 'n', nodes: [], images: [], tables: [],
  });
  expect(node.logical_start).toBeUndefined();
});

it('rejects logical_end < logical_start when both present', () => {
  expect(() => treeNodeSchema.parse({
    title: 't', start_index: 5, end_index: 10,
    logical_start: 9, logical_end: 1,
    node_id: 'n', nodes: [], images: [], tables: [],
  })).toThrow(/logical_end/);
});
```

If no such test file exists, add a focused one at `packages/shared/test/schemas/tree.test.ts` containing just these three cases plus the existing happy-path import; do **not** delete existing tests elsewhere.

- [ ] **Step 2:** Run `pnpm -F @buddy/shared test schemas` — expect FAIL on the new cases.

- [ ] **Step 3: Implement**

In `packages/shared/src/schemas/tree.ts`:

```ts
export interface TreeNode {
  title: string;
  start_index: number;
  end_index: number;
  logical_start?: number;   // page number as printed in the source (chapter-internal / book page)
  logical_end?: number;
  node_id: string;
  summary?: string;
  nodes: TreeNode[];
  images: ImageRef[];
  tables: TableRef[];
}

const _treeNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      title: z.string(),
      start_index: z.number().int().positive(),
      end_index: z.number().int().positive(),
      logical_start: z.number().int().positive().optional(),
      logical_end: z.number().int().positive().optional(),
      node_id: z.string(),
      summary: z.string().optional(),
      nodes: z.array(_treeNodeSchema).default([]),
      images: z.array(imageRefSchema).default([]),
      tables: z.array(tableRefSchema).default([]),
    })
    .refine((n) => n.end_index >= n.start_index, {
      message: 'end_index must be >= start_index',
    })
    .refine((n) => {
      if (n.logical_start === undefined && n.logical_end === undefined) return true;
      if (n.logical_start === undefined || n.logical_end === undefined) return false;
      return n.logical_end >= n.logical_start;
    }, {
      message: 'logical_end must be >= logical_start; provide both or neither',
    }),
);
```

- [ ] **Step 4:** Re-run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/tree.ts packages/shared/test/schemas/tree.test.ts
git commit -m "feat(shared): optional logical_start/logical_end on TreeNode"
```

---

## Task 2: Pass logical through step 07 (`build-tree`)

**Files:**
- Modify: `packages/pipeline/src/steps/07-build-tree.ts`
- Test: `packages/pipeline/test/unit/steps/07-build-tree.test.ts`

**Behavior:** `FlatTocEntry.page` (logical, often present from TOC path) → `TreeNode.logical_start`. `logical_end` computed exactly like `end_index` (next sibling's logical_start − 1, or doc-end logical if tail) **only when adjacent siblings both have logical**. If any sibling lacks logical, leave `logical_end` undefined on the previous one too — don't fabricate.

- [ ] **Step 1: Failing test**

Add to `07-build-tree.test.ts`:

```ts
it('carries logical_start from FlatTocEntry.page and computes logical_end from next sibling', () => {
  const flat: FlatTocEntry[] = [
    { structure: '1', title: 'A', page: 1, physical_index: 5 },
    { structure: '2', title: 'B', page: 10, physical_index: 14 },
  ];
  const tree = buildTree(flat, /* pageCount */ 20);
  expect(tree[0].logical_start).toBe(1);
  expect(tree[0].logical_end).toBe(9);     // 10 - 1
  expect(tree[1].logical_start).toBe(10);
  expect(tree[1].logical_end).toBeUndefined();   // tail without known logical doc-end
});

it('omits logical_* entirely when FlatTocEntry has only physical_index', () => {
  const flat: FlatTocEntry[] = [
    { structure: '1', title: 'A', physical_index: 5 },
    { structure: '2', title: 'B', physical_index: 14 },
  ];
  const tree = buildTree(flat, 20);
  expect(tree[0].logical_start).toBeUndefined();
  expect(tree[0].logical_end).toBeUndefined();
});

it('omits logical_end on a sibling whose neighbor lacks logical', () => {
  const flat: FlatTocEntry[] = [
    { structure: '1', title: 'A', page: 1, physical_index: 5 },
    { structure: '2', title: 'B', physical_index: 14 },        // no logical
  ];
  const tree = buildTree(flat, 20);
  expect(tree[0].logical_start).toBe(1);
  expect(tree[0].logical_end).toBeUndefined();
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

In `07-build-tree.ts`, alongside the existing physical end-computation:

1. When deriving `start_index` from `physical_index`, also derive `logical_start = entry.page`.
2. When deriving `end_index` from the next sibling's `start_index − 1` (or `pageCount` for tail):
   - If `entry.page !== undefined` AND `nextSibling.page !== undefined` → `logical_end = nextSibling.page - 1`.
   - Else (either is undefined) → `logical_end = undefined`.
3. Same rule for nested-tail (last child of a parent). For the document's tail node, `logical_end` stays `undefined` unless the doc explicitly provides a final logical page (it usually doesn't).
4. Pass through to constructed `TreeNode`. Don't include `logical_start` or `logical_end` keys when undefined — use the same `...(x !== undefined ? { x } : {})` style already in the codebase.

  **Note:** `exactOptionalPropertyTypes` is on. Don't assign `undefined` to optional fields.

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5:** Run the full pipeline test suite:

```bash
pnpm -F @buddy/pipeline test
```

Expected: no regressions. Some goldens may need updates in Task 6.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/steps/07-build-tree.ts packages/pipeline/test/unit/steps/07-build-tree.test.ts
git commit -m "feat(pipeline): step 07 carries logical_start + computes logical_end"
```

---

## Task 3: Validate logical pair in step 06.5

**Files:**
- Modify: `packages/pipeline/src/steps/06_5-validate-indices.ts`
- Test: `packages/pipeline/test/unit/steps/06_5.test.ts`

**Behavior:** when an entry has *both* `page` and the entry above has `page`, check `current.page >= previous.page`. If violated, **null out logical fields on the offending entry** (keep physical, keep the entry in the list). Emit a warning via the existing logger (or `console.warn` if no logger is available in scope — check the file).

  Rationale: the existing validator already mutates physical to be monotonic. Apply the same gentle policy to logical so a single bad LLM emission doesn't kill the whole tree.

- [ ] **Step 1: Failing test**

```ts
it('keeps entries but clears logical when logical sequence regresses', () => {
  const entries: FlatTocEntry[] = [
    { structure: '1', title: 'A', page: 1, physical_index: 5 },
    { structure: '2', title: 'B', page: 1, physical_index: 14 },   // regress vs A
  ];
  const out = validateIndices(entries, 20);
  expect(out).toHaveLength(2);
  expect(out[1].physical_index).toBe(14);
  expect(out[1].page).toBeUndefined();
});

it('leaves logical untouched when sequence is monotonic', () => {
  const entries: FlatTocEntry[] = [
    { structure: '1', title: 'A', page: 1, physical_index: 5 },
    { structure: '2', title: 'B', page: 5, physical_index: 14 },
  ];
  const out = validateIndices(entries, 20);
  expect(out[1].page).toBe(5);
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

Add a second pass after the existing physical validation that walks the entries left-to-right tracking `lastLogical`; if `entry.page !== undefined && entry.page < lastLogical`, delete `entry.page` and emit a warning (`console.warn`-level acceptable here — this is debug telemetry only).

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/steps/06_5-validate-indices.ts packages/pipeline/test/unit/steps/06_5.test.ts
git commit -m "feat(pipeline): step 06.5 validates logical monotonicity, soft-clears on regression"
```

---

## Task 4: Hierarchical fallback emits logical (best-effort)

**Files:**
- Modify: `packages/pipeline/src/prompts/no-toc-headings.ts`
- Modify: `packages/pipeline/src/prompts/subgroup-headings.ts` (if it exists in current tree)
- Modify: `packages/pipeline/src/prompts/chapter-master.ts` (if it exists)
- Modify: `packages/pipeline/src/hierarchical/subgroup-agent.ts`
- Modify: `packages/pipeline/src/hierarchical/group-master.ts`
- Modify: `packages/pipeline/src/hierarchical/chapter-master.ts`
- Modify: `packages/pipeline/src/fallbacks/process-no-toc.ts`
- Modify: `packages/pipeline/src/schemas.ts` (if it holds the response zod for hierarchical agents)
- Test: `packages/pipeline/test/unit/fallbacks/process-no-toc.test.ts`

**Behavior:** the hierarchical chain currently emits `[structure, title, physical_index]` tuples (see `process-no-toc.ts:26`). Extend to `[structure, title, logical_page, physical_index]`, with `logical_page` allowed to be `null` (or omitted as length-3 tuple) when the model can't determine it. Then `processNoToc` produces `FlatTocEntry` with `page` populated when logical was returned.

**LLM prompt edit (template, apply to each affected prompt):**

> Each page text is tagged like `<physical_index_NN>`. Some PDFs also print their own page number (chapter-internal or book-numbered) on the page itself — look for it in the rendered text (e.g. a small number near the top/bottom of the page, often `1`, `2`, `3`… restarting per chapter). Output ONE entry per heading:
>
> `[ "structure", "title", logical_page_or_null, physical_index ]`
>
> - `physical_index`: the value from the tag where the heading begins (integer).
> - `logical_page_or_null`: the page number as printed in the document for that page, or `null` if you can't see one.

Keep the rest of each prompt unchanged.

- [ ] **Step 1: Failing test**

Add to `process-no-toc.test.ts`:

```ts
it('parses logical_page from hierarchical 4-tuple output', async () => {
  // stub gemini to return 4-tuple JSON
  const gemini = mkStubGemini([
    { text: JSON.stringify([
      ['1.1', 'Title A', 1, 5],
      ['1.2', 'Title B', null, 14],
    ]) },
  ]);
  const out = await processNoToc(pages, {
    gemini, pool: simplePool(), chunkTokens: 4000,
    hierarchical: false,   // use the simple chunk path first; mirror for hierarchical=true if relevant
    subgroupTokenSize: 4000, maxRetrievalsPerMaster: 1,
  });
  expect(out[0].page).toBe(1);
  expect(out[0].physical_index).toBe(5);
  expect(out[1].page).toBeUndefined();
  expect(out[1].physical_index).toBe(14);
});

it('remains backward-compatible with 3-tuple output', async () => {
  const gemini = mkStubGemini([
    { text: JSON.stringify([['1.1', 'Title A', 5]]) },
  ]);
  const out = await processNoToc(pages, {
    gemini, pool: simplePool(), chunkTokens: 4000,
    hierarchical: false, subgroupTokenSize: 4000, maxRetrievalsPerMaster: 1,
  });
  expect(out[0].physical_index).toBe(5);
  expect(out[0].page).toBeUndefined();
});
```

(Replace `mkStubGemini`/`simplePool`/`pages` with the helpers already used by neighboring tests in that file — don't invent.)

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

1. Update zod response schemas (likely in `packages/pipeline/src/schemas.ts`) to accept either tuple length:

   ```ts
   // tuple form: [structure, title, physical] or [structure, title, logical|null, physical]
   const responseEntry = z.union([
     z.tuple([z.string(), z.string(), z.union([z.string(), z.number()])]),
     z.tuple([z.string(), z.string(), z.union([z.string(), z.number()]).nullable(), z.union([z.string(), z.number()])]),
   ]);
   ```

   Adjust to whatever the existing schema looks like; the union pattern is the structural goal.

2. In `process-no-toc.ts` line ~26: change the mapping to detect tuple length and assign `page`/`physical_index` accordingly:

   ```ts
   return result.map((row) => {
     if (row.length === 4) {
       const [structure, title, logical, physical_index] = row;
       const entry: FlatTocEntry = { structure, title, physical_index: toInt(physical_index) };
       if (logical !== null && logical !== undefined) entry.page = toInt(logical);
       return entry;
     }
     const [structure, title, physical_index] = row;
     return { structure, title, physical_index: toInt(physical_index) };
   });
   ```

   (Use whatever int-coercion helper neighboring code uses; if `parsePhysicalIndexTag` is the right helper, use it for both fields.)

3. Same pattern in the chunked path on line ~34 of that file (currently `physicalMappingResponseSchema.parse(extractJson(...))`).

4. Each hierarchical agent (`subgroup-agent`, `group-master`, `chapter-master`) currently passes tuples through — extend the internal tuple types to carry the optional 4th element. Merging in `chapter-master` should preserve logical when present.

5. Update each affected prompt as described above.

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/prompts/ packages/pipeline/src/hierarchical/ \
        packages/pipeline/src/fallbacks/process-no-toc.ts packages/pipeline/src/schemas.ts \
        packages/pipeline/test/unit/fallbacks/process-no-toc.test.ts
git commit -m "feat(pipeline): hierarchical fallback emits logical page (best-effort)"
```

---

## Task 5: Step 10 output preserves logical fields

**Files:**
- Modify: `packages/pipeline/src/steps/10-output-json.ts`
- Test: `packages/pipeline/test/unit/steps/10-output-json.test.ts` (or `golden/*` if no unit test for step 10 exists)

**Behavior:** the `strip()` helper added in `2026-05-21-v1-gap-closure` already removes `_`-prefixed scratch fields. `logical_start`/`logical_end` are NOT prefixed → they should pass through unchanged. The Task is to **add an assertion test** that this is true — no source change unless the test reveals a problem.

- [ ] **Step 1: Failing test (likely PASSING already — that's fine, we want a regression guard)**

Add:

```ts
it('preserves logical_start and logical_end on every node', async () => {
  const tree: TreeNode[] = [{
    title: 'root', start_index: 1, end_index: 10,
    logical_start: 1, logical_end: 10,
    node_id: 'r', nodes: [
      { title: 'c', start_index: 3, end_index: 5,
        logical_start: 3, logical_end: 5,
        node_id: 'c', nodes: [], images: [], tables: [] },
    ], images: [], tables: [],
  }];
  // call outputJson, read the resulting JSON from disk, assert logical fields preserved.
  // Use the existing helper pattern already in this test file (tmp dir, etc.).
  const out = await runOutputJson(tree);   // factor or inline as neighbors do
  expect(out.structure[0].logical_start).toBe(1);
  expect(out.structure[0].nodes[0].logical_end).toBe(5);
});
```

- [ ] **Step 2:** Run — if PASS, no source change. If FAIL, inspect `strip()` / `assignIds()` for accidental field-dropping; restore.

- [ ] **Step 3: Commit (test only, or test + minimal fix)**

```bash
git add packages/pipeline/src/steps/10-output-json.ts packages/pipeline/test/unit/steps/10-output-json.test.ts
git commit -m "test(pipeline): regression guard for logical fields in output"
```

---

## Task 6: Update golden tests + fixtures

**Files:**
- Modify (potentially): `packages/pipeline/test/golden/small-with-toc.test.ts`, `no-toc.test.ts`, `toc-no-page-numbers.test.ts`, `small-with-image.test.ts`, `small-with-table.test.ts`

**Behavior:** when goldens script the LLM stub to return specific JSON, they need to either (a) still return the old 3-tuple shape (now accepted as legacy by zod union from Task 4) or (b) be updated to return 4-tuple shape and assert `logical_start` on the resulting tree.

- [ ] **Step 1:** Run all goldens once:

```bash
pnpm -F @buddy/pipeline test golden
```

- [ ] **Step 2:** For any failing golden: read the failure. If the failure is a stub-parse error (e.g. zod refusing the old shape), the union from Task 4 didn't include it — fix the union. If the failure is an assertion (e.g. structure now has fewer keys), update the assertion to either ignore `logical_start` or assert it explicitly.

  Prefer making the union *truly backward-compatible* (both 3-tuple and 4-tuple parse) so old golden fixtures don't need rewriting.

- [ ] **Step 3:** Re-run, all goldens green.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/test/golden/
git commit -m "test(pipeline): goldens compatible with logical-index changes"
```

  Skip if no changes were needed.

---

## Task 7: Web citation rendering

**Files:**
- Modify: `packages/web/src/components/CitationChip.tsx`
- Modify: `packages/shared/src/schemas/api.ts` — `Citation` type carries `pages: number[]` only; consider adding `logical_pages?: number[]` (parallel array). If so, also modify wherever citations are constructed (server-side in `@buddy/query` or `@buddy/server`).

  **Caveat:** wiring logical pages all the way through the API is a wider change than just rendering. Two paths:
  - **Path 1 (cheap, recommended for v1):** server-side citation builder reads each retrieved node and includes `logical_pages: [node.logical_start ... node.logical_end]` when present. Web reads both.
  - **Path 2 (defer):** keep current Citation shape; web fetches the tree to look up logical for citation rendering.

  Go Path 1.

- [ ] **Step 1: Failing test**

In `packages/web/src/test/components/CitationChip.test.tsx` (create if missing):

```tsx
import { CitationChip } from '../../components/CitationChip.js';
import { render, screen } from '@testing-library/react';

it('renders logical page when both present', () => {
  render(<CitationChip citation={{ doc: 'a.pdf', node_ids: ['n'], pages: [40], logical_pages: [9] }} onOpen={() => {}} />);
  expect(screen.getByRole('button').textContent).toContain('p.9');
  expect(screen.getByRole('button').textContent).toContain('PDF p.40');
});

it('renders physical only when logical missing', () => {
  render(<CitationChip citation={{ doc: 'a.pdf', node_ids: ['n'], pages: [40] }} onOpen={() => {}} />);
  expect(screen.getByRole('button').textContent).toContain('p.40');
});
```

- [ ] **Step 2:** Run — expect FAIL (types and component don't accept `logical_pages` yet).

- [ ] **Step 3: Implement**

1. Extend `citationSchema` in `packages/shared/src/schemas/api.ts`:

   ```ts
   export const citationSchema = z.object({
     doc: z.string(),
     node_ids: z.array(z.string()),
     pages: z.array(z.number().int().positive()),
     logical_pages: z.array(z.number().int().positive()).optional(),
   });
   ```

2. Update `Citation`-emitting code in `@buddy/query` (likely `packages/query/src/index.ts` or wherever `buildCitations(retrieved)` is defined): when a retrieved node has `logical_start` AND `logical_end`, push the range into `logical_pages`. When mixing nodes (some with logical, some without), include `logical_pages` only if **every** contributing node had logical — otherwise omit (don't confuse the UI with partial info).

3. `CitationChip.tsx`:

   ```tsx
   const physical = citation.pages.length === 0 ? null :
     citation.pages.length === 1
       ? `p.${citation.pages[0]}`
       : `p.${citation.pages[0]}–${citation.pages[citation.pages.length - 1]}`;
   const logical = citation.logical_pages?.length
     ? citation.logical_pages.length === 1
       ? `p.${citation.logical_pages[0]}`
       : `p.${citation.logical_pages[0]}–${citation.logical_pages[citation.logical_pages.length - 1]}`
     : null;
   const label = logical && physical && logical !== physical
     ? `${logical} (PDF ${physical})`
     : (physical ?? logical ?? '');
   // render label inside the existing chip jsx
   ```

   Don't add new styling — reuse existing chip classnames.

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/api.ts packages/query/src/ packages/web/src/components/CitationChip.tsx \
        packages/web/src/test/components/CitationChip.test.tsx
git commit -m "feat(web): citations render logical page with PDF physical fallback"
```

---

## Task 8: Final verification + dogfood retry + memory update

- [ ] **Step 1: Typecheck + lint + test**

```bash
pnpm -r typecheck
pnpm lint
pnpm -r test
```

Expected: clean. New test total ≈ old + 6.

- [ ] **Step 2: Rebuild workspace dists**

```bash
pnpm -F @buddy/shared build
pnpm -F @buddy/pipeline build
pnpm -F @buddy/query build
pnpm -F @buddy/server build
```

(Web builds via `vite build` if you want to smoke the chip; not strictly required for pipeline rerun.)

- [ ] **Step 3: Rebuild hscode topic**

```bash
$env:LOG_LEVEL='debug'; pnpm build-index --topic hscode --force
```

Inspect the new `data/hscode/.index/chapter01.tree.json`:

```bash
Get-Content data\hscode\.index\chapter01.tree.json | Select-Object -First 80
```

Expect:
- `summary` populated on every leaf node (or empty-text warnings present and traceable)
- Every node has `start_index <= end_index`
- Several nodes have `logical_start`/`logical_end` populated (from the chapter-internal numbers)
- No `_structure`/`_appearStart` keys

Document any remaining anomalies — *especially* nodes that still have invalid physical ranges. Those would indicate a deeper hierarchical-agent bug separate from this plan.

- [ ] **Step 4:** Update memory at `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` under "## Status (auto-updated)":

```
- 2026-MM-DD: Plan logical-physical-indices complete. TreeNode now carries optional logical_start/logical_end; step 07 propagates, step 06.5 validates logical monotonicity (soft-clears on regression), fallback/hierarchical agents emit best-effort 4-tuple. Citations API + CitationChip render "p.<logical> (PDF p.<physical>)" when both present. Total tests: <NN>. Dogfood result on hscode: <observations — e.g. "all chapters now have non-empty summaries; logical numbers populated 1-13 per chapter; physical ranges valid; 2 nodes still flagged invalid by validator, root cause hierarchical-agent over-segmentation (separate follow-up)">. Backward-compat preserved: existing tree.json files without logical fields still load and render.
```

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-05-22-logical-physical-indices.md
git commit -m "chore(plan): logical-physical indices plan"
```

---

## Self-Review Notes (author)

- **Coverage:** schema (Task 1), step 07 propagation (Task 2), step 06.5 validation (Task 3), fallback path (Task 4), output (Task 5), test artifacts (Task 6), UI (Task 7), verification (Task 8). End-to-end.
- **Backward-compat:** every new field optional. Existing `.index/*.tree.json` artifacts load without re-indexing. Goldens stay green via zod union accepting both 3-tuple and 4-tuple shapes.
- **LLM-fallibility policy:** when logical violates monotonicity, soft-clear instead of dropping the node (Task 3). When LLM emits only physical, leave logical undefined (Task 4). Never coerce or fabricate. UI degrades gracefully (Task 7).
- **Out-of-scope honored:** no chapter-offset auto-detection. No backfill script. No multi-doc citation merging.
- **No placeholders.** Every step has concrete code or a concrete grep target. Where existing helpers are referenced (e.g. `mkStubGemini`, `parsePhysicalIndexTag`), the plan instructs the engineer to grep the neighbor tests/files for the actual helper name — to avoid guessing.
- **Type consistency:** `logical_start`/`logical_end` named identically on `TreeNode` (Task 1), step 07 output (Task 2), step 10 preservation (Task 5). `logical_pages` plural on `Citation` (Task 7) — distinct because it's a flat list not a range; intentional.
- **Risk:** Task 4 touches prompts. LLM behavior change is empirical — the plan can't fully assert it works until Task 8 dogfood. Mitigation: backward-compatible parser means even if LLM ignores the new contract and keeps emitting 3-tuples, pipeline keeps working (just without logical). Telemetry from Task 8 reveals whether the prompt change actually elicits logical numbers.
- **Caveat for the engineer:** if `physicalMappingResponseSchema` is reused outside `process-no-toc.ts` (happy-path step 05 / step 06 also use it), the union change in Task 4 must not break the happy-path expectation that all entries have `physical_index`. Audit before committing Task 4. Add a narrower schema variant if needed.
