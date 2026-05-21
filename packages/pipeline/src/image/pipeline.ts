import {
  getPageCount,
  renderPage,
  type GeminiClient,
  type LlmPool,
  type PdfDoc,
} from '@buddy/shared';
import type { RawPage } from '../types.js';
import { materializeImageBytes } from './crop.js';
import { describeImage } from './describe.js';
import { detectEmbeddedImages } from './detect-embedded.js';
import { detectViaVision } from './detect-via-vision.js';
import { saveImage } from './save.js';
import type { DescribedImage, DetectedImage } from './types.js';

interface RunImagePipelineOpts {
  doc: PdfDoc;
  pages: RawPage[];
  dir: string;
  gemini: GeminiClient;
  pool: LlmPool;
  visionModel?: string;
}

export async function runImagePipeline(opts: RunImagePipelineOpts): Promise<DescribedImage[]> {
  const pageCount = getPageCount(opts.doc);
  const perPageIndex = new Map<number, number>();
  const results: DescribedImage[] = [];

  for (const page of opts.pages) {
    if (page.pageNumber < 1 || page.pageNumber > pageCount) {
      continue;
    }

    let detected: DetectedImage[] = [];
    try {
      detected = detectEmbeddedImages(opts.doc, page.pageNumber);
    } catch {
      detected = [];
    }

    if (detected.length === 0) {
      try {
        const pageRender = renderPage(opts.doc, page.pageNumber - 1, 2.0);
        detected = await opts.pool(() =>
          detectViaVision({
            gemini: opts.gemini,
            page: page.pageNumber,
            pageRender,
            ...(opts.visionModel ? { visionModel: opts.visionModel } : {}),
          }),
        );
      } catch {
        detected = [];
      }
    }

    for (const image of detected) {
      try {
        const bytes = await materializeImageBytes(image);
        const idx = perPageIndex.get(image.page) ?? 0;
        perPageIndex.set(image.page, idx + 1);
        const saved = await saveImage({ dir: opts.dir, idx, image, bytes });
        const described = await opts.pool(() =>
          describeImage({
            gemini: opts.gemini,
            image: saved,
            ...(opts.visionModel ? { visionModel: opts.visionModel } : {}),
          }),
        );
        results.push(described);
      } catch {
        // Continue processing remaining images/pages when one image fails.
      }
    }
  }

  return results;
}
