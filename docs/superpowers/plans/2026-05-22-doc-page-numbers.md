# Document Page Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store printed document page numbers (`doc_page_start`/`doc_page_end`) on tree nodes alongside physical PDF page indices, and use them in citations.

**Architecture:** `FlatTocEntry` already carries `page` (the printed page number from the TOC). `buildTree` maps `physical_index` → `start_index`/`end_index` but discards `page`. This plan threads `page` through as `doc_page_start`/`doc_page_end` on `TreeNode`. For the no-TOC fallback (no printed page numbers), these fields are omitted. Citations use `doc_page_*` when present, falling back to physical indices.

**Tech Stack:** zod (schema), TypeScript strict, vitest. No new dependencies.

**Pre-reads for the engineer:**
- `packages/shared/src/schemas/tree.ts` — `TreeNode` interface + zod schema
- `packages/pipeline/src/types.ts` — `FlatTocEntry`
- `packages/pipeline/src/steps/07-build-tree.ts` — where `start_index` is set from `physical_index`
- `packages/query/src/types.ts` — `RetrievedNode`
- `packages/query/src/answer-generator.ts` — where `citations.pages` is built from `page_range`
- `packages/shared/src/schemas/api.ts` — `citationSchema`

---

## File Structure

```
packages/shared/src/schemas/tree.ts        MODIFY — add doc_page_start/doc_page_end optional fields to TreeNode
packages/pipeline/src/types.ts             MODIFY — FlatTocEntry: rename page → doc_page for clarity (keep page as alias during transition)
packages/pipeline/src/steps/07-build-tree.ts  MODIFY — populate doc_page_start/doc_page_end from FlatTocEntry.page
packages/shared/src/schemas/api.ts         MODIFY — add doc_pages optional field to citationSchema
packages/query/src/types.ts                MODIFY — add doc_page_range to RetrievedNode
packages/query/src/retrieval.ts            MODIFY — populate doc_page_range from tree node
packages/query/src/answer-generator.ts    MODIFY — use doc_page_range in citations when present

packages/shared/test/schemas/tree.test.ts  MODIFY — add tests for doc_page_start/doc_page_end
packages/pipeline/test/unit/steps/07-build-tree.test.ts  CREATE — test doc_page propagation
packages/query/test/retrieval.test.ts      MODIFY — assert doc_page_range populated
packages/query/test/answer-generator.test.ts  MODIFY — assert citations use doc_pages when present
```

---

## Task 0: Prereqs

- [ ] **Step 1:** Confirm baseline tests pass:

```bash
npx vitest run
```

Expected: 190 tests pass.

- [ ] **Step 2:** Confirm current branch:

```bash
git branch --show-current
```

Expected: `main`.

---

## Task 1: Add doc_page_start/doc_page_end to TreeNode schema

**Files:**
- Modify: `packages/shared/src/schemas/tree.ts`
- Modify: `packages/shared/test/schemas/tree.test.ts`

- [ ] **Step 1: Write failing test**

Read `packages/shared/test/schemas/tree.test.ts` first. Then append inside the existing `describe` block:

```ts
it('accepts doc_page_start and doc_page_end as optional numbers', () => {
  const node = treeNodeSchema.parse({
    title: 'Chapter 1',
    start_index: 1,
    end_index: 2,
    node_id: 'n1',
    nodes: [],
    images: [],
    tables: [],
    doc_page_start: 5,
    doc_page_end: 6,
  });
  expect(node.doc_page_start).toBe(5);
  expect(node.doc_page_end).toBe(6);
});

it('accepts TreeNode without doc_page fields', () => {
  const node = treeNodeSchema.parse({
    title: 'Chapter 1',
    start_index: 1,
    end_index: 2,
    node_id: 'n1',
    nodes: [],
    images: [],
    tables: [],
  });
  expect(node.doc_page_start).toBeUndefined();
  expect(node.doc_page_end).toBeUndefined();
});
```

- [ ] **Step 2:** Run: `npx vitest run packages/shared/test/schemas/tree.test.ts` — expect FAIL (unknown keys or missing fields).

- [ ] **Step 3: Implement**

In `packages/shared/src/schemas/tree.ts`, add to the `TreeNode` interface (after `summary?: string;`):

```ts
  doc_page_start?: number;
  doc_page_end?: number;
```

Add to the `_treeNodeSchema` zod object (after `summary: z.string().optional(),`):

```ts
      doc_page_start: z.number().int().positive().optional(),
      doc_page_end: z.number().int().positive().optional(),
```

- [ ] **Step 4:** Run: `npx vitest run packages/shared/test/schemas/tree.test.ts` — expect PASS.

- [ ] **Step 5:** Run full suite to confirm no regressions:

```bash
npx vitest run packages/shared/test
```

Expected: all shared tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/tree.ts packages/shared/test/schemas/tree.test.ts
git commit -m "feat(shared): add optional doc_page_start/doc_page_end to TreeNode"
```

---

## Task 2: Thread doc_page through FlatTocEntry → buildTree

**Files:**
- Modify: `packages/pipeline/src/steps/07-build-tree.ts`
- Create: `packages/pipeline/test/unit/steps/07-build-tree.test.ts`

**Context:** `FlatTocEntry` already has `page?: number` which is the printed page number from the TOC (set by step 05 `transformToc`). `buildTree` currently discards it. We need to carry it through to `doc_page_start`/`doc_page_end` on the resulting `TreeNode`.

The `doc_page_end` for a node = the `page` of the next sibling minus 1 (same logic as `end_index`), or the last printed page of the document if it's the last node. Since we don't know the total printed pages, we use the same relative calculation: if the next node has `page`, `doc_page_end = next.page - 1`; otherwise leave it undefined.

- [ ] **Step 1: Write failing test**

Create `packages/pipeline/test/unit/steps/07-build-tree.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTree } from '../../../src/steps/07-build-tree.js';
import type { FlatTocEntry } from '../../../src/types.js';

const entry = (overrides: Partial<FlatTocEntry> & { structure: string; title: string; physical_index: number }): FlatTocEntry => ({
  appear_start: 'yes',
  ...overrides,
});

describe('buildTree — doc_page propagation', () => {
  it('sets doc_page_start from FlatTocEntry.page when present', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'Chapter 1', physical_index: 1, page: 5 }),
      entry({ structure: '2', title: 'Chapter 2', physical_index: 2, page: 6 }),
    ];
    const tree = buildTree(toc, 2);
    expect(tree[0].doc_page_start).toBe(5);
    expect(tree[1].doc_page_start).toBe(6);
  });

  it('sets doc_page_end to next sibling page minus 1', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'Chapter 1', physical_index: 1, page: 5 }),
      entry({ structure: '2', title: 'Chapter 2', physical_index: 2, page: 8 }),
    ];
    const tree = buildTree(toc, 2);
    expect(tree[0].doc_page_end).toBe(7);   // 8 - 1
    expect(tree[1].doc_page_end).toBeUndefined(); // last node, no next sibling
  });

  it('leaves doc_page_start/end undefined when FlatTocEntry has no page', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1', title: 'Section 1', physical_index: 1 }),
      entry({ structure: '2', title: 'Section 2', physical_index: 2 }),
    ];
    const tree = buildTree(toc, 2);
    expect(tree[0].doc_page_start).toBeUndefined();
    expect(tree[0].doc_page_end).toBeUndefined();
  });

  it('propagates doc_page_end up to parent from deepest child', () => {
    const toc: FlatTocEntry[] = [
      entry({ structure: '1',   title: 'Chapter 1', physical_index: 1, page: 5 }),
      entry({ structure: '1.1', title: 'Section A', physical_index: 1, page: 5 }),
      entry({ structure: '1.2', title: 'Section B', physical_index: 2, page: 6 }),
      entry({ structure: '2',   title: 'Chapter 2', physical_index: 3, page: 9 }),
    ];
    const tree = buildTree(toc, 3);
    // Chapter 1's doc_page_end should be max of its children's doc_page_end
    expect(tree[0].doc_page_end).toBe(8);   // Section B doc_page_end = 9-1 = 8
    expect(tree[0].doc_page_start).toBe(5);
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run packages/pipeline/test/unit/steps/07-build-tree.test.ts` — expect FAIL.

- [ ] **Step 3: Implement**

Read `packages/pipeline/src/steps/07-build-tree.ts` in full first. Then make these changes:

In the `WorkingNode` interface, add:
```ts
interface WorkingNode extends TreeNode { _structure: string; _appearStart: 'yes' | 'no'; _docPage?: number; }
```

In the `flat` array construction (the `.map(e => ({...}))` block), add `_docPage: e.page` and `doc_page_start: e.page`:
```ts
  const flat: WorkingNode[] = ordered.map(e => ({
    title: e.title,
    start_index: e.physical_index!,
    end_index: 0,
    node_id: nodeId(),
    nodes: [],
    images: [],
    tables: [],
    _structure: e.structure,
    _appearStart: e.appear_start ?? 'yes',
    _docPage: e.page,
    doc_page_start: e.page,
  }));
```

In the `end_index` assignment loop, also assign `doc_page_end`:
```ts
  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i]!;
    const next = flat[i + 1];
    if (!next) {
      cur.end_index = totalPages;
      // doc_page_end left undefined for last node (no next sibling)
    } else {
      cur.end_index = next._appearStart === 'no' ? next.start_index : next.start_index - 1;
      if (cur.end_index < cur.start_index) cur.end_index = cur.start_index;
      if (cur._docPage !== undefined && next._docPage !== undefined) {
        cur.doc_page_end = next._appearStart === 'no' ? next._docPage : next._docPage - 1;
        if (cur.doc_page_end < cur._docPage) cur.doc_page_end = cur._docPage;
      }
    }
  }
```

In `propagateEnd`, also propagate `doc_page_end` up from children:
```ts
  function propagateEnd(node: WorkingNode): void {
    for (const child of node.nodes) propagateEnd(child as unknown as WorkingNode);
    if (node.nodes.length > 0) {
      const maxChildEnd = Math.max(...node.nodes.map(c => (c as unknown as WorkingNode).end_index));
      node.end_index = Math.max(node.end_index, maxChildEnd);
      const childDocPageEnds = node.nodes
        .map(c => (c as unknown as WorkingNode).doc_page_end)
        .filter((v): v is number => v !== undefined);
      if (childDocPageEnds.length > 0) {
        node.doc_page_end = Math.max(...childDocPageEnds);
      }
    }
  }
```

In `stripWorking`, remove `_docPage` from the output:
```ts
function stripWorking(n: WorkingNode): TreeNode {
  const { _structure: _s, _appearStart: _a, _docPage: _dp, ...rest } = n;
  return rest;
}
```

- [ ] **Step 4:** Run: `npx vitest run packages/pipeline/test/unit/steps/07-build-tree.test.ts` — expect PASS (4 tests).

- [ ] **Step 5:** Run full pipeline tests:

```bash
npx vitest run packages/pipeline/test
```

Expected: all existing pipeline tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/steps/07-build-tree.ts packages/pipeline/test/unit/steps/07-build-tree.test.ts
git commit -m "feat(pipeline): propagate printed page numbers to doc_page_start/doc_page_end on TreeNode"
```

---

## Task 3: Add doc_pages to Citation schema + doc_page_range to RetrievedNode

**Files:**
- Modify: `packages/shared/src/schemas/api.ts`
- Modify: `packages/query/src/types.ts`
- Modify: `packages/query/src/retrieval.ts`
- Modify: `packages/query/test/retrieval.test.ts`

- [ ] **Step 1: Write failing tests**

Read `packages/query/test/retrieval.test.ts` first. Then append a new test:

```ts
it('populates doc_page_range when tree node has doc_page_start/doc_page_end', async () => {
  const node = makeNode('n1', 1, 2);
  node.doc_page_start = 5;
  node.doc_page_end = 6;
  const doc = makeDoc('d1', 'test.pdf', [node]);
  const result = await retrieveNodes({
    dataDir: '/tmp',
    topic: 'test',
    docs: [doc],
    selections: [{ doc_id: 'd1', node_ids: ['n1'] }],
    pdfPathFor: () => fixturePdfPath(),
  });
  expect(result[0].doc_page_range).toEqual([5, 6]);
});

it('leaves doc_page_range undefined when tree node has no doc_page fields', async () => {
  const node = makeNode('n1', 1, 2);
  const doc = makeDoc('d1', 'test.pdf', [node]);
  const result = await retrieveNodes({
    dataDir: '/tmp',
    topic: 'test',
    docs: [doc],
    selections: [{ doc_id: 'd1', node_ids: ['n1'] }],
    pdfPathFor: () => fixturePdfPath(),
  });
  expect(result[0].doc_page_range).toBeUndefined();
});
```

**Note:** Check the existing test file for `makeNode`, `makeDoc`, and `fixturePdfPath` helpers — use whatever pattern is already there.

- [ ] **Step 2:** Run: `npx vitest run packages/query/test/retrieval.test.ts` — expect FAIL.

- [ ] **Step 3: Implement schema change**

In `packages/shared/src/schemas/api.ts`, add `doc_pages` to `citationSchema`:

```ts
export const citationSchema = z.object({
  doc: z.string(),
  node_ids: z.array(z.string()),
  pages: z.array(z.number().int().positive()),
  doc_pages: z.array(z.number().int().positive()).optional(),
});
```

- [ ] **Step 4: Implement RetrievedNode change**

In `packages/query/src/types.ts`, add `doc_page_range` to `RetrievedNode`:

```ts
export interface RetrievedNode {
  doc_id: string;
  doc_name: string;
  node_id: string;
  title: string;
  page_range: [number, number];
  doc_page_range?: [number, number];
  text: string;
  image_captions: { page: number; caption: string }[];
  tables: { page: number; schema: string; preview: string }[];
}
```

- [ ] **Step 5: Implement retrieval change**

In `packages/query/src/retrieval.ts`, in the `out.push({...})` block, add `doc_page_range` after `page_range`:

```ts
      out.push({
        doc_id: doc.doc_id,
        doc_name: doc.doc_name,
        node_id: node.node_id,
        title: node.title,
        page_range: [node.start_index, node.end_index],
        ...(node.doc_page_start !== undefined && node.doc_page_end !== undefined
          ? { doc_page_range: [node.doc_page_start, node.doc_page_end] as [number, number] }
          : {}),
        text: pages.join('\n'),
        image_captions: imageCaptions,
        tables,
      });
```

- [ ] **Step 6:** Run: `npx vitest run packages/query/test/retrieval.test.ts` — expect PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/api.ts packages/query/src/types.ts packages/query/src/retrieval.ts packages/query/test/retrieval.test.ts
git commit -m "feat(query): add doc_page_range to RetrievedNode and doc_pages to Citation schema"
```

---

## Task 4: Use doc_pages in citations

**Files:**
- Modify: `packages/query/src/answer-generator.ts`
- Modify: `packages/query/test/answer-generator.test.ts`

- [ ] **Step 1: Write failing test**

Read `packages/query/test/answer-generator.test.ts` first. Then append:

```ts
it('uses doc_page_range for citation doc_pages when present', async () => {
  const retrieved: RetrievedNode[] = [{
    doc_id: 'd1',
    doc_name: 'Chapter01.pdf',
    node_id: 'n1',
    title: 'OXEN',
    page_range: [1, 1],
    doc_page_range: [5, 5],
    text: 'Oxen are castrated adult male bovine animals.',
    image_captions: [],
    tables: [],
  }];
  const gemini = createStubGemini({ responses: [{ text: 'Oxen are draft animals.' }] });
  const chunks: unknown[] = [];
  for await (const chunk of generateAnswer({ gemini, query: 'What are oxen?', retrieved, history: [] })) {
    chunks.push(chunk);
  }
  const citEvent = chunks.find((c: unknown) => (c as { type: string }).type === 'citations') as
    { type: 'citations'; citations: Citation[] } | undefined;
  expect(citEvent).toBeDefined();
  expect(citEvent!.citations[0].pages).toEqual([1]);
  expect(citEvent!.citations[0].doc_pages).toEqual([5]);
});

it('omits doc_pages from citation when doc_page_range absent', async () => {
  const retrieved: RetrievedNode[] = [{
    doc_id: 'd1',
    doc_name: 'Chapter01.pdf',
    node_id: 'n1',
    title: 'OXEN',
    page_range: [1, 1],
    text: 'Oxen are draft animals.',
    image_captions: [],
    tables: [],
  }];
  const gemini = createStubGemini({ responses: [{ text: 'Oxen are draft animals.' }] });
  const chunks: unknown[] = [];
  for await (const chunk of generateAnswer({ gemini, query: 'What are oxen?', retrieved, history: [] })) {
    chunks.push(chunk);
  }
  const citEvent = chunks.find((c: unknown) => (c as { type: string }).type === 'citations') as
    { type: 'citations'; citations: Citation[] } | undefined;
  expect(citEvent!.citations[0].doc_pages).toBeUndefined();
});
```

**Note:** Check the existing test file for imports (`createStubGemini`, `Citation`, `RetrievedNode`, `generateAnswer`) — use whatever is already imported.

- [ ] **Step 2:** Run: `npx vitest run packages/query/test/answer-generator.test.ts` — expect FAIL.

- [ ] **Step 3: Implement**

In `packages/query/src/answer-generator.ts`, update the citations block:

```ts
  const citations: Citation[] = opts.retrieved.map((r) => ({
    doc: r.doc_name,
    node_ids: [r.node_id],
    pages: [r.page_range[0], r.page_range[1]].filter((v, i, arr) => arr.indexOf(v) === i),
    ...(r.doc_page_range !== undefined
      ? { doc_pages: [r.doc_page_range[0], r.doc_page_range[1]].filter((v, i, arr) => arr.indexOf(v) === i) }
      : {}),
  }));
```

- [ ] **Step 4:** Run: `npx vitest run packages/query/test/answer-generator.test.ts` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/answer-generator.ts packages/query/test/answer-generator.test.ts
git commit -m "feat(query): emit doc_pages in citations when doc_page_range available"
```

---

## Task 5: Final verification

- [ ] **Step 1: All tests**

```bash
npx vitest run
```

Expected: all tests pass. Count should be ≥ 190 + new tests from tasks 1-4.

- [ ] **Step 2: Typecheck all packages**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
npx tsc --noEmit -p packages/pipeline/tsconfig.json
npx tsc --noEmit -p packages/query/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Build shared**

```bash
pnpm --filter @buddy/shared build
```

Expected: clean build.

- [ ] **Step 4: Smoke test**

Re-run Chapter01 with `--force` to regenerate the tree with `doc_page_start`/`doc_page_end`:

```bash
pnpm build-index --topic hscode --doc E:/dev-space/AI/buddy-v2/data/hscode/Chapter01.pdf --force
```

Then inspect the tree JSON:

```bash
# Find the new tree file (most recently modified)
ls -t E:/dev-space/AI/buddy-v2/data/hscode/.index/*.tree.json | head -1
```

Open it and verify nodes have `doc_page_start: 5` and `doc_page_end: 5` (or similar) alongside `start_index: 1`.

- [ ] **Step 5: Commit plan**

```bash
git add docs/superpowers/plans/2026-05-22-doc-page-numbers.md
git commit -m "chore(plan): doc page numbers implementation plan"
```

---

## Self-Review Notes

- **Spec coverage:**
  - ✅ `doc_page_start`/`doc_page_end` on `TreeNode` — Task 1
  - ✅ Populated from `FlatTocEntry.page` in `buildTree` — Task 2
  - ✅ Propagated up to parent nodes — Task 2 (`propagateEnd`)
  - ✅ `doc_page_range` on `RetrievedNode` — Task 3
  - ✅ `doc_pages` on `Citation` — Tasks 3 + 4
  - ✅ Falls back gracefully when no printed page numbers (no-TOC path) — fields simply absent

- **No-TOC fallback:** `processNoToc` and `processTocNoPageNumbers` produce `FlatTocEntry` with no `page` field. `buildTree` will leave `doc_page_start`/`doc_page_end` undefined. This is correct — no printed page numbers to store.

- **Type consistency:** `doc_page_start`/`doc_page_end` named consistently across `TreeNode` (Task 1), `buildTree` (Task 2). `doc_page_range` on `RetrievedNode` (Task 3) mirrors `page_range`. `doc_pages` on `Citation` (Tasks 3+4) mirrors `pages`. ✅

- **No placeholders detected.** ✅
