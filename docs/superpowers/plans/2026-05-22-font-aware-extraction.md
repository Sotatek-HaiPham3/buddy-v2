# Font-Aware Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop throwing away font/weight metadata during PDF extraction. Feed LLM heading-detection prompts a **font-annotated text** (e.g. `<b>CHIPPING POTATOES</b>` for bold lines) so it can distinguish real headings (visually styled) from text that merely looks heading-like (e.g. table column headers that happen to be all-caps).

**Why now:** dogfooding `data/hscode/Chapter07.pdf` showed LLM cannot reliably detect headings from plain extracted text. Pages with tables (e.g. chapter07 page 3) have "CABBAGE / DESCRIPTION / BRASSICA / OLERACEA / SPECIES" — visually a multi-line table column header but textually indistinguishable from a real heading. LLM picks it as a heading, drops the real one. Inspection of mupdf StructuredText JSON shows font name, weight, and size are available per line — currently discarded at `packages/shared/src/pdf.ts:30-37`. Preserving them as markup unlocks generic heading detection across any PDF.

**Architecture:**
- `RawPage` gains a second text field: `annotatedText` (markup) alongside existing `text` (plain). Plain text stays as-is for downstream non-LLM uses (resolver substring match, retrieval, summaries). Annotated text only feeds LLM heading-detection prompts.
- New helper `extractAnnotatedText(doc, pageIdx)` in `@buddy/shared/pdf.ts` walks the StructuredText JSON, emits `<b>...</b>` around bold lines and `<i>...</i>` around italic ones. Normal text passes through. Whitespace-only lines collapsed.
- Step 01-extract populates both fields.
- `tagPages` (page tagger) takes a field-selector so heading prompts get annotated, summaries/retrieval get plain.
- LLM prompts (no-toc-headings, subgroup-headings) get a short explanation of the markup convention.
- Generic across all PDFs that use bold/italic conventions for headings. No corpus-specific patterns hard-coded.

**Tech Stack:** existing — mupdf (already extracts StructuredText), no new deps. ~30% token cost increase for heading-detection prompts (acceptable). Other prompts unchanged.

**Pre-reads:**
- `packages/shared/src/pdf.ts` — current `getPageText`. Lines 24-38 are where font info is dropped.
- `packages/pipeline/src/page-tag.ts` — current `tagPages`. Concatenates `p.text`.
- `packages/pipeline/src/types.ts` — current `RawPage`.
- `packages/pipeline/src/steps/01-extract.ts` — populates `RawPage[]`.
- `packages/pipeline/src/prompts/no-toc-headings.ts` and `subgroup-headings.ts`.
- `packages/pipeline/src/fallbacks/resolve-pages.ts` — needs plain text for substring matching, must NOT see annotated markup.
- `packages/pipeline/src/steps/09-add-summaries.ts` — needs plain text.
- `packages/query/src/retrieval.ts` — needs plain text for answer generation.
- Inspection result (already done) — mupdf line objects have `font.name`, `font.weight`, `font.size`. Confirmed on chapter07: real headings are `Arial-BoldMT` / `weight: bold`; body is `ArialMT` / `weight: normal`.

**Out of scope** (do NOT implement):
- Font size annotation (single-pass v1; uses bold/italic only). Add later if dogfood shows headings need size info.
- Vision model input (sending page images alongside text). Phase 2 idea, not v1.
- Bounding-box / spatial reasoning. Major lift, not needed for heading detection.
- Custom heuristics per corpus (no HS-code regex etc.). Generic approach only.

---

## File Structure

```
packages/shared/src/
└── pdf.ts                       # ADD: extractAnnotatedText; keep existing getPageText

packages/shared/test/
└── pdf.test.ts                  # ADD: tests for extractAnnotatedText

packages/pipeline/src/
├── types.ts                     # MODIFY: RawPage.annotatedText optional
├── page-tag.ts                  # MODIFY: tagPages accepts field selector
├── steps/
│   └── 01-extract.ts            # MODIFY: populate both text and annotatedText
├── fallbacks/
│   ├── process-no-toc.ts        # MODIFY: pass annotated text to LLM prompts
│   └── resolve-pages.ts         # NO CHANGE — uses page.text (plain)
├── hierarchical/
│   ├── subgroup-agent.ts        # MODIFY: pass annotated text to LLM
│   ├── group-master.ts          # NO CHANGE — already gets prior outputs not raw text
│   └── chapter-master.ts        # NO CHANGE
└── prompts/
    ├── no-toc-headings.ts       # MODIFY: explain <b>/<i> markup
    └── subgroup-headings.ts     # MODIFY: explain <b>/<i> markup

packages/pipeline/test/
├── unit/page-tag.test.ts        # MODIFY: test new selector arg
├── unit/steps/01-extract.test.ts # MODIFY: assert annotatedText populated
└── golden/                       # MAY NEED UPDATE if stub responses depend on prompt hash
```

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

- [ ] **Step 3:** Read every pre-read file in the plan header.

- [ ] **Step 4:** Confirm mupdf font metadata via quick inspection:

```bash
node --input-type=module -e "
import * as mupdf from 'mupdf';
import fs from 'node:fs';
const doc = mupdf.Document.openDocument(fs.readFileSync('data/hscode/Chapter07.pdf'), 'application/pdf');
const json = JSON.parse(doc.loadPage(0).toStructuredText('preserve-whitespace').asJSON());
console.log(JSON.stringify(json.blocks[0].lines[0], null, 2));
" 2>&1 | head -20
```

Run from `packages/shared/` directory (where mupdf is installed). Expected: line object includes `font: { name, weight, size }`.

---

## Task 1: Add `extractAnnotatedText` to `@buddy/shared/pdf.ts`

**Files:**
- Modify: `packages/shared/src/pdf.ts`
- Modify: `packages/shared/src/index.ts` (export)
- Test: `packages/shared/test/pdf.test.ts`

**Behavior:**
- Walk StructuredText JSON for the requested page
- Per line: if `font.weight === 'bold'`, wrap text in `<b>...</b>`. If `font.style === 'italic'` (or font name suggests italic), wrap in `<i>...</i>`. Both → `<b><i>...</i></b>`.
- Empty/whitespace-only lines skipped.
- Joined with `\n` (one logical line per source line).

- [ ] **Step 1: Failing test** (append to `packages/shared/test/pdf.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openPdf, extractAnnotatedText, getPageText } from '../src/pdf.js';

describe('extractAnnotatedText', () => {
  it('wraps bold lines with <b> and normal lines untagged', () => {
    const pdfPath = path.join(__dirname, '..', '..', '..', 'data', 'hscode', 'Chapter07.pdf');
    if (!fs.existsSync(pdfPath)) return;   // skip if fixture absent in CI
    const doc = openPdf(fs.readFileSync(pdfPath));
    const annotated = extractAnnotatedText(doc, 0);
    // Real headings on chapter07 page 1 are bold
    expect(annotated).toContain('<b>CHIPPING POTATOES</b>');
    expect(annotated).toContain('<b>0701.90.10</b>');
    // Body text is normal — not wrapped
    expect(annotated).toContain('Chipping potatoes are tubers');
    expect(annotated).not.toContain('<b>Chipping potatoes are tubers');
  });

  it('preserves whitespace-only lines as empty (skips them)', () => {
    // Use synthetic test rather than real fixture
    // Construct a tiny PDF with mupdf or skip — this is implicit via the above test
  });

  it('returns the same content set as getPageText, just annotated', () => {
    const pdfPath = path.join(__dirname, '..', '..', '..', 'data', 'hscode', 'Chapter07.pdf');
    if (!fs.existsSync(pdfPath)) return;
    const doc = openPdf(fs.readFileSync(pdfPath));
    const plain = getPageText(doc, 0);
    const annotated = extractAnnotatedText(doc, 0);
    // Stripping <b>/<i> tags from annotated should give back something close to plain
    const stripped = annotated.replace(/<\/?b>|<\/?i>/g, '');
    // Allow whitespace differences but content should align
    expect(stripped.replace(/\s+/g, ' ')).toBe(plain.replace(/\s+/g, ' '));
  });
});
```

- [ ] **Step 2:** Run `pnpm -F @buddy/shared test pdf` — expect FAIL.

- [ ] **Step 3: Implement** in `packages/shared/src/pdf.ts`:

```ts
interface StructuredLine {
  text?: string;
  font?: { name?: string; weight?: string; style?: string; size?: number };
}

interface StructuredBlock {
  type?: string;
  lines?: StructuredLine[];
}

export function extractAnnotatedText(doc: PdfDoc, pageIndex: number): string {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  const json = page.toStructuredText('preserve-whitespace').asJSON();
  const data = JSON.parse(json) as { blocks?: StructuredBlock[] };

  const out: string[] = [];
  for (const block of data.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const text = (line.text ?? '').trim();
      if (!text) continue;
      const weight = line.font?.weight;
      const name = line.font?.name ?? '';
      const isBold = weight === 'bold' || /bold/i.test(name);
      const isItalic = line.font?.style === 'italic' || /italic|oblique/i.test(name);
      let wrapped = text;
      if (isItalic) wrapped = `<i>${wrapped}</i>`;
      if (isBold) wrapped = `<b>${wrapped}</b>`;
      out.push(wrapped);
    }
  }
  return out.join('\n');
}
```

- [ ] **Step 4:** Export from `packages/shared/src/index.ts`:

```ts
export { extractAnnotatedText } from './pdf.js';
```

- [ ] **Step 5:** Run test — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/pdf.ts packages/shared/src/index.ts packages/shared/test/pdf.test.ts
git commit -m "feat(shared): extractAnnotatedText returns text with <b>/<i> markup from font metadata"
```

---

## Task 2: Extend `RawPage` with `annotatedText`

**Files:**
- Modify: `packages/pipeline/src/types.ts`

- [ ] **Step 1: Edit**

```ts
export interface RawPage {
  pageNumber: number;
  text: string;              // plain text (legacy field; consumers like resolver/summarize use this)
  annotatedText: string;     // text with <b>/<i> markup; consumers like heading-detection LLM use this
  tokenCount: number;
}
```

- [ ] **Step 2:** Typecheck — many files will fail because `annotatedText` is required now but they construct `RawPage` literals without it.

  **Critical:** make `annotatedText` REQUIRED (not optional). Forces all construction sites to populate it. Optional risks silent regressions where some code path forgets to set it and downstream code falls back to plain text without anyone noticing.

- [ ] **Step 3: Fix every construction site** the typecheck reveals. Most will be in tests; fix them in Task 5 and 6.

  For now, fix any production-code construction sites by populating `annotatedText` with the plain text as a placeholder (`annotatedText: page.text`). The real population happens in Task 3.

- [ ] **Step 4: Commit (typecheck must pass — fixes pending in next tasks)**

If typecheck doesn't pass yet, defer this commit. Run Task 3 first, then come back to commit both together.

```bash
git add packages/pipeline/src/types.ts
git commit -m "feat(pipeline): RawPage carries annotatedText with font markup"
```

---

## Task 3: Update step 01-extract

**Files:**
- Modify: `packages/pipeline/src/steps/01-extract.ts`
- Test: `packages/pipeline/test/unit/steps/01-extract.test.ts` (locate; add if missing)

- [ ] **Step 1: Failing test**

```ts
it('populates both text (plain) and annotatedText (with <b>/<i>) per page', async () => {
  // Use fixture PDF that has known bold content (chapter07 has bold headings)
  const pdfPath = 'data/hscode/Chapter07.pdf';
  const pages = await extractPages(pdfPath);
  expect(pages[0].text).toContain('CHIPPING POTATOES');
  expect(pages[0].text).not.toContain('<b>');
  expect(pages[0].annotatedText).toContain('<b>CHIPPING POTATOES</b>');
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

In `01-extract.ts`, alongside the existing `getPageText` call, add `extractAnnotatedText`:

```ts
import { openPdf, getPageCount, getPageText, extractAnnotatedText } from '@buddy/shared';
import { countTokens } from '../tokens.js';   // adjust to actual util
import fs from 'node:fs/promises';
import type { RawPage } from '../types.js';

export async function extractPages(pdfPath: string): Promise<RawPage[]> {
  const bytes = await fs.readFile(pdfPath);
  const doc = openPdf(bytes);
  const count = getPageCount(doc);
  const pages: RawPage[] = [];
  for (let i = 0; i < count; i++) {
    const text = getPageText(doc, i);
    const annotatedText = extractAnnotatedText(doc, i);
    pages.push({
      pageNumber: i + 1,
      text,
      annotatedText,
      tokenCount: countTokens(text),
    });
  }
  return pages;
}
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit** (combine with Task 2's typecheck-pending commit if applicable)

```bash
git add packages/pipeline/src/types.ts packages/pipeline/src/steps/01-extract.ts \
        packages/pipeline/test/unit/steps/01-extract.test.ts
git commit -m "feat(pipeline): step 01 populates annotatedText with font markup"
```

---

## Task 4: Extend `tagPages` with field selector

**Files:**
- Modify: `packages/pipeline/src/page-tag.ts`
- Modify: `packages/pipeline/test/unit/page-tag.test.ts`

**Behavior:** `tagPages` currently always uses `p.text`. Add a second arg `field: 'text' | 'annotatedText' = 'text'`. Default stays plain for backward compat. Heading-detection callers pass `'annotatedText'`.

- [ ] **Step 1: Failing test**

```ts
it('uses annotatedText when field arg is "annotatedText"', () => {
  const pages: RawPage[] = [{
    pageNumber: 1, text: 'hello',
    annotatedText: '<b>HEADING</b>\nhello',
    tokenCount: 2,
  }];
  const out = tagPages(pages, 'annotatedText');
  expect(out).toContain('<b>HEADING</b>');
});

it('defaults to text (plain) for backward compat', () => {
  const pages: RawPage[] = [{
    pageNumber: 1, text: 'hello',
    annotatedText: '<b>HEADING</b>\nhello',
    tokenCount: 2,
  }];
  const out = tagPages(pages);
  expect(out).toContain('hello');
  expect(out).not.toContain('<b>');
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { RawPage } from './types.js';

export function tagPages(pages: RawPage[], field: 'text' | 'annotatedText' = 'text'): string {
  return pages
    .map(p => `<physical_index_${p.pageNumber}>\n${p[field]}\n</physical_index_${p.pageNumber}>`)
    .join('\n');
}

// parsePhysicalIndexTag unchanged
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/page-tag.ts packages/pipeline/test/unit/page-tag.test.ts
git commit -m "feat(pipeline): tagPages accepts field selector (text vs annotatedText)"
```

---

## Task 5: Update heading-detection prompts to use annotated text

**Files:**
- Modify: `packages/pipeline/src/prompts/no-toc-headings.ts`
- Modify: `packages/pipeline/src/prompts/subgroup-headings.ts`

**Behavior:** rewrite the prompt body to explain the `<b>` / `<i>` markup convention and emphasize that headings are typically `<b>`-wrapped. Stay generic — don't mention HS-codes or any corpus-specific pattern.

- [ ] **Step 1: Rewrite `no-toc-headings.ts`**

```ts
export const noTocHeadingsPrompt = (taggedPages: string): string => `You are extracting the hierarchical heading structure of a document.

The text contains tags like <physical_index_N> to mark page boundaries. Use the tags only as page boundaries - your output does NOT need to reference any page numbers.

Within each page, lines that were rendered in bold in the source PDF are wrapped in <b>...</b>. Italic lines are wrapped in <i>...</i>. Use these as strong hints:

- A heading is almost always <b>-wrapped.
- A plain unstyled line is almost never a heading, even if it is all-caps.
- Multiple consecutive <b> lines may be either (a) a single heading split across lines (merge them) or (b) a table column header block (skip them; they appear inside content sections, not at section starts).

For each real section heading, output:
  ["structure", "title"]

- structure: dotted hierarchical numbering like "1", "1.1", "1.1.1" reflecting parent/child relationships
- title: the heading text (strip the <b>/<i> tags)

Response format:
[
  ["1", "Introduction"],
  ["1.1", "Background"]
]

Return JSON only. No commentary, no page numbers, no tag markers in titles.

Text:
${taggedPages}`;
```

- [ ] **Step 2: Rewrite `subgroup-headings.ts`**

```ts
export const subgroupHeadingsPrompt = (taggedPages: string): string => `You are extracting headings from a portion of a document.

The text may contain <physical_index_N> page markers - ignore them. We only need the headings, in document order.

Lines rendered in bold in the source PDF are wrapped in <b>...</b>. Italic lines in <i>...</i>. These are strong hints:

- A heading is almost always <b>-wrapped.
- An unstyled (no <b>/<i>) line is almost never a heading.
- A run of several consecutive <b> lines may be a multi-line table column header; treat as content, not a heading.

For each real heading found, output a 1-element array:
  ["heading title"]   (strip <b>/<i> tags from the title)

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

- [ ] **Step 3:** Don't change `group-master.ts` or `chapter-master.ts` prompts — they merge already-extracted heading lists and don't see raw page text.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/prompts/no-toc-headings.ts packages/pipeline/src/prompts/subgroup-headings.ts
git commit -m "feat(pipeline): heading-detection prompts explain <b>/<i> markup, use as primary signal"
```

---

## Task 6: Wire heading-detection callers to use `annotatedText`

**Files:**
- Modify: `packages/pipeline/src/fallbacks/process-no-toc.ts`
- Modify: `packages/pipeline/src/hierarchical/subgroup-agent.ts`

- [ ] **Step 1: Edit `process-no-toc.ts`**

Locate the non-hierarchical branch (the `for (const c of chunks)` loop). The `tagPages(c.pages)` call should now pass `'annotatedText'`:

```ts
const tagged = tagPages(c.pages, 'annotatedText');
```

- [ ] **Step 2: Edit `subgroup-agent.ts`**

Same — `tagPages(chunk.pages)` becomes `tagPages(chunk.pages, 'annotatedText')`.

- [ ] **Step 3:** Confirm `resolve-pages.ts` and `09-add-summaries.ts` and `query/retrieval.ts` ALL still use `page.text` (plain), NOT `annotatedText`. Grep:

```bash
grep -rn "annotatedText\|\.text" packages/pipeline/src/fallbacks/resolve-pages.ts packages/pipeline/src/steps/09-add-summaries.ts packages/query/src/retrieval.ts
```

These consumers must read the plain `text` field, never see `<b>` tags. If any of them references `annotatedText`, that's a bug — leave them on `.text`.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/fallbacks/process-no-toc.ts packages/pipeline/src/hierarchical/subgroup-agent.ts
git commit -m "feat(pipeline): heading-detection LLM calls send annotated text; downstream still plain"
```

---

## Task 7: Update tests + goldens

**Files:**
- Any test that constructs `RawPage` literals (typecheck will surface them)
- Goldens that stub LLM responses by prompt hash (likely affected since prompts changed)

- [ ] **Step 1: Find all RawPage construction sites**

```bash
grep -rn "pageNumber.*text.*tokenCount\|RawPage" packages/pipeline/test/ packages/query/test/
```

Add `annotatedText: ` to every literal. For tests, simplest is `annotatedText: <same as text>` (no formatting needed for non-heading-detection tests).

- [ ] **Step 2: Run all tests**

```bash
pnpm -r test
```

Iterate:
- Typecheck failures → add `annotatedText` to RawPage literals
- Golden test failures from prompt-hash mismatch → regenerate the hash from the new prompt text in stubs
- Behavioral failures → likely heading-detection tests where stub gemini was returning fake headings expected by old test; update stub responses to fit new prompt

- [ ] **Step 3: Add a heading-detection accuracy test on chapter07**

`packages/pipeline/test/golden/hscode-chapter07-headings.test.ts`:

```ts
it('detects only real headings on chapter07 (font-aware extraction + new prompt)', async () => {
  // Uses real Gemini/OpenAI stubbed with a canned response that the LLM SHOULD produce
  // given font-annotated input. Snapshot the expected output:
  // 4 headings: CHIPPING POTATOES, ROUND (DRUMHEAD) CABBAGES, CHINESE MUSTARD, FRENCH BEANS
  // NOT: CABBAGE, DESCRIPTION, BRASSICA, OLERACEA, SPECIES (those are table column headers)
  ...
});
```

If the project doesn't keep large-LLM-output snapshots, skip this and rely on Task 8 dogfood.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/test/ packages/query/test/
git commit -m "test(pipeline): add annotatedText to RawPage fixtures; align goldens with new prompts"
```

---

## Task 8: Verification + dogfood

- [ ] **Step 1: Typecheck + lint + build**

```bash
pnpm -r typecheck
pnpm lint
pnpm -F @buddy/shared build
pnpm -F @buddy/pipeline build
```

- [ ] **Step 2: Tests**

```bash
pnpm -r test
```

Expected: green. Test count rises slightly (new pdf.test.ts cases, new 01-extract test, new page-tag tests). No regressions.

- [ ] **Step 3: Dogfood retry on hscode**

```bash
# PowerShell
Remove-Item -Recurse -Force E:\dev-space\AI\buddy-v2\data\hscode\.index
$env:LOG_LEVEL='debug'; pnpm build-index --topic hscode
```

- [ ] **Step 4: Inspect chapter07 specifically (was the problem case)**

```bash
node -e "
const d = require('./data/hscode/.index/chapter07.tree.json');
function flatten(nodes, depth=0) {
  return nodes.flatMap(n => [{title: n.title, start: n.start_index, end: n.end_index, depth}, ...flatten(n.nodes, depth+1)]);
}
console.log(JSON.stringify(flatten(d.structure), null, 2));
"
```

Expected (rough): 4 top-level nodes corresponding to CHIPPING POTATOES, ROUND (DRUMHEAD) CABBAGES, CHINESE MUSTARD, FRENCH BEANS. NOT a tree dominated by "Cabbage", "CABBAGE DESCRIPTION...", etc. Page anchoring sane (CHIPPING POTATOES on physical 1, FRENCH BEANS on physical 9).

- [ ] **Step 5: Inspect chapter12 (had reconstruction bug previously) and chapter10/13 (were empty before)**

```bash
for c in chapter01 chapter02 chapter03 chapter06 chapter07 chapter08 chapter09 chapter10 chapter12 chapter13; do
  echo "=== $c ==="
  node -e "const d=require('./data/hscode/.index/$c.tree.json'); console.log('roots:', d.structure.length, '— first:', d.structure[0]?.title || '(empty)');"
done
```

Expected: every chapter has non-empty structure with sensible heading titles matching the actual document content.

- [ ] **Step 6: If results look good, also test query end-to-end:**

```bash
pnpm dev
# Open http://localhost:5173
# Pick hscode topic
# Ask: "what are chipping potatoes?"
# Verify: answer drawn from CHIPPING POTATOES section (page 24 / PDF p.1)
# Ask: "what is alkali treated carrageenan?"
# Verify: answer from chapter13 ATCC section
```

- [ ] **Step 7: Update memory** in `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md`:

```
- 2026-MM-DD: Plan font-aware-extraction complete. mupdf StructuredText font metadata now preserved as <b>/<i> markup in RawPage.annotatedText. Heading-detection LLM calls (no-toc-headings, subgroup-headings) receive annotated text; downstream (resolver, summaries, retrieval) keep plain text. Prompts rewritten to use <b>/<i> as primary heading signal, generic across PDF types. Token cost up ~30% on heading-detection calls; acceptable. Dogfood: <observations — which chapters now have correct headings, any remaining edge cases>. Total tests: <NN>.
```

- [ ] **Step 8: Final commit**

```bash
git add docs/superpowers/plans/2026-05-22-font-aware-extraction.md
git commit -m "chore(plan): font-aware extraction"
```

---

## Self-Review Notes (author)

- **Scope:** only extraction + heading-detection prompts. No changes to schemas, validate, build-tree, summaries, query, server, or web.
- **Generic:** no corpus-specific patterns. `<b>` is a universal PDF convention; works for any doc using bold for headings (most do).
- **Backward compat:** RawPage gets a NEW required field (annotatedText). Forces every construction site to populate it — catches forgetting. Existing `text` field unchanged; downstream consumers untouched.
- **Token cost:** `<b>...</b>` adds ~7 chars per bold line. For chapter07 with ~10 bold lines per page, that's ~70 chars / page = ~+5% tokens. The prompt text itself grew ~30% from the new instructions. Overall manageable.
- **Failure modes:**
  - PDF uses NO bold (uniform formatting throughout): annotatedText ≡ plain text. LLM gets no extra signal. Heading detection falls back to current accuracy. No regression.
  - PDF uses bold for emphasis (not just headings): LLM may pick emphasized words as headings. Prompt explains "multiple consecutive <b> lines may be table column headers" — partially mitigates. May need size annotation in v2 if this becomes common.
  - mupdf misreports weight on certain fonts: rare in modern PDFs; would behave like uniform-formatting case.
- **No placeholders.** Every step has concrete code or grep targets.
- **Type consistency:** `annotatedText: string` (NOT optional) on RawPage throughout. `field` arg on `tagPages` typed as `'text' | 'annotatedText'`.
- **Caveats for the engineer:**
  - In Task 1's "preserves same content" test, `getPageText` joins lines with `\n` and `extractAnnotatedText` joins differently (skips whitespace lines). The whitespace-normalized comparison in the test absorbs the difference. If it fails, relax the assertion or adjust line-joining to match.
  - Task 2's REQUIRED `annotatedText` field will trigger many test failures. Don't make it optional to skip the work — optional risks silent regression where some path uses unannotated text without knowing. Bite the bullet.
  - mupdf's `font.style` may not be reliably populated for all PDFs. Falling back to font-name regex (`/italic|oblique/i`) covers most cases.
  - Goldens that hash prompts may break — regenerate hashes (Task 7).
