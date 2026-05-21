# Pipeline Multimodal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image and document-table extraction to `@buddy/pipeline` so trees produced by `buildDoc` carry `images: ImageRef[]` and `tables: TableRef[]` on the deepest containing node.

**Architecture:** Two new sub-pipelines (`image/` and `table/`) run alongside text extraction. Each produces typed records keyed by page number. A new `multimodal/attach.ts` merges them into the tree at step 10 via the spec's deepest-containing-node rule. Vision LLM calls reuse the existing `GeminiClient` (text+vision unified) with the model from `cfg.geminiVisionModel`. All MuPDF work uses helpers already in `@buddy/shared/pdf` (extending where needed).

**Tech Stack:** `mupdf-js` (already wrapped in `@buddy/shared/pdf.ts`), Gemini Vision via existing `ContentPart` with `inlineData`, `zod` schemas already in `@buddy/shared/schemas/tree.ts` (`imageRefSchema`, `tableRefSchema`), `p-limit` pool, vitest + LLM stubs + fixture PDFs.

**Pre-reads for the engineer (zero-context):**
- Spec: `docs/superpowers/specs/2026-05-21-buddy-design.md` sections **4.4 Image Pipeline**, **4.5 Table Pipeline**, **4.6 Caching**, **8 Shared schemas**.
- Reference: `invest-page-index/docs/image-solution.md` and `invest-page-index/docs/image-solution-concept.md`.
- Reference: `invest-page-index/table-process/pipelines/document-tables.md`.
- Existing code: `packages/pipeline/src/orchestrator.ts`, `packages/pipeline/src/steps/10-output-json.ts`, `packages/shared/src/pdf.ts`, `packages/shared/src/schemas/tree.ts`, `packages/shared/src/llm/types.ts`.
- Plan 1 + 2 commit history (`git log --oneline`) — same TDD + commit-per-step rhythm.

---

## File Structure

```
packages/pipeline/src/
├── image/
│   ├── types.ts                # DetectedImage, SavedImage, DescribedImage
│   ├── detect-embedded.ts      # MuPDF StructuredText → bytes + bbox
│   ├── detect-via-vision.ts    # Vision LLM bbox detection on rendered page
│   ├── crop.ts                 # crop pixmap region by bbox
│   ├── save.ts                 # write png + sidecar json to images dir
│   ├── describe.ts             # Vision LLM describe → caption string
│   └── pipeline.ts             # orchestrate per-page: detect → crop → save → describe
├── table/
│   ├── types.ts                # DetectedTable, SavedTable
│   ├── detect.ts               # MuPDF block-layout heuristic table region detection
│   ├── normalize.ts            # LLM normalize raw cells → headers + rows + schema
│   ├── save.ts                 # write json to tables dir
│   └── pipeline.ts             # orchestrate per-page: detect → normalize → save
├── multimodal/
│   └── attach.ts               # attach images + tables to deepest tree node containing page
└── prompts/
    ├── detect-image-bbox.ts
    ├── describe-image.ts
    └── normalize-table.ts

packages/shared/src/
├── paths.ts                    # ADD: resolveDocTablesDir, resolveDocImagesDir (mirror)
└── pdf.ts                      # ADD: renderPageRaw (returns Buffer+w+h), cropImage (PNG region)

packages/pipeline/test/
├── image/
│   ├── detect-embedded.test.ts
│   ├── detect-via-vision.test.ts
│   ├── crop.test.ts
│   ├── save.test.ts
│   ├── describe.test.ts
│   └── pipeline.test.ts
├── table/
│   ├── detect.test.ts
│   ├── normalize.test.ts
│   └── pipeline.test.ts
├── multimodal/
│   └── attach.test.ts
└── golden/
    ├── small-with-image.test.ts
    └── small-with-table.test.ts
```

**Out of scope for this plan** (do NOT implement): cross-document table unification, CSV/Excel ingestion, OCR for fully scanned PDFs beyond Vision-LLM bbox fallback, multi-page table merging. Per spec §13.

---

## Task 0: Prereqs

- [ ] **Step 1:** Confirm plan 1 + 2 shipped:

```bash
cd E:/dev-space/AI/buddy-v2
git log --oneline | grep -E "plan 2|plan 1"
pnpm -F @buddy/pipeline test   # expect 106 green
```

Expected: plan-2 commit present, all tests green.

- [ ] **Step 2:** Read all spec/reference docs listed in plan header.

- [ ] **Step 3:** Confirm node version + tooling:

```bash
node --version    # >= 20
pnpm --version    # >= 9
```

---

## Task 1: Extend shared paths

**Files:**
- Modify: `packages/shared/src/paths.ts`
- Test: `packages/shared/test/paths.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/shared/test/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveDocImagesDir, resolveDocTablesDir } from '../src/paths.js';

describe('resolveDocImagesDir', () => {
  it('returns <dataDir>/<topic>/.index/<docId>/images', () => {
    expect(resolveDocImagesDir('data', 'tax', 'd1'))
      .toBe('data/tax/.index/d1/images'.replaceAll('/', require('node:path').sep));
  });
});

describe('resolveDocTablesDir', () => {
  it('returns <dataDir>/<topic>/.index/<docId>/tables', () => {
    expect(resolveDocTablesDir('data', 'tax', 'd1'))
      .toBe('data/tax/.index/d1/tables'.replaceAll('/', require('node:path').sep));
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/shared test paths` — expect FAIL (unresolved imports).

- [ ] **Step 3: Implement**

In `packages/shared/src/paths.ts` add:

```ts
export const resolveDocImagesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, 'images');

export const resolveDocTablesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, 'tables');
```

**Note:** the existing `resolveImagesDir` (`.index/images/<docId>`) is keep-as-is for backward-compat with plan 1; new pipelines use the per-doc-scoped variant which matches the spec layout `<doc>/images/`.

Also export from `packages/shared/src/index.ts`:

```ts
export { resolveDocImagesDir, resolveDocTablesDir } from './paths.js';
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/shared test paths` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/paths.ts packages/shared/src/index.ts packages/shared/test/paths.test.ts
git commit -m "feat(shared): per-doc image+table dir resolvers"
```

---

## Task 2: Extend shared pdf with renderPage + cropImage

**Files:**
- Modify: `packages/shared/src/pdf.ts`
- Test: `packages/shared/test/pdf.test.ts`

**Why:** image-via-vision path needs the rendered page bytes plus width/height to convert percentage bboxes → pixels. crop is also reused by image/crop.ts.

- [ ] **Step 1: Write failing tests**

Append to `packages/shared/test/pdf.test.ts`:

```ts
import { renderPage, cropPng } from '../src/pdf.js';

describe('renderPage', () => {
  it('returns PNG buffer plus pixel dimensions', () => {
    const doc = openPdf(fixturePdfBytes);
    const r = renderPage(doc, 0, 2.0);
    expect(r.png.length).toBeGreaterThan(100);
    expect(r.png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG magic
    expect(r.widthPx).toBeGreaterThan(0);
    expect(r.heightPx).toBeGreaterThan(0);
  });
});

describe('cropPng', () => {
  it('crops a region given pixel bbox and returns valid PNG', async () => {
    const doc = openPdf(fixturePdfBytes);
    const r = renderPage(doc, 0, 2.0);
    const cropped = await cropPng(r.png, { x: 0, y: 0, w: 50, h: 50 });
    expect(cropped.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('clamps bbox to image bounds', async () => {
    const doc = openPdf(fixturePdfBytes);
    const r = renderPage(doc, 0, 2.0);
    const cropped = await cropPng(r.png, { x: -10, y: -10, w: r.widthPx + 100, h: r.heightPx + 100 });
    expect(cropped.length).toBeGreaterThan(0);
  });
});
```

(`fixturePdfBytes` reuse the existing fixture helper from plan 1's `pdf.test.ts`.)

- [ ] **Step 2:** Run: `pnpm -F @buddy/shared test pdf` — expect FAIL.

- [ ] **Step 3: Install pngjs**

```bash
pnpm -F @buddy/shared add pngjs
pnpm -F @buddy/shared add -D @types/pngjs
```

- [ ] **Step 4: Implement**

In `packages/shared/src/pdf.ts` append:

```ts
import { PNG } from 'pngjs';

export interface PageRender {
  png: Buffer;
  widthPx: number;
  heightPx: number;
}

export function renderPage(doc: PdfDoc, pageIndex: number, scale = 2.0): PageRender {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pixmap.asPNG());
  return { png, widthPx: pixmap.getWidth(), heightPx: pixmap.getHeight() };
}

export interface PixelBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function cropPng(png: Buffer, bbox: PixelBbox): Promise<Buffer> {
  const src = PNG.sync.read(png);
  const x = Math.max(0, Math.floor(bbox.x));
  const y = Math.max(0, Math.floor(bbox.y));
  const w = Math.max(1, Math.min(src.width - x, Math.floor(bbox.w)));
  const h = Math.max(1, Math.min(src.height - y, Math.floor(bbox.h)));
  const dst = new PNG({ width: w, height: h });
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * src.width + x) * 4;
    const dstStart = row * w * 4;
    src.data.copy(dst.data, dstStart, srcStart, srcStart + w * 4);
  }
  return PNG.sync.write(dst);
}
```

Export from `packages/shared/src/index.ts`:

```ts
export { renderPage, cropPng, type PageRender, type PixelBbox } from './pdf.js';
```

- [ ] **Step 5:** Run: `pnpm -F @buddy/shared test pdf` — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/pdf.ts packages/shared/src/index.ts packages/shared/test/pdf.test.ts packages/shared/package.json
git commit -m "feat(shared): renderPage + cropPng helpers"
```

---

## Task 3: image types

**Files:**
- Create: `packages/pipeline/src/image/types.ts`

- [ ] **Step 1: Write**

```ts
export interface DetectedImage {
  page: number;                    // 1-indexed (matches RawPage.pageNumber)
  source: 'embedded' | 'vision';
  bbox: { x: number; y: number; w: number; h: number };  // pixel coords on rendered page (scale 2.0)
  bytes: Buffer;
  mime: string;
}

export interface SavedImage extends DetectedImage {
  path: string;          // absolute path to saved png
  sidecarPath: string;   // absolute path to <basename>.json
  idx: number;           // index within page
}

export interface DescribedImage extends SavedImage {
  caption: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/image/types.ts
git commit -m "feat(pipeline): image types"
```

---

## Task 4: image/detect-embedded

**Files:**
- Create: `packages/pipeline/src/image/detect-embedded.ts`
- Test: `packages/pipeline/test/image/detect-embedded.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { openPdf } from '@buddy/shared';
import { detectEmbeddedImages } from '../../src/image/detect-embedded.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

async function fixturePdfWithImage(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 400]);
  // 10x10 red PNG
  const png = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 255;
  }
  const pngBuf = PNG.sync.write(png);
  const img = await pdf.embedPng(pngBuf);
  page.drawImage(img, { x: 50, y: 50, width: 100, height: 100 });
  return Buffer.from(await pdf.save());
}

describe('detectEmbeddedImages', () => {
  let bytes: Buffer;
  beforeAll(async () => { bytes = await fixturePdfWithImage(); });

  it('returns one embedded image with bytes + bbox', () => {
    const doc = openPdf(bytes);
    const out = detectEmbeddedImages(doc, 1);   // page 1 (1-indexed)
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('embedded');
    expect(out[0].bytes.length).toBeGreaterThan(0);
    expect(out[0].bbox.w).toBeGreaterThan(0);
    expect(out[0].page).toBe(1);
  });

  it('returns empty array for page without images', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);   // no image
    const doc = openPdf(Buffer.from(await pdf.save()));
    expect(detectEmbeddedImages(doc, 1)).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test detect-embedded` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { extractEmbeddedImages, type PdfDoc } from '@buddy/shared';
import type { DetectedImage } from './types.js';

export function detectEmbeddedImages(doc: PdfDoc, page: number): DetectedImage[] {
  const raw = extractEmbeddedImages(doc, page - 1);    // shared uses 0-indexed
  return raw.map((r) => ({
    page,
    source: 'embedded' as const,
    bbox: r.bbox,
    bytes: r.bytes,
    mime: r.mime,
  }));
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test detect-embedded` — expect PASS.

  **Note:** if `mupdf-js`'s `preserve-images` variant does not embed `image.data` in JSON for the installed version, fall back to using `page.getImages()` (or equivalent) and update the helper in `@buddy/shared/pdf.ts:extractEmbeddedImages`. Tests pin the public contract; adjust the wrapper.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/image/detect-embedded.ts packages/pipeline/test/image/detect-embedded.test.ts
git commit -m "feat(pipeline): detect embedded images via mupdf"
```

---

## Task 5: prompts/detect-image-bbox + prompts/describe-image

**Files:**
- Create: `packages/pipeline/src/prompts/detect-image-bbox.ts`
- Create: `packages/pipeline/src/prompts/describe-image.ts`

- [ ] **Step 1: Write `detect-image-bbox.ts`**

```ts
export const detectImageBboxPrompt = (): string => `You are inspecting a page rendered from a PDF.

List every visual element (chart, diagram, photo, infographic) on the page. Skip pure text and plain tables.

For each, give the bounding box as percentages of the page (top-left origin). top/left/width/height in [0,100].

Return JSON only:
{
  "visual_elements": [
    { "type": "chart|diagram|photo|infographic", "bbox": { "top": 0, "left": 0, "width": 0, "height": 0 }, "hint": "<one-line hint>" }
  ]
}

If no visual elements: { "visual_elements": [] }`;
```

- [ ] **Step 2: Write `describe-image.ts`**

```ts
export const describeImagePrompt = (): string => `Describe the visual element in exhaustive detail.

- Charts/graphs: title, axis labels, every data point with values, legend, trends.
- Diagrams/flowcharts: every node text, all edges with directions, decision branches.
- Infographics: every statistic, all text, icon meanings.
- Photos/illustrations: subject, visible text, context.

Return plain text. No markdown. No preface like "This image shows". Start with the substance.`;
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/prompts/detect-image-bbox.ts packages/pipeline/src/prompts/describe-image.ts
git commit -m "feat(pipeline): image vision prompts"
```

---

## Task 6: image/detect-via-vision

**Files:**
- Create: `packages/pipeline/src/image/detect-via-vision.ts`
- Test: `packages/pipeline/test/image/detect-via-vision.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createStubGemini } from '@buddy/shared';
import { detectViaVision } from '../../src/image/detect-via-vision.js';

describe('detectViaVision', () => {
  it('parses bbox percentages and converts to pixel bbox', async () => {
    const gemini = createStubGemini({
      responses: [{
        text: JSON.stringify({
          visual_elements: [
            { type: 'chart', bbox: { top: 10, left: 20, width: 30, height: 40 }, hint: 'sales chart' },
          ],
        }),
      }],
    });
    const png = Buffer.from('fakepng');
    const out = await detectViaVision({
      gemini, page: 3, pageRender: { png, widthPx: 1000, heightPx: 2000 },
    });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('vision');
    expect(out[0].page).toBe(3);
    expect(out[0].bbox).toEqual({ x: 200, y: 200, w: 300, h: 800 });
    expect(out[0].bytes).toEqual(png);   // raw page bytes (cropped later)
  });

  it('returns empty array when LLM finds nothing', async () => {
    const gemini = createStubGemini({ responses: [{ text: JSON.stringify({ visual_elements: [] }) }] });
    const out = await detectViaVision({
      gemini, page: 1, pageRender: { png: Buffer.from(''), widthPx: 100, heightPx: 100 },
    });
    expect(out).toEqual([]);
  });

  it('tolerates malformed JSON by returning empty array', async () => {
    const gemini = createStubGemini({ responses: [{ text: 'not json' }] });
    const out = await detectViaVision({
      gemini, page: 1, pageRender: { png: Buffer.from(''), widthPx: 100, heightPx: 100 },
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test detect-via-vision` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { GeminiClient, PageRender } from '@buddy/shared';
import { detectImageBboxPrompt } from '../prompts/detect-image-bbox.js';
import { parseJson } from '../json-utils.js';
import type { DetectedImage } from './types.js';

interface Opts {
  gemini: GeminiClient;
  page: number;
  pageRender: PageRender;
  visionModel?: string;
}

interface RawElement {
  bbox?: { top?: number; left?: number; width?: number; height?: number };
}

export async function detectViaVision(opts: Opts): Promise<DetectedImage[]> {
  const r = await opts.gemini.generate(
    [
      detectImageBboxPrompt(),
      { inlineData: { data: opts.pageRender.png.toString('base64'), mimeType: 'image/png' } },
    ],
    opts.visionModel ? { model: opts.visionModel } : undefined,
  );

  let parsed: { visual_elements?: RawElement[] } | null;
  try { parsed = parseJson(r.text); } catch { return []; }
  const elements = parsed?.visual_elements ?? [];

  return elements
    .filter((e) => e.bbox && Number.isFinite(e.bbox.top) && Number.isFinite(e.bbox.left)
                                 && Number.isFinite(e.bbox.width) && Number.isFinite(e.bbox.height))
    .map((e) => ({
      page: opts.page,
      source: 'vision' as const,
      bbox: {
        x: Math.round((e.bbox!.left! / 100) * opts.pageRender.widthPx),
        y: Math.round((e.bbox!.top! / 100) * opts.pageRender.heightPx),
        w: Math.round((e.bbox!.width! / 100) * opts.pageRender.widthPx),
        h: Math.round((e.bbox!.height! / 100) * opts.pageRender.heightPx),
      },
      bytes: opts.pageRender.png,
      mime: 'image/png',
    }));
}
```

  **Note:** `parseJson` is the existing helper in `packages/pipeline/src/json-utils.ts` (used throughout plan 2). It already strips ```json fences.

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test detect-via-vision` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/image/detect-via-vision.ts packages/pipeline/test/image/detect-via-vision.test.ts
git commit -m "feat(pipeline): vision LLM bbox detection"
```

---

## Task 7: image/crop

**Files:**
- Create: `packages/pipeline/src/image/crop.ts`
- Test: `packages/pipeline/test/image/crop.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { cropDetected } from '../../src/image/crop.js';
import type { DetectedImage } from '../../src/image/types.js';

function blankPng(w: number, h: number): Buffer {
  return PNG.sync.write(new PNG({ width: w, height: h }));
}

describe('cropDetected', () => {
  it('returns embedded image bytes unchanged', async () => {
    const det: DetectedImage = {
      page: 1, source: 'embedded',
      bbox: { x: 0, y: 0, w: 10, h: 10 },
      bytes: Buffer.from('original-bytes'), mime: 'image/png',
    };
    const out = await cropDetected(det);
    expect(out.bytes).toEqual(det.bytes);
    expect(out.mime).toBe('image/png');
  });

  it('crops vision-detected image from page render', async () => {
    const png = blankPng(200, 200);
    const det: DetectedImage = {
      page: 1, source: 'vision',
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      bytes: png, mime: 'image/png',
    };
    const out = await cropDetected(det);
    const parsed = PNG.sync.read(out.bytes);
    expect(parsed.width).toBe(50);
    expect(parsed.height).toBe(50);
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test image/crop` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { cropPng } from '@buddy/shared';
import type { DetectedImage } from './types.js';

export async function cropDetected(d: DetectedImage): Promise<{ bytes: Buffer; mime: string }> {
  if (d.source === 'embedded') {
    return { bytes: d.bytes, mime: d.mime };
  }
  const cropped = await cropPng(d.bytes, d.bbox);
  return { bytes: cropped, mime: 'image/png' };
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test image/crop` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/image/crop.ts packages/pipeline/test/image/crop.test.ts
git commit -m "feat(pipeline): crop detected images"
```

---

## Task 8: image/save

**Files:**
- Create: `packages/pipeline/src/image/save.ts`
- Test: `packages/pipeline/test/image/save.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveImage } from '../../src/image/save.js';

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'buddy-img-'));
}

describe('saveImage', () => {
  it('writes png + sidecar json and returns paths', async () => {
    const dir = await tmpDir();
    const out = await saveImage({
      dir, page: 3, idx: 0,
      detected: { page: 3, source: 'embedded',
        bbox: { x: 1, y: 2, w: 3, h: 4 },
        bytes: Buffer.from('abc'), mime: 'image/png' },
      cropped: { bytes: Buffer.from([1, 2, 3]), mime: 'image/png' },
    });
    expect(path.basename(out.path)).toBe('3-0.png');
    expect(path.basename(out.sidecarPath)).toBe('3-0.json');
    const png = await fs.readFile(out.path);
    expect(png).toEqual(Buffer.from([1, 2, 3]));
    const sidecar = JSON.parse(await fs.readFile(out.sidecarPath, 'utf8'));
    expect(sidecar.page).toBe(3);
    expect(sidecar.bbox).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(sidecar.source).toBe('embedded');
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test image/save` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DetectedImage, SavedImage } from './types.js';

interface Opts {
  dir: string;
  page: number;
  idx: number;
  detected: DetectedImage;
  cropped: { bytes: Buffer; mime: string };
}

export async function saveImage(opts: Opts): Promise<SavedImage> {
  await fs.mkdir(opts.dir, { recursive: true });
  const base = `${opts.page}-${opts.idx}`;
  const ext = opts.cropped.mime === 'image/jpeg' ? 'jpg' : 'png';
  const imgPath = path.join(opts.dir, `${base}.${ext}`);
  const sidecarPath = path.join(opts.dir, `${base}.json`);
  await fs.writeFile(imgPath, opts.cropped.bytes);
  const sidecar = {
    page: opts.detected.page,
    source: opts.detected.source,
    bbox: opts.detected.bbox,
    mime: opts.cropped.mime,
  };
  await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');
  return {
    ...opts.detected,
    bytes: opts.cropped.bytes,
    mime: opts.cropped.mime,
    path: imgPath,
    sidecarPath,
    idx: opts.idx,
  };
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test image/save` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/image/save.ts packages/pipeline/test/image/save.test.ts
git commit -m "feat(pipeline): save image + sidecar"
```

---

## Task 9: image/describe

**Files:**
- Create: `packages/pipeline/src/image/describe.ts`
- Test: `packages/pipeline/test/image/describe.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createStubGemini } from '@buddy/shared';
import { describeImage } from '../../src/image/describe.js';

describe('describeImage', () => {
  it('passes png + prompt to vision model and returns trimmed text', async () => {
    const gemini = createStubGemini({ responses: [{ text: '  bar chart of Q3 revenue.\n' }] });
    const caption = await describeImage({
      gemini, bytes: Buffer.from('png'), mime: 'image/png', visionModel: 'gemini-2.5-flash-lite',
    });
    expect(caption).toBe('bar chart of Q3 revenue.');
  });

  it('returns empty string on LLM error', async () => {
    const gemini = createStubGemini({ throwOnCall: 0 });
    const caption = await describeImage({
      gemini, bytes: Buffer.from('png'), mime: 'image/png',
    });
    expect(caption).toBe('');
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test image/describe` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { GeminiClient } from '@buddy/shared';
import { describeImagePrompt } from '../prompts/describe-image.js';

interface Opts {
  gemini: GeminiClient;
  bytes: Buffer;
  mime: string;
  visionModel?: string;
}

export async function describeImage(opts: Opts): Promise<string> {
  try {
    const r = await opts.gemini.generate(
      [
        describeImagePrompt(),
        { inlineData: { data: opts.bytes.toString('base64'), mimeType: opts.mime } },
      ],
      opts.visionModel ? { model: opts.visionModel, maxOutputTokens: 1024 } : { maxOutputTokens: 1024 },
    );
    return r.text.trim();
  } catch {
    return '';
  }
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test image/describe` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/image/describe.ts packages/pipeline/test/image/describe.test.ts
git commit -m "feat(pipeline): describe image via vision LLM"
```

---

## Task 10: image/pipeline

**Files:**
- Create: `packages/pipeline/src/image/pipeline.ts`
- Test: `packages/pipeline/test/image/pipeline.test.ts`

**Detection policy** (per spec §4.4):
- For every page: try `detectEmbeddedImages`. If any → use those.
- Else if page text is empty/short (< 50 chars), invoke `detectViaVision`.
- Else: no images for that page.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createStubGemini, createLlmPool, openPdf } from '@buddy/shared';
import { runImagePipeline } from '../../src/image/pipeline.js';
import type { RawPage } from '../../src/types.js';

describe('runImagePipeline', () => {
  it('returns empty array when no pages have images and all pages have text', async () => {
    const gemini = createStubGemini({ responses: [] });   // never called
    const pool = createLlmPool(2);
    const doc = openPdf(/* blank pdf with text */ await blankPdfWithText());
    const pages: RawPage[] = [{ pageNumber: 1, text: 'lots of text here', tokenCount: 4 }];
    const out = await runImagePipeline({
      doc, pages, dir: await mkTmp(), gemini, pool, visionModel: 'm',
    });
    expect(out).toEqual([]);
  });

  it('detects embedded image, saves, describes, returns DescribedImage', async () => {
    const gemini = createStubGemini({ responses: [{ text: 'red square' }] });
    const pool = createLlmPool(2);
    const dir = await mkTmp();
    const doc = openPdf(await pdfWithEmbeddedImage());
    const pages: RawPage[] = [{ pageNumber: 1, text: '', tokenCount: 0 }];
    const out = await runImagePipeline({
      doc, pages, dir, gemini, pool, visionModel: 'm',
    });
    expect(out).toHaveLength(1);
    expect(out[0].caption).toBe('red square');
    expect(out[0].page).toBe(1);
    expect(await fs.stat(out[0].path)).toBeTruthy();
  });

  it('falls back to vision detect when page text is short and no embedded images', async () => {
    const gemini = createStubGemini({
      responses: [
        // first call: detect-via-vision returns one element
        { text: JSON.stringify({ visual_elements: [
          { type: 'chart', bbox: { top: 0, left: 0, width: 50, height: 50 }, hint: 'h' },
        ] }) },
        // second call: describe
        { text: 'detected chart' },
      ],
    });
    const pool = createLlmPool(2);
    const doc = openPdf(await blankPdfNoText());
    const pages: RawPage[] = [{ pageNumber: 1, text: '', tokenCount: 0 }];
    const out = await runImagePipeline({
      doc, pages, dir: await mkTmp(), gemini, pool, visionModel: 'm',
    });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('vision');
    expect(out[0].caption).toBe('detected chart');
  });
});

async function mkTmp(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), 'imgpipe-')); }
// helper PDF fixtures: blankPdfWithText, pdfWithEmbeddedImage, blankPdfNoText
// — reuse fixtures from Task 4 or extract to packages/pipeline/test/fixtures/pdfs.ts
```

  **Note:** extract the three fixture builders into `packages/pipeline/test/fixtures/pdfs.ts` so they're shared with the golden test (Task 16).

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test image/pipeline` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import { getPageCount, renderPage, type PdfDoc, type GeminiClient, type LlmPool } from '@buddy/shared';
import { detectEmbeddedImages } from './detect-embedded.js';
import { detectViaVision } from './detect-via-vision.js';
import { cropDetected } from './crop.js';
import { saveImage } from './save.js';
import { describeImage } from './describe.js';
import type { DescribedImage, DetectedImage } from './types.js';
import type { RawPage } from '../types.js';

const VISION_FALLBACK_TEXT_THRESHOLD = 50;

export interface RunImageOpts {
  doc: PdfDoc;
  pages: RawPage[];
  dir: string;
  gemini: GeminiClient;
  pool: LlmPool;
  visionModel: string;
}

export async function runImagePipeline(opts: RunImageOpts): Promise<DescribedImage[]> {
  const out: DescribedImage[] = [];
  const total = getPageCount(opts.doc);
  const detectTasks: Promise<DetectedImage[]>[] = [];

  for (const p of opts.pages) {
    const pageIdx = p.pageNumber;
    if (pageIdx < 1 || pageIdx > total) continue;
    const embedded = detectEmbeddedImages(opts.doc, pageIdx);
    if (embedded.length > 0) {
      detectTasks.push(Promise.resolve(embedded));
    } else if ((p.text?.length ?? 0) < VISION_FALLBACK_TEXT_THRESHOLD) {
      const render = renderPage(opts.doc, pageIdx - 1, 2.0);
      detectTasks.push(
        opts.pool(() => detectViaVision({
          gemini: opts.gemini, page: pageIdx, pageRender: render, visionModel: opts.visionModel,
        })),
      );
    } else {
      detectTasks.push(Promise.resolve([]));
    }
  }

  const detectedPerPage = await Promise.all(detectTasks);

  const flat: DetectedImage[] = [];
  for (const arr of detectedPerPage) flat.push(...arr);

  const perPageCounter = new Map<number, number>();
  const saved = await Promise.all(flat.map(async (d) => {
    const idx = perPageCounter.get(d.page) ?? 0;
    perPageCounter.set(d.page, idx + 1);
    const cropped = await cropDetected(d);
    return saveImage({ dir: opts.dir, page: d.page, idx, detected: d, cropped });
  }));

  const described = await Promise.all(saved.map((s) =>
    opts.pool(async () => {
      const caption = await describeImage({
        gemini: opts.gemini, bytes: s.bytes, mime: s.mime, visionModel: opts.visionModel,
      });
      return { ...s, caption };
    }),
  ));

  out.push(...described);
  return out;
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test image/pipeline` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/image/pipeline.ts packages/pipeline/test/image/pipeline.test.ts packages/pipeline/test/fixtures/pdfs.ts
git commit -m "feat(pipeline): image pipeline orchestrator"
```

---

## Task 11: table types + prompts

**Files:**
- Create: `packages/pipeline/src/table/types.ts`
- Create: `packages/pipeline/src/prompts/normalize-table.ts`

- [ ] **Step 1: types.ts**

```ts
export interface DetectedTable {
  page: number;                                  // 1-indexed
  bbox: { x: number; y: number; w: number; h: number };
  rawCells: string[][];                          // raw rows from layout heuristic
}

export interface NormalizedTable {
  headers: string[];
  rows: string[][];
  columnTypes: ('string' | 'number' | 'date' | 'mixed')[];
  schemaDescriptor: string;                      // one-line human-readable schema
}

export interface SavedTable {
  page: number;
  path: string;                                  // absolute path to <page>-<n>.json
  idx: number;
  schema: string;                                // = NormalizedTable.schemaDescriptor
  headers: string[];
  rowCount: number;
}
```

- [ ] **Step 2: prompts/normalize-table.ts**

```ts
export const normalizeTablePrompt = (rawCells: string[][]): string => `You are normalizing a table extracted from a PDF.

Raw cells (rows top-to-bottom, columns left-to-right):
${JSON.stringify(rawCells, null, 2)}

Tasks:
1. Decide whether row 1 is a header. If yes, return it as headers; otherwise synthesize column names: "col1", "col2", ...
2. Clean OCR artifacts: collapse whitespace, drop border characters (|, -, _).
3. Infer column type per column: "string" | "number" | "date" | "mixed".
4. Write a one-line schema descriptor describing what the table is about (e.g. "Quarterly revenue by product").

Return JSON only:
{
  "headers": ["..."],
  "rows": [["..."]],
  "columnTypes": ["string"|"number"|"date"|"mixed", ...],
  "schemaDescriptor": "..."
}`;
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/table/types.ts packages/pipeline/src/prompts/normalize-table.ts
git commit -m "feat(pipeline): table types + normalize prompt"
```

---

## Task 12: table/detect (heuristic)

**Files:**
- Create: `packages/pipeline/src/table/detect.ts`
- Test: `packages/pipeline/test/table/detect.test.ts`

**Heuristic (faithful but simple v1):** Use mupdf StructuredText. A *table region* is a vertical sequence of ≥ 2 lines, each containing ≥ 2 horizontally-aligned "spans" (gap > 12px), where the column count is consistent (±1) across rows. Adjacent qualifying lines coalesce into one table.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { openPdf } from '@buddy/shared';
import { detectTables } from '../../src/table/detect.js';

async function pdfWithTable(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 400]);
  // 3-column, 3-row table
  const rows = [['Product', 'Price', 'Stock'], ['Widget A', '$10', '100'], ['Widget B', '$15', '50']];
  let y = 350;
  for (const row of rows) {
    let x = 50;
    for (const cell of row) {
      page.drawText(cell, { x, y, size: 12, font });
      x += 120;
    }
    y -= 20;
  }
  return Buffer.from(await pdf.save());
}

describe('detectTables', () => {
  it('detects a 3x3 table on the page', async () => {
    const doc = openPdf(await pdfWithTable());
    const tables = detectTables(doc, 1);
    expect(tables).toHaveLength(1);
    expect(tables[0].rawCells).toHaveLength(3);
    expect(tables[0].rawCells[0]).toEqual(['Product', 'Price', 'Stock']);
    expect(tables[0].page).toBe(1);
  });

  it('returns empty for page with only prose', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([400, 400]);
    page.drawText('Just a paragraph here, no tabular structure.', { x: 50, y: 200, size: 12, font });
    const doc = openPdf(Buffer.from(await pdf.save()));
    expect(detectTables(doc, 1)).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test table/detect` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { PdfDoc } from '@buddy/shared';
import * as mupdf from 'mupdf';
import type { DetectedTable } from './types.js';

interface Span { text: string; x: number; y: number; w: number; h: number; }

const MIN_COL_GAP = 12;
const MIN_COLS = 2;
const MIN_ROWS = 2;
const ROW_TOLERANCE = 4;            // vertical y-merge threshold
const COL_COUNT_TOLERANCE = 1;      // ±1 column variation across rows

export function detectTables(doc: PdfDoc, page: number): DetectedTable[] {
  const p = doc._doc.loadPage(page - 1);
  const json = p.toStructuredText('preserve-whitespace').asJSON();
  const data = JSON.parse(json) as {
    blocks?: {
      bbox?: { x: number; y: number; w: number; h: number };
      lines?: {
        bbox?: { x: number; y: number; w: number; h: number };
        text?: string;
        spans?: { text?: string; bbox?: { x: number; y: number; w: number; h: number } }[];
      }[];
    }[];
  };

  const spansByRow = new Map<number, Span[]>();
  for (const block of data.blocks ?? []) {
    for (const line of block.lines ?? []) {
      if (!line.spans || !line.bbox) continue;
      const cells: Span[] = [];
      let last: Span | null = null;
      for (const s of line.spans) {
        if (!s.bbox || !s.text || !s.text.trim()) continue;
        const span: Span = { text: s.text.trim(), x: s.bbox.x, y: s.bbox.y, w: s.bbox.w, h: s.bbox.h };
        if (last && span.x - (last.x + last.w) < MIN_COL_GAP) {
          last.text += ' ' + span.text;
          last.w = span.x + span.w - last.x;
        } else {
          cells.push(span);
          last = span;
        }
      }
      if (cells.length < MIN_COLS) continue;
      const ySnap = Math.round(line.bbox.y / ROW_TOLERANCE) * ROW_TOLERANCE;
      const existing = spansByRow.get(ySnap) ?? [];
      existing.push(...cells);
      spansByRow.set(ySnap, existing);
    }
  }

  const rowEntries = [...spansByRow.entries()].sort((a, b) => a[0] - b[0]);
  const tables: DetectedTable[] = [];
  let cluster: { y: number; cells: Span[] }[] = [];

  const flush = () => {
    if (cluster.length < MIN_ROWS) { cluster = []; return; }
    const colCounts = cluster.map((r) => r.cells.length);
    const min = Math.min(...colCounts), max = Math.max(...colCounts);
    if (max - min > COL_COUNT_TOLERANCE) { cluster = []; return; }
    const allX = cluster.flatMap((r) => r.cells.map((c) => c.x));
    const allY = cluster.flatMap((r) => r.cells.map((c) => c.y));
    const allRight = cluster.flatMap((r) => r.cells.map((c) => c.x + c.w));
    const allBot = cluster.flatMap((r) => r.cells.map((c) => c.y + c.h));
    const bbox = {
      x: Math.min(...allX), y: Math.min(...allY),
      w: Math.max(...allRight) - Math.min(...allX),
      h: Math.max(...allBot) - Math.min(...allY),
    };
    const rawCells = cluster.map((r) =>
      [...r.cells].sort((a, b) => a.x - b.x).map((c) => c.text),
    );
    tables.push({ page, bbox, rawCells });
    cluster = [];
  };

  let prevY = -Infinity;
  for (const [y, cells] of rowEntries) {
    if (cluster.length > 0 && y - prevY > 30) flush();
    cluster.push({ y, cells });
    prevY = y;
  }
  flush();

  return tables;
}
```

  **Note:** mupdf-js's `toStructuredText` JSON structure varies slightly across versions. If `line.spans` is absent in the installed version, fall back to splitting `line.text` on runs of ≥ 2 whitespace as a coarser approximation — the public test contract (3x3 table → 3 rows × 3 cols) pins behavior.

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test table/detect` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/table/detect.ts packages/pipeline/test/table/detect.test.ts
git commit -m "feat(pipeline): heuristic table region detect via mupdf"
```

---

## Task 13: table/normalize

**Files:**
- Create: `packages/pipeline/src/table/normalize.ts`
- Test: `packages/pipeline/test/table/normalize.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createStubGemini } from '@buddy/shared';
import { normalizeTable } from '../../src/table/normalize.js';

describe('normalizeTable', () => {
  it('parses LLM output into NormalizedTable', async () => {
    const gemini = createStubGemini({
      responses: [{ text: JSON.stringify({
        headers: ['Product', 'Price'],
        rows: [['A', '10'], ['B', '15']],
        columnTypes: ['string', 'number'],
        schemaDescriptor: 'Product prices',
      }) }],
    });
    const out = await normalizeTable({
      gemini, rawCells: [['Product', 'Price'], ['A', '10'], ['B', '15']],
    });
    expect(out.headers).toEqual(['Product', 'Price']);
    expect(out.rows).toHaveLength(2);
    expect(out.columnTypes).toEqual(['string', 'number']);
    expect(out.schemaDescriptor).toBe('Product prices');
  });

  it('falls back to coarse normalization on parse failure', async () => {
    const gemini = createStubGemini({ responses: [{ text: 'garbage' }] });
    const out = await normalizeTable({
      gemini, rawCells: [['a', 'b'], ['1', '2']],
    });
    expect(out.headers).toEqual(['a', 'b']);
    expect(out.rows).toEqual([['1', '2']]);
    expect(out.schemaDescriptor).toBe('Unstructured table');
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test table/normalize` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { GeminiClient } from '@buddy/shared';
import { normalizeTablePrompt } from '../prompts/normalize-table.js';
import { parseJson } from '../json-utils.js';
import type { NormalizedTable } from './types.js';

interface Opts { gemini: GeminiClient; rawCells: string[][]; }

export async function normalizeTable(opts: Opts): Promise<NormalizedTable> {
  const r = await opts.gemini.generate([normalizeTablePrompt(opts.rawCells)], { maxOutputTokens: 4096 });
  try {
    const parsed = parseJson(r.text) as Partial<NormalizedTable> | null;
    if (parsed?.headers && parsed?.rows && parsed?.columnTypes && parsed?.schemaDescriptor) {
      return {
        headers: parsed.headers,
        rows: parsed.rows,
        columnTypes: parsed.columnTypes,
        schemaDescriptor: parsed.schemaDescriptor,
      };
    }
  } catch { /* fall through */ }
  const headers = opts.rawCells[0] ?? [];
  return {
    headers,
    rows: opts.rawCells.slice(1),
    columnTypes: headers.map(() => 'string' as const),
    schemaDescriptor: 'Unstructured table',
  };
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test table/normalize` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/table/normalize.ts packages/pipeline/test/table/normalize.test.ts
git commit -m "feat(pipeline): normalize table via LLM with safe fallback"
```

---

## Task 14: table/save + table/pipeline

**Files:**
- Create: `packages/pipeline/src/table/save.ts`
- Create: `packages/pipeline/src/table/pipeline.ts`
- Test: `packages/pipeline/test/table/pipeline.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStubGemini, createLlmPool, openPdf } from '@buddy/shared';
import { runTablePipeline } from '../../src/table/pipeline.js';
import { pdfWithTable } from '../fixtures/pdfs.js';

describe('runTablePipeline', () => {
  it('detects, normalizes, saves; returns SavedTable[]', async () => {
    const gemini = createStubGemini({ responses: [{ text: JSON.stringify({
      headers: ['Product', 'Price', 'Stock'],
      rows: [['Widget A', '$10', '100'], ['Widget B', '$15', '50']],
      columnTypes: ['string', 'number', 'number'],
      schemaDescriptor: 'Product inventory',
    }) }] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tblpipe-'));
    const out = await runTablePipeline({
      doc: openPdf(await pdfWithTable()),
      pages: [{ pageNumber: 1, text: 'x', tokenCount: 0 }],
      dir, gemini, pool: createLlmPool(2),
    });
    expect(out).toHaveLength(1);
    expect(out[0].page).toBe(1);
    expect(out[0].schema).toBe('Product inventory');
    expect(out[0].headers).toEqual(['Product', 'Price', 'Stock']);
    const saved = JSON.parse(await fs.readFile(out[0].path, 'utf8'));
    expect(saved.headers).toEqual(['Product', 'Price', 'Stock']);
    expect(saved.rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test table/pipeline` — expect FAIL.

- [ ] **Step 3: Implement `save.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DetectedTable, NormalizedTable, SavedTable } from './types.js';

interface Opts {
  dir: string;
  page: number;
  idx: number;
  detected: DetectedTable;
  normalized: NormalizedTable;
}

export async function saveTable(opts: Opts): Promise<SavedTable> {
  await fs.mkdir(opts.dir, { recursive: true });
  const filePath = path.join(opts.dir, `${opts.page}-${opts.idx}.json`);
  const body = {
    page: opts.page,
    bbox: opts.detected.bbox,
    headers: opts.normalized.headers,
    rows: opts.normalized.rows,
    columnTypes: opts.normalized.columnTypes,
    schemaDescriptor: opts.normalized.schemaDescriptor,
  };
  await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf8');
  return {
    page: opts.page,
    path: filePath,
    idx: opts.idx,
    schema: opts.normalized.schemaDescriptor,
    headers: opts.normalized.headers,
    rowCount: opts.normalized.rows.length,
  };
}
```

- [ ] **Step 4: Implement `pipeline.ts`**

```ts
import { getPageCount, type PdfDoc, type GeminiClient, type LlmPool } from '@buddy/shared';
import { detectTables } from './detect.js';
import { normalizeTable } from './normalize.js';
import { saveTable } from './save.js';
import type { SavedTable } from './types.js';
import type { RawPage } from '../types.js';

export interface RunTableOpts {
  doc: PdfDoc;
  pages: RawPage[];
  dir: string;
  gemini: GeminiClient;
  pool: LlmPool;
}

export async function runTablePipeline(opts: RunTableOpts): Promise<SavedTable[]> {
  const total = getPageCount(opts.doc);
  const tasks: Promise<SavedTable | null>[] = [];

  for (const p of opts.pages) {
    if (p.pageNumber < 1 || p.pageNumber > total) continue;
    const detected = detectTables(opts.doc, p.pageNumber);
    detected.forEach((d, idx) => {
      tasks.push(opts.pool(async () => {
        try {
          const normalized = await normalizeTable({ gemini: opts.gemini, rawCells: d.rawCells });
          return await saveTable({ dir: opts.dir, page: p.pageNumber, idx, detected: d, normalized });
        } catch {
          return null;
        }
      }));
    });
  }

  const settled = await Promise.all(tasks);
  return settled.filter((t): t is SavedTable => t !== null);
}
```

- [ ] **Step 5:** Run: `pnpm -F @buddy/pipeline test table/pipeline` — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/table/save.ts packages/pipeline/src/table/pipeline.ts packages/pipeline/test/table/pipeline.test.ts
git commit -m "feat(pipeline): table pipeline orchestrator"
```

---

## Task 15: multimodal/attach (deepest-node containment)

**Files:**
- Create: `packages/pipeline/src/multimodal/attach.ts`
- Test: `packages/pipeline/test/multimodal/attach.test.ts`

**Rule (spec §4.4):** an item at page `p` attaches to the deepest tree node whose `[start_index, end_index]` contains `p`. Ties broken by deepest-first traversal. Same rule for images and tables. If no node contains `p`, the item is dropped (logged).

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { attachMultimodal } from '../../src/multimodal/attach.js';
import type { TreeNode } from '@buddy/shared';

const node = (
  title: string, s: number, e: number, kids: TreeNode[] = [],
): TreeNode => ({
  title, start_index: s, end_index: e, node_id: title, nodes: kids, images: [], tables: [],
});

describe('attachMultimodal', () => {
  it('attaches image to deepest containing node', () => {
    const tree: TreeNode[] = [
      node('root', 1, 10, [
        node('chapter-1', 1, 5),
        node('chapter-2', 6, 10, [
          node('section-2-1', 6, 7),
          node('section-2-2', 8, 10),
        ]),
      ]),
    ];
    const out = attachMultimodal(tree, {
      images: [{ path: '/x/8-0.png', page: 8, caption: 'c' }],
      tables: [],
    });
    expect(out[0].nodes[1].nodes[1].images).toHaveLength(1);
    expect(out[0].nodes[1].nodes[1].images[0].caption).toBe('c');
    expect(out[0].images).toHaveLength(0);
    expect(out[0].nodes[1].images).toHaveLength(0);
  });

  it('attaches table to deepest node', () => {
    const tree: TreeNode[] = [node('root', 1, 5, [node('child', 2, 4)])];
    const out = attachMultimodal(tree, {
      images: [],
      tables: [{ path: '/t/3-0.json', page: 3, schema: 'foo' }],
    });
    expect(out[0].nodes[0].tables).toHaveLength(1);
    expect(out[0].nodes[0].tables[0].schema).toBe('foo');
  });

  it('drops items with page outside any node', () => {
    const tree: TreeNode[] = [node('root', 1, 5)];
    const out = attachMultimodal(tree, {
      images: [{ path: '/x/99-0.png', page: 99 }],
      tables: [],
    });
    expect(out[0].images).toHaveLength(0);
  });

  it('preserves existing images/tables arrays (does not mutate input)', () => {
    const tree: TreeNode[] = [node('root', 1, 5)];
    const input = tree[0].images;
    attachMultimodal(tree, { images: [{ path: '/a.png', page: 3 }], tables: [] });
    expect(tree[0].images).toBe(input);    // original reference unchanged
    expect(tree[0].images).toHaveLength(0);
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test multimodal/attach` — expect FAIL.

- [ ] **Step 3: Implement**

```ts
import type { TreeNode, ImageRef, TableRef } from '@buddy/shared';
import type { DescribedImage } from '../image/types.js';
import type { SavedTable } from '../table/types.js';

interface AttachInput {
  images: { path: string; page: number; caption?: string }[];
  tables: { path: string; page: number; schema?: string }[];
}

function cloneTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => ({
    ...n,
    images: [...n.images],
    tables: [...n.tables],
    nodes: cloneTree(n.nodes),
  }));
}

function findDeepestForPage(nodes: TreeNode[], page: number): TreeNode | null {
  let best: TreeNode | null = null;
  let bestDepth = -1;
  function walk(n: TreeNode, depth: number): void {
    if (page >= n.start_index && page <= n.end_index) {
      if (depth > bestDepth) { best = n; bestDepth = depth; }
      for (const c of n.nodes) walk(c, depth + 1);
    }
  }
  for (const n of nodes) walk(n, 0);
  return best;
}

export function attachMultimodal(tree: TreeNode[], input: AttachInput): TreeNode[] {
  const out = cloneTree(tree);

  for (const img of input.images) {
    const target = findDeepestForPage(out, img.page);
    if (!target) continue;
    const ref: ImageRef = { path: img.path, page: img.page, ...(img.caption ? { caption: img.caption } : {}) };
    target.images.push(ref);
  }
  for (const tbl of input.tables) {
    const target = findDeepestForPage(out, tbl.page);
    if (!target) continue;
    const ref: TableRef = { path: tbl.path, page: tbl.page, ...(tbl.schema ? { schema: tbl.schema } : {}) };
    target.tables.push(ref);
  }
  return out;
}

export function fromDescribedImages(images: DescribedImage[]): AttachInput['images'] {
  return images.map((i) => ({ path: i.path, page: i.page, ...(i.caption ? { caption: i.caption } : {}) }));
}

export function fromSavedTables(tables: SavedTable[]): AttachInput['tables'] {
  return tables.map((t) => ({ path: t.path, page: t.page, schema: t.schema }));
}
```

- [ ] **Step 4:** Run: `pnpm -F @buddy/pipeline test multimodal/attach` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/multimodal/attach.ts packages/pipeline/test/multimodal/attach.test.ts
git commit -m "feat(pipeline): attach multimodal to deepest containing node"
```

---

## Task 16: Wire orchestrator + outputJson

**Files:**
- Modify: `packages/pipeline/src/steps/10-output-json.ts`
- Modify: `packages/pipeline/src/orchestrator.ts`
- Modify: `packages/pipeline/src/types.ts`
- Modify: `packages/pipeline/src/build.ts`
- Test: `packages/pipeline/test/steps/10-output-json.test.ts` (extend)

- [ ] **Step 1: Extend `BuildOpts` and `Ctx`**

In `packages/pipeline/src/types.ts`:

```ts
export interface BuildOpts {
  // ... existing fields ...
  imagesEnabled: boolean;
  tablesEnabled: boolean;
  visionModel: string;
}
```

Update `buildOptsFromConfig`:

```ts
imagesEnabled: cfg.imagesEnabled,
tablesEnabled: cfg.tablesEnabled,
visionModel: cfg.geminiVisionModel,
```

- [ ] **Step 2: Extend `outputJson`**

```ts
import { attachMultimodal, fromDescribedImages, fromSavedTables } from '../multimodal/attach.js';
import type { DescribedImage } from '../image/types.js';
import type { SavedTable } from '../table/types.js';

interface Opts {
  docId: string;
  docName: string;
  outPath: string;
  gemini: GeminiClient;
  generateDescription: boolean;
  images?: DescribedImage[];
  tables?: SavedTable[];
}

export async function outputJson(tree: TreeNode[], opts: Opts): Promise<DocOutput> {
  let description = '';
  if (opts.generateDescription && tree.length > 0) {
    const r = await opts.gemini.generate([docDescriptionPrompt(tree)], { maxOutputTokens: 256 });
    description = r.text.trim();
  }
  const withIds = assignIds(tree);
  const attached = attachMultimodal(withIds, {
    images: fromDescribedImages(opts.images ?? []),
    tables: fromSavedTables(opts.tables ?? []),
  });
  const out: DocOutput = {
    doc_id: opts.docId, doc_name: opts.docName, doc_description: description, structure: attached,
  };
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await fs.writeFile(opts.outPath, JSON.stringify(out, null, 2), 'utf8');
  return out;
}
```

- [ ] **Step 3: Wire orchestrator**

In `packages/pipeline/src/orchestrator.ts`:

```ts
import { openPdf } from '@buddy/shared';
import { runImagePipeline } from './image/pipeline.js';
import { runTablePipeline } from './table/pipeline.js';
import fs from 'node:fs/promises';

// inside runPipeline, after `extractPages`:
const pages: RawPage[] = await step(ctx, '01-extract', () => extractPages(ctx.pdfPath));

const pdfBytes = await fs.readFile(ctx.pdfPath);
const pdfDoc = openPdf(pdfBytes);

const imagesPromise = ctx.opts.imagesEnabled
  ? step(ctx, 'image-pipeline', () => runImagePipeline({
      doc: pdfDoc, pages, dir: ctx.imagesDir,
      gemini: ctx.gemini, pool: ctx.pool, visionModel: ctx.opts.visionModel,
    }))
  : Promise.resolve([]);

const tablesPromise = ctx.opts.tablesEnabled
  ? step(ctx, 'table-pipeline', () => runTablePipeline({
      doc: pdfDoc, pages, dir: ctx.tablesDir, gemini: ctx.gemini, pool: ctx.pool,
    }))
  : Promise.resolve([]);

// ... existing TOC + tree code unchanged ...

const [images, tables] = await Promise.all([imagesPromise, tablesPromise]);

return outputJson(tree, {
  docId: ctx.docId, docName, outPath, gemini: ctx.gemini,
  generateDescription: ctx.opts.addSummaries,
  images, tables,
});
```

Add `imagesDir` + `tablesDir` to `Ctx`:

```ts
// types.ts
export interface Ctx {
  // ... existing ...
  imagesDir: string;
  tablesDir: string;
}
```

- [ ] **Step 4: Wire build.ts**

```ts
import { resolveDocImagesDir, resolveDocTablesDir } from '@buddy/shared';

// inside buildDoc:
const imagesDir = resolveDocImagesDir(args.cfg.dataDir, args.topic, docId);
const tablesDir = resolveDocTablesDir(args.cfg.dataDir, args.topic, docId);
await fs.mkdir(imagesDir, { recursive: true });
await fs.mkdir(tablesDir, { recursive: true });

const ctx: Ctx = {
  // ... existing ...
  imagesDir, tablesDir,
};
```

- [ ] **Step 5: Extend outputJson test**

In `packages/pipeline/test/steps/10-output-json.test.ts` add:

```ts
it('attaches images + tables to deepest containing node', async () => {
  const tree: TreeNode[] = [{
    title: 'root', start_index: 1, end_index: 10, node_id: 'r', nodes: [
      { title: 'ch', start_index: 5, end_index: 8, node_id: 'c', nodes: [], images: [], tables: [] },
    ], images: [], tables: [],
  }];
  const tmpPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'oj-')), 'out.json');
  const out = await outputJson(tree, {
    docId: 'd', docName: 'doc.pdf', outPath: tmpPath,
    gemini: createStubGemini({ responses: [] }), generateDescription: false,
    images: [{ page: 6, path: '/i/6-0.png', caption: 'c', idx: 0, source: 'embedded',
               bbox: { x: 0, y: 0, w: 1, h: 1 }, bytes: Buffer.from(''), mime: 'image/png',
               sidecarPath: '/i/6-0.json' }],
    tables: [{ page: 7, path: '/t/7-0.json', idx: 0, schema: 's', headers: ['a'], rowCount: 1 }],
  });
  expect(out.structure[0].nodes[0].images).toHaveLength(1);
  expect(out.structure[0].nodes[0].tables).toHaveLength(1);
});
```

- [ ] **Step 6:** Run: `pnpm -F @buddy/pipeline test` — all green (existing 106 + new tests).

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/src/orchestrator.ts packages/pipeline/src/types.ts \
        packages/pipeline/src/build.ts packages/pipeline/src/steps/10-output-json.ts \
        packages/pipeline/test/steps/10-output-json.test.ts
git commit -m "feat(pipeline): wire image+table pipelines into orchestrator"
```

---

## Task 17: Golden e2e — small-with-image

**Files:**
- Create: `packages/pipeline/test/golden/small-with-image.test.ts`
- Create or extend: `packages/pipeline/test/fixtures/pdfs.ts`

- [ ] **Step 1: Write golden test**

Build a 3-page PDF: page 1 = title + TOC ("Chapter 1 .. 2", "Chapter 2 .. 3"), page 2 = "Chapter 1" heading + prose, page 3 = "Chapter 2" heading + embedded image (no/short text).

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildDoc, createStubGemini, type Config } from '@buddy/shared';
import { goldenPdfWithImage } from '../fixtures/pdfs.js';
import { buildDoc as build } from '../../src/build.js';

describe('golden: small-with-image', () => {
  it('produces tree with image attached to chapter-2 node', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-img-'));
    const topic = 'tax';
    const pdfDir = path.join(dataDir, topic);
    await fs.mkdir(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, 'sample.pdf');
    await fs.writeFile(pdfPath, await goldenPdfWithImage());

    const gemini = createStubGemini({
      // scripted responses for: detect-toc, toc-content (no llm), detect-page-numbers,
      // toc-transform, physical-mapping, verify, title-at-start, splits, summary, doc-description,
      // image describe (1x)
      // — pre-record from a manual run; this is the standard golden pattern from plan 2
      responses: scriptFromFile('small-with-image.responses.json'),
    });
    const cfg: Config = baseTestCfg({ dataDir, imagesEnabled: true, tablesEnabled: false });
    const out = await build({ cfg, topic, pdfPath, gemini, optsOverride: { force: true } });

    // Find chapter-2 node (page 3)
    const ch2 = out.structure.flatMap(n => [n, ...n.nodes]).find(n =>
      n.start_index <= 3 && n.end_index >= 3 && n.title.toLowerCase().includes('chapter 2'),
    );
    expect(ch2).toBeDefined();
    expect(ch2!.images.length).toBeGreaterThan(0);
    expect(ch2!.images[0].page).toBe(3);
  });
});
```

  **Note:** `scriptFromFile` + `baseTestCfg` are the helpers already used by the three plan-2 golden tests (`small-with-toc.test.ts`, etc). Reuse them. Record the new response script via the same procedure documented in plan 2 (run once with a real key, capture, redact).

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test small-with-image` — iterate until green.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/test/golden/small-with-image.test.ts \
        packages/pipeline/test/fixtures/pdfs.ts \
        packages/pipeline/test/golden/small-with-image.responses.json
git commit -m "test(pipeline): golden e2e image attached to deepest node"
```

---

## Task 18: Golden e2e — small-with-table

**Files:**
- Create: `packages/pipeline/test/golden/small-with-table.test.ts`

- [ ] **Step 1: Write**

Mirror task 17 but with `goldenPdfWithTable` (3-page PDF, page 3 has a 3-column table).

```ts
describe('golden: small-with-table', () => {
  it('attaches table to chapter-2 node', async () => {
    // ... setup as above ...
    const cfg: Config = baseTestCfg({ dataDir, imagesEnabled: false, tablesEnabled: true });
    const out = await build({ cfg, topic, pdfPath, gemini, optsOverride: { force: true } });
    const ch2 = out.structure.flatMap(n => [n, ...n.nodes]).find(n =>
      n.start_index <= 3 && n.end_index >= 3,
    );
    expect(ch2!.tables.length).toBeGreaterThan(0);
    expect(ch2!.tables[0].schema).toBeTruthy();
    expect(ch2!.tables[0].page).toBe(3);
  });
});
```

- [ ] **Step 2:** Run: `pnpm -F @buddy/pipeline test small-with-table` — iterate until green.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/test/golden/small-with-table.test.ts \
        packages/pipeline/test/golden/small-with-table.responses.json
git commit -m "test(pipeline): golden e2e table attached to deepest node"
```

---

## Task 19: CLI flags — apps/build-index

**Files:**
- Modify: `apps/build-index/src/cli.ts` (or whatever entrypoint plan 2 produced — see `apps/build-index/src/` after running `ls`)

- [ ] **Step 1: Inspect CLI to find flag parsing site**

```bash
ls apps/build-index/src/
grep -n "force" apps/build-index/src/*.ts
```

- [ ] **Step 2: Add `--no-images` and `--no-tables` flags**

Wherever existing flags (`--all`, `--topic`, `--force`) are parsed, add:

```ts
const noImages = argv.includes('--no-images');
const noTables = argv.includes('--no-tables');

// pass through optsOverride:
optsOverride: {
  ...(noImages ? { imagesEnabled: false } : {}),
  ...(noTables ? { tablesEnabled: false } : {}),
  ...(force ? { force: true } : {}),
}
```

- [ ] **Step 3: Manual smoke check**

```bash
pnpm -F build-index build
node apps/build-index/dist/cli.js --help    # if --help exists, otherwise just confirm new flags don't crash
```

- [ ] **Step 4: Commit**

```bash
git add apps/build-index/src/
git commit -m "feat(build-index): --no-images and --no-tables flags"
```

---

## Task 20: Final verification

- [ ] **Step 1: Typecheck all packages**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 2: Lint**

```bash
pnpm -r lint
```

Expected: clean (no errors).

- [ ] **Step 3: All tests**

```bash
pnpm -r test
```

Expected: all packages green. Plan 2 had 106 pipeline tests; plan 3 adds ~25 new tests across image/, table/, multimodal/, golden/. Target total ≥ 130.

- [ ] **Step 4: Build dist**

```bash
pnpm -F @buddy/shared build
pnpm -F @buddy/pipeline build
pnpm -F build-index build
```

Expected: ESM + DTS clean.

- [ ] **Step 5: Update memory after plan 3 lands**

Add a status line to `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md`:

```
- 2026-MM-DD: Plan 3 (`pipeline-multimodal`) complete. image/ + table/ + multimodal/attach shipped. Vision via gemini.generate with inlineData. Trees now carry images[] + tables[] at deepest containing node.
```

(Replace `MM-DD` with actual completion date.)

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/plans/2026-05-21-pipeline-multimodal.md
git commit -m "chore(plan): plan 3"
```

---

## Self-Review Notes (author)

- **Spec §4.4 coverage:** detect (embedded + vision fallback) → Tasks 4, 6. Crop → 7. Save → 8. Describe → 9. Attach via deepest-node → 15. ✅
- **Spec §4.5 coverage:** detect (MuPDF) → 12. Normalize (LLM) → 13. Save → 14. Attach → 15. ✅
- **Spec §4.6 caching:** all pipelines wrapped in `step(...)` which calls `withCache`; the `image-pipeline` and `table-pipeline` step names give them deterministic cache files. ✅
- **Spec §8 schemas:** `imageRefSchema`/`tableRefSchema` already exist in `@buddy/shared` (plan 1). No schema changes needed. ✅
- **Concurrency:** all LLM calls flow through `ctx.pool` (plan 1 helper). Vision calls share the same pool — `MAX_CONCURRENT_LLM` covers them.
- **Vision-model env:** `cfg.geminiVisionModel` already in plan 1 (`config.ts:16`). Defaults to same flash-lite.
- **No placeholders detected.**
- **Type consistency check:** `DetectedImage`, `SavedImage`, `DescribedImage` consistent across tasks 3, 7, 8, 9, 10. `DetectedTable`, `NormalizedTable`, `SavedTable` consistent across tasks 11–14. `attachMultimodal` consumes the lightweight `{path, page, caption?}` / `{path, page, schema?}` shape — adapter helpers `fromDescribedImages` / `fromSavedTables` bridge. ✅
- **Out-of-scope honored:** no multi-page table merge, no CSV/Excel, no cross-doc unification, no OCR beyond vision-bbox fallback. ✅
