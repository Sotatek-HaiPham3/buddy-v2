import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  cropPng,
  getPageCount,
  getPageImage,
  getPageText,
  openPdf,
  renderPage,
} from '../src/pdf.js';
import { makeSamplePdf } from './fixtures/make-sample-pdf.js';

describe('pdf wrapper', () => {
  async function openSamplePdf() {
    const bytes = await makeSamplePdf();
    return openPdf(Buffer.from(bytes));
  }

  it('opens a PDF buffer and reports page count', async () => {
    const doc = await openSamplePdf();
    expect(getPageCount(doc)).toBe(3);
  });

  it('extracts text containing expected page marker', async () => {
    const doc = await openSamplePdf();
    const text = getPageText(doc, 0);
    expect(text).toContain('Page 1');
    expect(text).toContain('Hello buddy 1');
  });

  it('returns text per page independently', async () => {
    const doc = await openSamplePdf();
    expect(getPageText(doc, 1)).toContain('Page 2');
    expect(getPageText(doc, 2)).toContain('Page 3');
  });

  it('renders a page to PNG bytes', async () => {
    const doc = await openSamplePdf();
    const png = getPageImage(doc, 0, 1.0);
    // PNG magic header: 89 50 4E 47
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
    expect(png.length).toBeGreaterThan(100);
  });

  it('renderPage returns PNG bytes plus pixel dimensions', async () => {
    const doc = await openSamplePdf();
    const rendered = renderPage(doc, 0, 2.0);

    expect(rendered.png.length).toBeGreaterThan(100);
    expect(rendered.png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(rendered.widthPx).toBeGreaterThan(0);
    expect(rendered.heightPx).toBeGreaterThan(0);
  });

  it('cropPng crops a region and returns a valid PNG', async () => {
    const doc = await openSamplePdf();
    const rendered = renderPage(doc, 0, 2.0);

    const cropped = await cropPng(rendered.png, { x: 0, y: 0, w: 50, h: 50 });
    const parsed = PNG.sync.read(cropped);

    expect(cropped.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(parsed.width).toBe(50);
    expect(parsed.height).toBe(50);
  });

  it('cropPng clamps the region to image bounds', async () => {
    const doc = await openSamplePdf();
    const rendered = renderPage(doc, 0, 2.0);

    const cropped = await cropPng(rendered.png, {
      x: -10,
      y: -10,
      w: rendered.widthPx + 100,
      h: rendered.heightPx + 100,
    });
    const parsed = PNG.sync.read(cropped);

    expect(cropped.length).toBeGreaterThan(0);
    expect(parsed.width).toBe(rendered.widthPx);
    expect(parsed.height).toBe(rendered.heightPx);
  });

  it('cropPng rejects non-finite bbox values', async () => {
    const doc = await openSamplePdf();
    const rendered = renderPage(doc, 0, 2.0);

    await expect(cropPng(rendered.png, { x: Number.NaN, y: 0, w: 10, h: 10 })).rejects.toThrow(
      'bbox.x must be a finite number',
    );
    await expect(
      cropPng(rendered.png, { x: 0, y: Number.POSITIVE_INFINITY, w: 10, h: 10 }),
    ).rejects.toThrow('bbox.y must be a finite number');
  });

  it('cropPng rejects zero or negative bbox size', async () => {
    const doc = await openSamplePdf();
    const rendered = renderPage(doc, 0, 2.0);

    await expect(cropPng(rendered.png, { x: 0, y: 0, w: 0, h: 10 })).rejects.toThrow(
      'bbox.w must be greater than 0',
    );
    await expect(cropPng(rendered.png, { x: 0, y: 0, w: 10, h: -1 })).rejects.toThrow(
      'bbox.h must be greater than 0',
    );
  });

  it('throws on out-of-range page index', async () => {
    const doc = await openSamplePdf();
    expect(() => getPageText(doc, 99)).toThrow();
  });
});
