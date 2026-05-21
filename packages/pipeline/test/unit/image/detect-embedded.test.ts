import { openPdf } from '@buddy/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectEmbeddedImages } from '../../../src/image/detect-embedded.js';
import { makePdfWithEmbeddedImage } from './fixtures.js';

describe('detectEmbeddedImages', () => {
  let pdf: Buffer;

  beforeAll(async () => {
    pdf = await makePdfWithEmbeddedImage();
  });

  it('detects one embedded image on a page', () => {
    const doc = openPdf(pdf);
    const images = detectEmbeddedImages(doc, 1);

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      page: 1,
      source: 'embedded',
      mime: 'image/png',
      bbox: { x: 20, y: 120, w: 40, h: 50 },
    });
    expect(images[0]?.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('returns an empty array for a page without embedded images', () => {
    const doc = openPdf(pdf);
    expect(detectEmbeddedImages(doc, 2)).toEqual([]);
  });
});
