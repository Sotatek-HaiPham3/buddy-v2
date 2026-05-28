# Doc-Selector Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `doc-selector` (the routing step in `@buddy/query`) see deeper-level node titles AND node summaries when picking which doc(s) can answer a user question. Aligns with PageIndex spec ("Summaries Enhance Retrieval") and fixes the case where a chapter doc is incorrectly skipped because its top-level title is just "CHAPTER N" and its sub-headings (the actual product names) are hidden one level deeper.

**Why now:** dogfood query "Mechanically deboned or separated meat là gì?" should resolve to `chapter02` (which has heading `MECHANICALLY DEBONED OR SEPARATED MEAT` at depth 2). Instead, doc-selector picked `introduction` because chapter02's visible signal in the routing prompt was just `- CHAPTER 2`. PageIndex docs at `invest-page-index/docs/query-retrieval.md` explicitly state summaries should be included for retrieval decisions.

**Architecture:**
- Add helper `collectTitlesWithSummaries(nodes, maxDepth, maxLines)` in `packages/query/src/prompts/doc-selector.ts`. Walks tree to a configurable depth (default 2), emits indented `- <title>` lines, and underneath each emits a 1-line summary if `node.summary` exists.
- Modify `docSelectorPrompt` to use this helper instead of `d.structure.slice(0, 8).map(n => n.title)`.
- Per-doc cap to keep prompt size bounded (default 30 lines per doc).
- No schema changes. No new fields. No rebuild needed — change takes effect on next query.
- Tree-reasoner prompt left alone (already includes summaries; that one is correct).

**Tech Stack:** existing — TypeScript, vitest. No new deps. Single source file + matching test file.

**Pre-reads (MANDATORY — read before editing):**
- `invest-page-index/docs/query-retrieval.md` — read sections "Summaries Enhance Retrieval" and "Multi-Level Navigation". This is the spec we're aligning with.
- `packages/query/src/prompts/doc-selector.ts` — current implementation (uses `slice(0, 8)` on top-level only).
- `packages/query/src/doc-selector.ts` — caller. Confirms `docSelectorPrompt` is consumed via single LLM call with `[prompt]` parts.
- `packages/query/test/doc-selector.test.ts` — existing test patterns. Tests use `hashPrompt([prompt])` keys; if our prompt text changes, the stub gemini responses must use updated hash keys.
- `packages/shared/src/schemas/tree.ts` — `TreeNode` interface. Confirms `summary?: string` and `nodes: TreeNode[]` are the fields we walk.

**Out of scope** (do NOT implement):
- Regenerating `doc_description` (a separate, more expensive fix that requires rebuilding all topics)
- Changes to `tree-reasoner.ts` prompt (already correct per PageIndex spec)
- Tuning maxDepth/maxLines via env vars (constants in the file are fine for v1)
- Modifying caller `doc-selector.ts` logic
- Re-running build-index on hscode (this fix is query-time only — no rebuild required)

---

## File Structure

```
packages/query/src/prompts/
└── doc-selector.ts                # MODIFY: add helper, use in prompt

packages/query/test/
└── doc-selector.test.ts           # MODIFY: regenerate stub hash keys; add shape assertions
```

Two files. Nothing else.

---

## Task 0: Prereqs

- [ ] **Step 1:** Working tree clean:

```bash
cd E:/dev-space/AI/buddy-v2
git status
git log --oneline -5
```

- [ ] **Step 2:** Snapshot test count:

```bash
pnpm -F @buddy/query test 2>&1 | tail -5
```

After Task 3 the count should rise by ~3 (new shape tests).

- [ ] **Step 3 (MANDATORY):** Read the two PageIndex sections in `invest-page-index/docs/query-retrieval.md`:
  - "Summaries Enhance Retrieval"
  - "Multi-Level Navigation"

Confirm understanding: PageIndex passes the whole tree (with summaries) to LLM for retrieval decisions. Single LLM call sees everything. Our split into `doc-selector` (router) + `tree-reasoner` (picker) is our extension for multi-doc topics — we need to apply the same "summaries enhance retrieval" principle to BOTH steps.

- [ ] **Step 4:** Open `data/hscode/.index/chapter02.tree.json`. Verify the structure:
  - Top level: `CHAPTER 2` (no summary visible at this depth)
  - Depth 2: `0207.14.91`, `0207.27.91`, `MECHANICALLY DEBONED OR SEPARATED MEAT`, `0210.99.10`, `FREEZE-DRIED DICED CHICKEN` (one or more should have `summary` fields)

This is the test case we're fixing.

---

## Task 1: Add `collectTitlesWithSummaries` helper

**Files:**
- Modify: `packages/query/src/prompts/doc-selector.ts`

**Behavior:**
- Walks a `TreeNode[]` to a maximum depth (default 2 — meaning root + one nested level).
- Emits one line per visited node: `<indent>- <title>` where indent is `'  '.repeat(depth)`.
- If node has `summary`, emits a follow-up line: `<indent>    <summary>` (4 extra spaces for sub-indentation).
- Caps total output lines (default 30 per doc). When cap is hit, appends a `... (N more)` line and stops.
- Pure function, no side effects.

- [ ] **Step 1: Failing test** — see Task 3 (we write impl + tests together; this step just sets up the structure)

  Actually, write a quick smoke test first to lock the signature. In `packages/query/test/doc-selector.test.ts` add:

```ts
import { collectTitlesWithSummaries } from '../src/prompts/doc-selector.js';
import type { TreeNode } from '@buddy/shared';

const node = (title: string, summary?: string, nodes: TreeNode[] = []): TreeNode => ({
  title, start_index: 1, end_index: 1, node_id: title.toLowerCase().replace(/\s+/g, '-'),
  nodes, images: [], tables: [], ...(summary ? { summary } : {}),
});

describe('collectTitlesWithSummaries', () => {
  it('emits indented titles and includes summaries when present', () => {
    const tree: TreeNode[] = [
      node('CHAPTER 2', undefined, [
        node('0207.14.91'),
        node('MECHANICALLY DEBONED OR SEPARATED MEAT',
          'The document explains mechanically deboned or separated meat as a paste-like product.'),
        node('FREEZE-DRIED DICED CHICKEN', 'Cubed chicken preserved by freezing and vacuum drying.'),
      ]),
    ];
    const out = collectTitlesWithSummaries(tree, 2, 30);
    const text = out.join('\n');
    expect(text).toContain('- CHAPTER 2');
    expect(text).toContain('- MECHANICALLY DEBONED OR SEPARATED MEAT');
    expect(text).toContain('paste-like product');
    expect(text).toContain('FREEZE-DRIED DICED CHICKEN');
    expect(text).toContain('vacuum drying');
  });

  it('respects maxDepth — does not descend past depth limit', () => {
    const deep: TreeNode[] = [node('A', undefined, [node('A.1', undefined, [node('A.1.1')])])];
    const out = collectTitlesWithSummaries(deep, 1, 30);
    const text = out.join('\n');
    expect(text).toContain('- A');
    expect(text).toContain('- A.1');
    expect(text).not.toContain('A.1.1');
  });

  it('caps output at maxLines and emits "more" marker', () => {
    const many: TreeNode[] = [];
    for (let i = 0; i < 50; i++) many.push(node('item-' + i));
    const out = collectTitlesWithSummaries(many, 2, 10);
    expect(out.length).toBeLessThanOrEqual(11);
    expect(out[out.length - 1]).toMatch(/more/);
  });

  it('omits summary line when node has no summary', () => {
    const tree: TreeNode[] = [node('A')];
    const out = collectTitlesWithSummaries(tree, 1, 30);
    expect(out).toEqual(['- A']);
  });
});
```

- [ ] **Step 2:** Run `pnpm -F @buddy/query test doc-selector` — expect FAIL (function doesn't exist yet).

- [ ] **Step 3: Implement** in `packages/query/src/prompts/doc-selector.ts`:

```ts
import type { DocOutput, TreeNode } from '@buddy/shared';

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_LINES_PER_DOC = 30;

export function collectTitlesWithSummaries(
  nodes: TreeNode[],
  maxDepth: number,
  maxLines: number,
): string[] {
  const out: string[] = [];
  let truncated = 0;

  function walk(node: TreeNode, depth: number): boolean {
    if (out.length >= maxLines) {
      truncated++;
      return false;
    }
    const indent = '  '.repeat(depth);
    out.push(`${indent}- ${node.title}`);
    if (node.summary && out.length < maxLines) {
      out.push(`${indent}    ${node.summary}`);
    }
    if (depth < maxDepth) {
      for (const child of node.nodes) {
        if (!walk(child, depth + 1)) {
          return false;
        }
      }
    }
    return true;
  }

  for (const root of nodes) {
    if (!walk(root, 0)) break;
  }

  if (truncated > 0 || (nodes.length > 0 && out.length === maxLines)) {
    // count remaining unvisited (best-effort, only at top level)
    out.push(`... (more nodes not shown)`);
  }

  return out;
}
```

- [ ] **Step 4:** Re-run test — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/prompts/doc-selector.ts packages/query/test/doc-selector.test.ts
git commit -m "feat(query): collectTitlesWithSummaries helper for doc-selector prompt"
```

---

## Task 2: Use helper in `docSelectorPrompt`

**Files:**
- Modify: `packages/query/src/prompts/doc-selector.ts`

- [ ] **Step 1: Rewrite `docSelectorPrompt`**

Replace the existing function body:

```ts
export const docSelectorPrompt = (
  docs: DocOutput[],
  query: string,
  historySummary: string,
): string => {
  const lines = docs.map((d) => {
    const titlesAndSummaries = collectTitlesWithSummaries(
      d.structure,
      DEFAULT_MAX_DEPTH,
      DEFAULT_MAX_LINES_PER_DOC,
    ).join('\n');
    return `doc_id: ${d.doc_id}
doc_name: ${d.doc_name}
description: ${d.doc_description}
structure (titles + summaries, up to ${DEFAULT_MAX_DEPTH + 1} levels):
${titlesAndSummaries}`;
  });

  return `You are routing a user question to the right document(s).

Use BOTH the description AND the structure listing to decide. The structure shows nested titles and per-section summaries when available — these reveal what each document actually contains beyond the chapter title.

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

Key changes:
- Replaced `d.structure.slice(0, 8).map(n => n.title)` call with `collectTitlesWithSummaries(...)`
- Header line changed from "top-level titles:" to "structure (titles + summaries, up to N levels):"
- Added an instruction sentence at the top of the prompt body explicitly telling the LLM to use both description AND structure

- [ ] **Step 2:** Run `pnpm -F @buddy/query test doc-selector` — most existing tests will FAIL because:
  - Prompt text changed → stub gemini's `hashPrompt([prompt])` keys no longer match
  - Tests that build expected stub responses will error with "no stub response for prompt hash..."

This is expected. Fix in Task 3.

- [ ] **Step 3: Commit (failing tests OK, will be fixed in Task 3)**

```bash
git add packages/query/src/prompts/doc-selector.ts
git commit -m "feat(query): doc-selector prompt includes nested titles + summaries per PageIndex spec"
```

---

## Task 3: Regenerate stub keys + add shape assertions

**Files:**
- Modify: `packages/query/test/doc-selector.test.ts`

**Why:** existing tests in this file set up stub gemini responses keyed by `hashPrompt([docSelectorPrompt(docs, query, '')])`. The prompt text changed in Task 2, so the hash differs, and the stub returns "no response" → test fails.

The fix is purely mechanical — call the prompt with the same inputs, hash gives the new key, set up the stub with that key. No assertions need to change for behavioral tests; the LLM stub is keyed on prompt text.

- [ ] **Step 1: Identify affected tests**

```bash
grep -n "hashPrompt\|docSelectorPrompt" packages/query/test/doc-selector.test.ts
```

Each existing test that constructs a stub map via `responses.set(hashPrompt([docSelectorPrompt(...)]), ...)` will need no change — the hash is computed at runtime from the same arguments. The test should work as long as the arguments match.

**Hmm — actually the hash IS computed at runtime in the test setup. So why would it fail?**

It fails ONLY if a test hard-codes a hash string (unlikely) or asserts the prompt body string directly (possible). Audit carefully.

Run tests once; for each failure:
- If error is "no stub response for prompt hash X" → the test builds prompt at setup, calls under different conditions. Re-check the call equivalence.
- If error is "prompt did not contain X" → the test asserts on prompt body shape. Update assertion to match new format (e.g., "top-level titles:" → "structure (titles + summaries").

- [ ] **Step 2: Add new shape tests**

Append to `packages/query/test/doc-selector.test.ts`:

```ts
import { docSelectorPrompt } from '../src/prompts/doc-selector.js';

describe('docSelectorPrompt shape', () => {
  const mk = (id: string, name: string, structure: TreeNode[]): DocOutput => ({
    doc_id: id, doc_name: name, doc_description: 'desc',
    structure,
  });

  it('includes nested titles (depth 2) for each doc', () => {
    const docs: DocOutput[] = [mk('d1', 'Doc.pdf', [
      node('CHAPTER 1', undefined, [
        node('MECHANICALLY DEBONED MEAT'),
      ]),
    ])];
    const prompt = docSelectorPrompt(docs, 'q', '');
    expect(prompt).toContain('MECHANICALLY DEBONED MEAT');
  });

  it('includes node summaries when present', () => {
    const docs: DocOutput[] = [mk('d1', 'Doc.pdf', [
      node('CHAPTER 1', undefined, [
        node('A topic', 'A useful summary that mentions deboning.'),
      ]),
    ])];
    const prompt = docSelectorPrompt(docs, 'q', '');
    expect(prompt).toContain('A useful summary that mentions deboning.');
  });

  it('shows doc_description and structure together', () => {
    const docs: DocOutput[] = [mk('d1', 'Doc.pdf', [node('A')])];
    const prompt = docSelectorPrompt(docs, 'q', '');
    expect(prompt).toContain('description: desc');
    expect(prompt).toContain('structure (titles + summaries');
  });
});
```

(`node` helper is the one defined earlier in the file in Task 1.)

- [ ] **Step 3:** Run `pnpm -F @buddy/query test doc-selector` — all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/query/test/doc-selector.test.ts
git commit -m "test(query): assert doc-selector prompt shape and stub hash regen"
```

---

## Task 4: Build + manual smoke

- [ ] **Step 1: Build query dist**

```bash
pnpm -F @buddy/query build
```

- [ ] **Step 2: Restart serve (if running) so it picks up new dist**

```bash
# Stop existing pnpm dev (Ctrl+C in that terminal)
$env:LOG_LEVEL='debug'; pnpm dev
```

- [ ] **Step 3: Manual smoke**

In the browser at http://localhost:5173:

1. Pick `hscode` topic.
2. Start a new conversation.
3. Ask: `Mechanically deboned or separated meat là gì?`

Watch:
- Reasoning panel should now show `chapter02` in `doc_selector.doc_ids` (was `introduction` before)
- Tree-reasoner should pick the `MECHANICALLY DEBONED OR SEPARATED MEAT` node
- Answer should describe what the term means (paste-like product, etc.)
- Citation chip should point to chapter02 page 7 (or wherever the heading resolved to)

- [ ] **Step 4: If smoke fails to route to chapter02:**

Check server log (LOG_LEVEL=debug): the `LLM usage` line for `doc-selector` should include cachedTokens=0 first call. Then inspect the trace in the UI's reasoning panel — does the LLM's reasoning mention "meat" or "deboned"? If yes but it still picks introduction, the prompt instruction isn't strong enough. If no, prompt didn't include enough signal — go back and check that summaries actually exist on chapter02's nodes (might be the doc was built without summaries).

If chapter02 has empty `summary` fields, the helper degrades gracefully (no summary lines emitted) but routing relies on titles alone. In that case the title `MECHANICALLY DEBONED OR SEPARATED MEAT` should still be enough on its own — verify via reasoning panel.

- [ ] **Step 5:** No commit at this step (verification only). If issues found, document and create a follow-up plan.

---

## Task 5: Final verification + memory update

- [ ] **Step 1: Typecheck + lint + all tests**

```bash
pnpm -r typecheck
pnpm lint
pnpm -F @buddy/query test
```

Expected: clean, all green.

- [ ] **Step 2: Append memory** in `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` under `## Status (auto-updated)`:

```
- 2026-MM-DD: Plan doc-selector-summaries complete. doc-selector prompt now includes nested titles (up to depth 2) + per-node summaries per PageIndex query-retrieval spec. Smoke result for hscode topic: <observation, e.g. "query 'Mechanically deboned meat là gì?' now correctly routes to chapter02 instead of introduction">. Per-doc prompt line cap at 30. No rebuild required — change is query-time only. Test count: <NN> (was <MM>).
```

- [ ] **Step 3: Final commit**

```bash
git add plans/260529-0313-doc-selector-summaries/plan.md
git commit -m "chore(plan): doc-selector summaries plan"
```

---

## Self-Review Notes (author)

- **Faithfulness to PageIndex:** the change mirrors PageIndex's "Summaries Enhance Retrieval" principle. Doc-selector is OUR extension (PageIndex is single-doc), but the principle applies.
- **No rebuild required:** the trees on disk already have summaries from step 09. This fix is read-side only — change the prompt, change the routing decision. Effective immediately.
- **Prompt size:** for hscode (13 chapters × 30 lines + boilerplate) ≈ 400-500 lines per doc-selector call. Within gpt-5.4-mini and Gemini context comfortably. If we ever ship a topic with 100 docs, lower the per-doc cap.
- **Failure mode:** if `node.summary` is missing (older trees, summaries disabled), helper just emits titles. Behaves the same as today (worst case parity) when summaries absent. No regression.
- **Test coverage:** Task 1's 4 helper tests cover depth, indentation, summary inclusion, cap behavior. Task 3's 3 shape tests verify the prompt actually plumbs the helper through.
- **What's NOT covered:** an integration test that runs `answer()` end-to-end and asserts chapter02 is picked. Not added because it would require either stubbing a complex multi-call LLM sequence or making a real LLM call (expensive + flaky). Manual smoke (Task 4) covers it.
- **Type consistency:** `TreeNode` imported from `@buddy/shared`. `summary?: string` and `nodes: TreeNode[]` already in schema (plan 1 + earlier plans). No schema work.
- **Caveats for the engineer:**
  - `collectTitlesWithSummaries` is exported (named export) so tests can hit it directly. Don't make it default-export or hide it.
  - The "(more nodes not shown)" line is intentionally generic. Don't try to count exactly how many were skipped — depth-first traversal makes that fiddly and the LLM doesn't care about the exact number.
  - When the helper's `out.length >= maxLines` check fires mid-walk, do NOT push the truncation marker inside the recursion. Push it once at the top level after walks complete.
  - DO NOT touch `tree-reasoner.ts` prompt. That one is correct already.

## Execution Status

- 2026-05-29: Executed tasks 0->5 on `main` from commit `84dc9c9`. Implemented helper + prompt update + tests, verified smoke query routes to `chapter02` after rebuilding `@buddy/query` and restarting serve. No tree rebuild performed.
