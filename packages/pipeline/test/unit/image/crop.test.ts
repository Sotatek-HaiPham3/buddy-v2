import { cropPng } from '@buddy/shared';
import { describe, expect, it } from 'vitest';
import { materializeImageBytes } from '../../../src/image/crop.js';
import type { DetectedImage } from '../../../src/image/types.js';
import { makePdfWithEmbeddedImage } from './fixtures.js';
import { openPdf, renderPage } from '@buddy/shared';

describe('materializeImageBytes', () => {
  it('returns embedded image bytes unchanged', async () => {
    const pdf = await makePdfWithEmbeddedImage();
    const doc = openPdf(pdf);
    const pageRender = renderPage(doc, 0, 2.0);
    const image: DetectedImage = {
      page: 1,
      source: 'embedded',
      bbox: { x: 20, y: 120, w: 40, h: 50 },
      bytes: pageRender.png,
      mime: 'image/png',
    };

    await expect(materializeImageBytes(image)).resolves.toBe(image.bytes);
  });

  it('crops vision detections using the shared cropPng helper', async () => {
    const pdf = await makePdfWithEmbeddedImage();
    const doc = openPdf(pdf);
    const pageRender = renderPage(doc, 0, 2.0);
    const image: DetectedImage = {
      page: 1,
      source: 'vision',
      bbox: { x: 10, y: 15, w: 30, h: 25 },
      bytes: pageRender.png,
      mime: 'image/png',
    };

    const expected = await cropPng(pageRender.png, image.bbox);
    await expect(materializeImageBytes(image)).resolves.toEqual(expected);
  });
});
