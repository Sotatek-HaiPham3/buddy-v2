import { PNG } from 'pngjs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  cropPng,
  extractEmbeddedImages,
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

  it('extractEmbeddedImages returns image bytes even when preserve-images JSON omits them', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([200, 200]);
    const png = new PNG({ width: 4, height: 3 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 255;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = 255;
    }
    const embedded = PNG.sync.write(png);
    const image = await pdf.embedPng(embedded);
    page.drawImage(image, { x: 20, y: 30, width: 40, height: 50 });

    const doc = openPdf(Buffer.from(await pdf.save()));
    const images = extractEmbeddedImages(doc, 0);

    expect(images).toHaveLength(1);
    expect(images[0]?.mime).toBe('image/png');
    expect(images[0]?.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(images[0]?.bbox).toEqual({ x: 20, y: 120, w: 40, h: 50 });
  });

  it('extractEmbeddedImages normalizes embedded JPEGs to PNG bytes', async () => {
    const embeddedJpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7V+C37O3wp1v4OeBNR1H4ZeDr/ULzQbC4ubu60C0klnle3Rnd3aMlmYkkknJJJNFFFf0xln+40P8ABH8keXiP40/V/mf/2Q==',
      'base64',
    );
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([200, 200]);
    const image = await pdf.embedJpg(Uint8Array.from(embeddedJpeg));
    page.drawImage(image, { x: 20, y: 30, width: 40, height: 50 });

    const doc = openPdf(Buffer.from(await pdf.save()));
    const images = extractEmbeddedImages(doc, 0);

    expect(images).toHaveLength(1);
    expect(images[0]?.mime).toBe('image/png');
    expect(images[0]?.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('throws on out-of-range page index', async () => {
    const doc = await openSamplePdf();
    expect(() => getPageText(doc, 99)).toThrow();
  });
});
