# Align validateIndices with PageIndex Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revert our deviation from PageIndex spec in `validateIndices`. Drop the monotonicity / regression-stripping logic we added on top. Keep only the single range check (`physical_index > pageCount`) that PageIndex actually defines. Trust resolver's placements; let buildTree handle out-of-order entries naturally by sorting and let orphan handling (PageIndex Case 33) work as designed.

**Why now:** dogfooding `data/hscode/` showed that our regression checks strip otherwise-faithful entries when LLM emits headings in semantic order (not physical order). Each strip cascades into missing tree nodes (e.g. SPECIES orphaned, CHINESE MUSTARD lost from chapter 0704.90.20). User's insight: the indices resolver produces are faithful to where each title actually appears in the text — even if LLM's hierarchy claim is wrong, the page anchoring is correct. PageIndex docs confirm this: validate only drops out-of-range entries; orphans are explicitly a normal outcome (Case 33).

**Architecture:**
- `validateIndices` becomes a single-pass range filter: if `physical_index > pageCount` → strip physical_index. Keep entry. That's it.
- No `lastPhysical` tracker. No `lastLogical` tracker. No comparison against any previous entry.
- Logical pages (`page` field) get a single sanity check: if `page < 1` → strip. No upper bound. No monotonicity.
- buildTree already sorts entries by `physical_index` before nesting, so out-of-order LLM emission gets normalized. Orphans (when parent's `physical_index` is None and gets filtered earlier) become root nodes — PageIndex Case 33 behavior.
- Tree gets noisier in the no-TOC fallback path (fake LLM headings now anchored at real-text positions instead of being silently stripped). Acceptable trade-off — user can see what LLM produced and decide downstream what to do.

**Tech Stack:** existing. No new deps. Single-file logic change in `validateIndices` + tests + dogfood.

**Pre-reads (MANDATORY — read before editing):**
- `invest-page-index/docs/edge-cases/physical-mapping.md` Case 6.5 (`Validate Physical Indices`). The reference behavior we're aligning to.
- `invest-page-index/docs/edge-cases/tree-building.md` Case 33 (`Orphan Node Handling`). Confirms orphans are NOT a bug to prevent.
- `invest-page-index/docs/edge-cases/tree-building.md` Case 10 (`Filter None Physical Index Items`). Shows where None-physical entries are excluded — only at tree-building time, after validate.
- Current `packages/pipeline/src/steps/06_5-validate-indices.ts` end-to-end. Identify the four pieces:
  1. Physical range check
  2. Physical monotonicity check  ← DELETE
  3. Logical range check
  4. Logical monotonicity check    ← DELETE
- Current `packages/pipeline/src/steps/07-build-tree.ts`. Confirm:
  - Filters out entries with `physical_index === undefined` (line ~13)
  - Sorts by `physical_index` (line ~14)
  - Builds hierarchy via `byStruct` map; parent-not-found → roots (lines 56-64) — this IS Case 33 behavior, already correct
- Existing tests in `packages/pipeline/test/unit/steps/06_5.test.ts`. Note which ones assert the regression-stripping behavior; those need flipping.
- Memory: `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` Status section. Last entry (font-aware-extraction) is the relevant context.

**Out of scope** (do NOT implement — separate concerns):
- Improving resolver's title→page matching for repeated titles (CHINESE MUSTARD on page 2 vs page 7). That's a separate bug we'll tackle in a follow-up plan.
- Filtering narrow-block bolds at extraction time. Separate concern.
- Tree noise reduction in UI (showing/hiding low-confidence nodes). UI work, not pipeline.
- Re-introducing any form of "sequence check" in any layer. PageIndex doesn't have one; we don't either.

---

## File Structure

```
packages/pipeline/src/steps/
└── 06_5-validate-indices.ts        # SIMPLIFY: range check only

packages/pipeline/test/unit/steps/
└── 06_5.test.ts                    # MODIFY: flip regression-asserting tests; add no-strip-on-regression test
```

That's it. Two files.

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
pnpm -r test 2>&1 | grep -E "Tests|passed" | tail -5
```

After Task 4 the total should be roughly unchanged (a few flipped assertions, maybe +1 new test, no removals).

- [ ] **Step 3 (MANDATORY):** Read ALL files in the "Pre-reads" section. Especially:
  - PageIndex Case 6.5 — see what their `validate_and_truncate_physical_indices` does (single rule, range only).
  - PageIndex Case 33 — confirm orphans are explicitly normal.
  - Current `06_5-validate-indices.ts` — identify exactly which lines implement which check. Tasks 1-2 delete specific blocks.

- [ ] **Step 4:** Open `data/hscode/.index/chapter07.tree.json` and the `data/hscode/.index/chapter07/.cache/fallback-no-toc-validate.json` cache file. Both should still exist from previous runs. Understand the current state: 5 entries had physical_index stripped (Cabbage, CABBAGE, DESCRIPTION, BRASSICA, OLERACEA) — these were valid resolver matches that our monotonicity check destroyed. After this plan, all 5 will keep their physical_index and appear in the tree.

---

## Task 1: Simplify `validateIndices` to range-only checks

**Files:**
- Modify: `packages/pipeline/src/steps/06_5-validate-indices.ts`

**Behavior matching PageIndex spec:**
- Physical: if `physical_index < 1` OR `physical_index > pageCount` → strip `physical_index` from entry. Keep entry.
- Logical: if `page < 1` → strip `page` from entry. Keep entry. No upper bound (book pages can exceed PDF pageCount).
- That's all. No tracking, no comparison against neighbors, no monotonicity.

- [ ] **Step 1: Read current file**

Locate the four logical blocks:
1. Physical range check (drops out-of-range physical_index) — KEEP
2. `lastPhysical` tracker + monotonicity check — DELETE
3. Logical range check (drops `page < 1`) — KEEP
4. `lastLogical` tracker + monotonicity check — DELETE

- [ ] **Step 2: Failing test (assert new behavior)**

Add to `packages/pipeline/test/unit/steps/06_5.test.ts`:

```ts
import type { FlatTocEntry } from '../../../src/types.js';
import { validateIndices } from '../../../src/steps/06_5-validate-indices.js';

it('KEEPS physical_index even when it regresses vs previous entries', () => {
  // LLM may emit headings in semantic-hierarchy order, not physical order.
  // PageIndex spec validates ONLY range, not monotonicity.
  const entries: FlatTocEntry[] = [
    { structure: '1.1', title: 'A', physical_index: 5 },
    { structure: '1.2', title: 'B', physical_index: 8 },
    { structure: '1.3', title: 'C', physical_index: 3 },   // regresses 8 -> 3
  ];
  const out = validateIndices(entries, 10);
  expect(out).toHaveLength(3);
  expect(out[0].physical_index).toBe(5);
  expect(out[1].physical_index).toBe(8);
  expect(out[2].physical_index).toBe(3);   // KEPT, not stripped
});

it('KEEPS logical page even when it regresses', () => {
  const entries: FlatTocEntry[] = [
    { structure: '1.1', title: 'A', page: 24, physical_index: 1 },
    { structure: '1.2', title: 'B', page: 30, physical_index: 2 },
    { structure: '1.3', title: 'C', page: 25, physical_index: 3 },   // regresses 30 -> 25
  ];
  const out = validateIndices(entries, 10);
  expect(out[2].page).toBe(25);   // KEPT, not stripped
});

it('still strips physical_index when out of pageCount range', () => {
  // PageIndex Case 6.5 — single rule that survives.
  const entries: FlatTocEntry[] = [
    { structure: '1.1', title: 'A', physical_index: 99 },
  ];
  const out = validateIndices(entries, 10);
  expect(out[0].physical_index).toBeUndefined();
});

it('still strips page when < 1', () => {
  const entries: FlatTocEntry[] = [
    { structure: '1.1', title: 'A', page: 0, physical_index: 1 },
  ];
  const out = validateIndices(entries, 10);
  expect(out[0].page).toBeUndefined();
});

it('does NOT strip page when > pageCount (logical can exceed physical pageCount)', () => {
  // Already covered by an earlier plan; assert here as regression guard.
  const entries: FlatTocEntry[] = [
    { structure: '1.1', title: 'A', page: 99, physical_index: 1 },
  ];
  const out = validateIndices(entries, 10);
  expect(out[0].page).toBe(99);
});
```

- [ ] **Step 3:** Run `pnpm -F @buddy/pipeline test 06_5` — expect the new tests to FAIL on existing implementation (because current code still strips regressions).

- [ ] **Step 4: Implement** — rewrite `06_5-validate-indices.ts` as a single pass:

```ts
import type { FlatTocEntry } from '../types.js';

export function validateIndices(toc: FlatTocEntry[], pageCount: number): FlatTocEntry[] {
  return toc.map((e) => {
    const out: FlatTocEntry = { ...e };

    // PageIndex Case 6.5: strip physical_index when out of [1, pageCount]
    if (out.physical_index !== undefined) {
      if (out.physical_index < 1 || out.physical_index > pageCount) {
        delete out.physical_index;
      }
    }

    // Logical (book page) can legitimately exceed pageCount (e.g. chapter pages 24-32 of a larger book).
    // Only sanity-check < 1.
    if (out.page !== undefined && out.page < 1) {
      delete out.page;
    }

    return out;
  });
}
```

Notes:
- `delete` is fine on a shallow copy; `out` is a new object per entry.
- No `lastPhysical`, no `lastLogical`, no `console.warn`. The previous regression warnings were our addition; they were misleading (telling us "this is bad" when in fact resolver had placed the entry correctly).
- Keep the function pure — input not mutated, new array returned.

- [ ] **Step 5:** Re-run `pnpm -F @buddy/pipeline test 06_5` — expect all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/steps/06_5-validate-indices.ts \
        packages/pipeline/test/unit/steps/06_5.test.ts
git commit -m "fix(pipeline): align validateIndices with PageIndex spec (range-only, no monotonicity)"
```

---

## Task 2: Flip existing regression-asserting tests

**Files:**
- Modify (same file as Task 1): `packages/pipeline/test/unit/steps/06_5.test.ts`

Earlier plans added tests that asserted the regression-stripping behavior. After Task 1 those tests will FAIL because the behavior is gone. Find them, flip the assertions to match new behavior (regression → kept, not stripped). Don't delete; the test cases themselves cover useful scenarios.

Look for tests with names like:
- "clears physical_index when sequence regresses"
- "drops regressing physical_index"
- "logical page regressed; clearing page"
- "soft-clears physical_index on monotonicity violation"

For each:
- Old assertion: `expect(out[N].physical_index).toBeUndefined()` → new: `expect(out[N].physical_index).toBe(<originalValue>)`
- Update the test name/description to match new behavior (e.g. "preserves physical_index even when sequence regresses (PageIndex Case 6.5)")
- Keep the test data; just flip the expectation.

- [ ] **Step 1: Find affected tests**

```bash
grep -n "regress\|toBeUndefined.*physical_index\|toBeUndefined.*page" packages/pipeline/test/unit/steps/06_5.test.ts
```

- [ ] **Step 2: Edit each** — flip assertion + update name. Don't change inputs.

- [ ] **Step 3:** Run `pnpm -F @buddy/pipeline test 06_5` — all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/test/unit/steps/06_5.test.ts
git commit -m "test(pipeline): flip regression-stripping assertions to match PageIndex spec"
```

---

## Task 3: Verify buildTree handles the new flow correctly

**Files:**
- Inspect: `packages/pipeline/src/steps/07-build-tree.ts`
- No code change expected — this is a verification task.

**Why:** with regression strips gone, buildTree will see more entries (including ones at earlier physical pages than their LLM-emitted predecessors). Confirm the existing behavior still works:

1. Filter `physical_index === undefined` (line ~13). Entries without physical_index get dropped — these are titles that resolver couldn't anchor anywhere. Correct.
2. Sort by physical_index ascending (line ~14). Now handles the previously-stripped entries — they get sorted into their actual document position.
3. Hierarchy via structure dots. When LLM emitted a deep chain like `1.1.4.1.1.1` and some intermediate parents have `physical_index === undefined` (e.g. "Brassicaceae/Cruciferae" — appears in a table, resolver couldn't find a match), those intermediates are dropped at the filter step. The deeper descendants whose `physical_index` IS defined become orphans (parent not in `byStruct` → push to roots). PageIndex Case 33 behavior. Correct.
4. `propagateEnd` walks the resulting tree, parent `end_index = max(child.end_index)`. Already correct.

- [ ] **Step 1:** Read `07-build-tree.ts` end-to-end. Confirm above behaviors. No edits.

- [ ] **Step 2:** Add a small integration-style test (lives in `06_5.test.ts` is fine, or `07-build-tree.test.ts`):

```ts
it('after validate + buildTree: out-of-order LLM entries land in physical order in the tree', () => {
  // LLM emitted in semantic order; physical sort puts them right.
  const entries: FlatTocEntry[] = [
    { structure: '1.1', title: 'First', physical_index: 5 },
    { structure: '1.2', title: 'Second', physical_index: 8 },
    { structure: '1.3', title: 'Third', physical_index: 3 },   // out of order
  ];
  const validated = validateIndices(entries, 10);   // no strip
  const tree = buildTree(validated, 10);
  // All three siblings present, in physical order
  const titlesInOrder = tree[0].nodes?.map((n) => n.title) ?? tree.map((n) => n.title);
  // Depending on whether they share a root, structure may differ; assert all three appear
  const allTitles = collectAllTitles(tree);
  expect(allTitles).toEqual(expect.arrayContaining(['First', 'Second', 'Third']));
});
```

(Adjust `collectAllTitles` to existing test helper or write inline.)

- [ ] **Step 3:** Run — all PASS.

- [ ] **Step 4: Commit (if any new test added)**

```bash
git add packages/pipeline/test/unit/
git commit -m "test(pipeline): integration test for validate+buildTree on out-of-order LLM entries"
```

If Step 1 confirms no code change and Step 2 didn't add anything, skip this commit.

---

## Task 4: Dogfood retry on hscode

- [ ] **Step 1: Rebuild dists**

```bash
pnpm -F @buddy/shared build
pnpm -F @buddy/pipeline build
```

- [ ] **Step 2: Nuke index, re-run hscode**

```bash
# PowerShell
Remove-Item -Recurse -Force E:\dev-space\AI\buddy-v2\data\hscode\.index
$env:LOG_LEVEL='debug'; pnpm build-index --topic hscode
```

- [ ] **Step 3: Inspect chapter07**

```bash
node -e "
const d = require('./data/hscode/.index/chapter07.tree.json');
function walk(nodes, depth=0) {
  for (const n of nodes) {
    console.log('  '.repeat(depth) + n.title + '  [s=' + n.start_index + ' e=' + n.end_index + ']');
    walk(n.nodes, depth+1);
  }
}
walk(d.structure);
"
```

Expected:
- Real headings still present (CHIPPING POTATOES, ROUND DRUMHEAD, CHINESE MUSTARD, FRENCH BEANS)
- The previously-stripped fake-heading chain now appears in the tree (Cabbage, CABBAGE, DESCRIPTION, BRASSICA, OLERACEA, SPECIES), each anchored to the physical page where its word appears in extracted text
- SPECIES no longer an orphan root — now a descendant of the parent chain since OLERACEA isn't filtered anymore
- CHAPTER 7 root still spans physical 1-9
- No `[validateIndices] ... regressed; clearing ...` warnings in the log (the warnings were emitted from the now-deleted code)

- [ ] **Step 4: Sanity check across all chapters**

```bash
for c in chapter01 chapter02 chapter03 chapter06 chapter07 chapter08 chapter09 chapter10 chapter12 chapter13 introduction; do
  if [ -f "data/hscode/.index/$c.tree.json" ]; then
    echo "=== $c ==="
    node -e "const d=require('./data/hscode/.index/$c.tree.json'); console.log('roots:', d.structure.length, 'first title:', d.structure[0]?.title);"
  fi
done
```

Expected: every chapter has at least one root, real headings still present. Tree may be larger than before (extra entries kept) but no regressions in real content.

- [ ] **Step 5: Document anomalies**

Note in scratch which chapters look notably noisier and which got cleaner. This feeds into the next plan (resolver parent-aware matching).

---

## Task 5: Final verification + memory update

- [ ] **Step 1: Typecheck + lint + all tests**

```bash
pnpm -r typecheck
pnpm lint
pnpm -r test
```

Expected: all green. Net test count ≈ unchanged (a few flipped tests, +1 integration test, no removals).

- [ ] **Step 2: Update memory** in `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` under `## Status (auto-updated)`:

```
- 2026-MM-DD: Plan align-validate-with-pageindex complete. validateIndices simplified to single range check matching PageIndex Case 6.5; deleted our extra physical/logical monotonicity stripping (was destroying faithful resolver placements). Orphan handling per PageIndex Case 33 already supported by buildTree — no change needed there. Tests flipped: regressing entries now kept, not stripped. Dogfood retry on hscode: <observations — note tree size deltas, real headings preservation, any new edge cases>. Known residual: resolver still mis-anchors repeated titles (e.g. CHINESE MUSTARD to page 7 instead of page 2) — separate plan. Total tests: <NN>.
```

- [ ] **Step 3: Final commit**

```bash
git add docs/superpowers/plans/2026-05-28-align-validate-with-pageindex.md
git commit -m "chore(plan): align validateIndices with PageIndex spec"
```

---

## Self-Review Notes (author)

- **Faithfulness to PageIndex:** the only behavior remaining matches `validate_and_truncate_physical_indices` in PageIndex (Case 6.5). Orphans (Case 33) are an explicit non-bug per the spec; our buildTree already handles them.
- **What we lose:** the regression warnings that flagged "LLM produced something we don't like". Those warnings were misleading — they pointed at resolver-correct placements that didn't fit our monotonicity assumption. Losing them is fine.
- **What we gain:** trees contain everything LLM detected, anchored to real text positions. Tree noise increases for hscode chapters (5 extra entries per chapter on average), but no real headings are lost. Better signal for the next round of debugging.
- **Resolver still has bugs.** CHINESE MUSTARD on page 7 (should be page 2) is unaddressed by this plan — it's a resolver issue, separate fix. This plan ONLY removes our overzealous validate stripping.
- **No new abstractions, no new files.** Smallest possible change to revert the deviation. Two files touched (one source, one test).
- **Type consistency:** `delete out.physical_index` works because TypeScript's `Partial<FlatTocEntry>` shape allows undefined optional fields. The shallow copy via spread is safe.
- **Caveats for the engineer:**
  - When flipping tests in Task 2, do NOT also delete the test cases. The input data is useful coverage. Only flip assertions + rename.
  - Task 4's dogfood will produce noisier trees. That is the expected outcome, not a regression. Document in the memory entry which chapters got noticeably bigger.
  - If `pnpm lint` complains about unused imports (e.g. `console.warn` no longer used), clean them up but don't restructure the function.
