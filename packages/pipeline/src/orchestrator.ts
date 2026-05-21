import fs from 'node:fs/promises';
import { withRetry, openPdf } from '@buddy/shared';
import { withLogger } from './wrappers/with-logger.js';
import { withCache } from './cache.js';
import { extractPages } from './steps/01-extract.js';
import { runImagePipeline } from './image/pipeline.js';
import { runTablePipeline } from './table/pipeline.js';
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
    flatToc = await step(ctx, 'fallback-no-toc-validate',
      async () => validateIndices(flatToc, pages.length));
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
      flatToc = await step(ctx, 'fallback-no-toc-validate',
        async () => validateIndices(flatToc, pages.length));
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
          flatToc = await step(ctx, 'fallback-no-toc-validate',
            async () => validateIndices(flatToc, pages.length));
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
  const [images, tables] = await Promise.all([imagesPromise, tablesPromise]);
  return outputJson(tree, {
    docId: ctx.docId, docName, outPath, gemini: ctx.gemini,
    generateDescription: ctx.opts.addSummaries,
    images, tables,
  });
}
