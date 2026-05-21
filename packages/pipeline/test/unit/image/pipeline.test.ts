import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  cropPng,
  createStubGemini,
  extractEmbeddedImages,
  hashPrompt,
  openPdf,
  renderPage,
  type LlmPool,
} from '@buddy/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { runImagePipeline } from '../../../src/image/pipeline.js';
import { describeImagePrompt } from '../../../src/prompts/describe-image.js';
import { detectImageBboxPrompt } from '../../../src/prompts/detect-image-bbox.js';
import type { RawPage } from '../../../src/types.js';
import { makeBlankPdf, makePdfWithEmbeddedImage, makeTextPdf } from './fixtures.js';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'buddy-image-pipeline-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('runImagePipeline', () => {
  it('runs the embedded-image path end to end', async () => {
    const pdf = await makePdfWithEmbeddedImage();
    const doc = openPdf(pdf);
    const extracted = extractEmbeddedImages(doc, 0);
    const imageBytes = extracted[0]?.bytes;
    if (!imageBytes) throw new Error('expected embedded image fixture to extract one image');
    const parts = [
      describeImagePrompt(),
      {
        inlineData: {
          data: imageBytes.toString('base64'),
          mimeType: 'image/png',
        },
      },
    ] as const;
    const gemini = createStubGemini({
      responses: new Map([[hashPrompt([...parts]), { text: 'red square' }]]),
    });
    const pages: RawPage[] = [{ pageNumber: 1, text: 'embedded image page', tokenCount: 3 }];

    const images = await runImagePipeline({
      doc,
      pages,
      dir: await makeTempDir(),
      gemini,
      pool: async <T,>(fn: () => Promise<T>) => fn(),
      visionModel: 'vision-x',
    });

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      page: 1,
      idx: 0,
      source: 'embedded',
      caption: 'red square',
      mime: 'image/png',
    });
    await expect(fs.stat(images[0]!.path)).resolves.toBeTruthy();
    await expect(fs.stat(images[0]!.sidecarPath)).resolves.toBeTruthy();
  });

  it('falls back to vision detection when no embedded images are found', async () => {
    const pdf = await makeBlankPdf();
    const doc = openPdf(pdf);
    const render = renderPage(doc, 0, 2.0);
    const cropped = await cropPng(render.png, {
      x: 0,
      y: 0,
      w: render.widthPx * 0.5,
      h: render.heightPx * 0.5,
    });
    const detectParts = [
      detectImageBboxPrompt(),
      {
        inlineData: {
          data: render.png.toString('base64'),
          mimeType: 'image/png',
        },
      },
    ] as const;
    const describeParts = [
      describeImagePrompt(),
      {
        inlineData: {
          data: cropped.toString('base64'),
          mimeType: 'image/png',
        },
      },
    ] as const;
    const responses = new Map([
      [hashPrompt([...detectParts]), {
        text: JSON.stringify({
          visual_elements: [
            { type: 'chart', bbox: { top: 0, left: 0, width: 50, height: 50 }, hint: 'chart' },
          ],
        }),
      }],
      [hashPrompt([...describeParts]), { text: 'detected chart' }],
    ]);
    const gemini = createStubGemini({ responses });
    let poolCalls = 0;
    const pool: LlmPool = async <T,>(fn: () => Promise<T>) => {
      poolCalls += 1;
      return fn();
    };
    const pages: RawPage[] = [{ pageNumber: 1, text: '', tokenCount: 0 }];

    const images = await runImagePipeline({
      doc,
      pages,
      dir: await makeTempDir(),
      gemini,
      pool,
      visionModel: 'vision-x',
    });

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      page: 1,
      idx: 0,
      source: 'vision',
      caption: 'detected chart',
      mime: 'image/png',
    });
    expect(poolCalls).toBe(2);
  });

  it('continues without throwing when vision detection fails for a page', async () => {
    const pdf = await makeTextPdf(
      'This page contains text but should still fall back to the vision detector when no embedded images are found.',
    );
    const doc = openPdf(pdf);
    const gemini = createStubGemini({ responses: new Map() });
    const pages: RawPage[] = [{ pageNumber: 1, text: 'plain text page', tokenCount: 3 }];

    await expect(
      runImagePipeline({
        doc,
        pages,
        dir: await makeTempDir(),
        gemini,
        pool: async <T,>(fn: () => Promise<T>) => fn(),
        visionModel: 'vision-x',
      }),
    ).resolves.toEqual([]);
  });
});
