import { describe, expect, it } from 'vitest';
import { getPageCount, getPageImage, getPageText, openPdf } from '../src/pdf.js';
import { makeSamplePdf } from './fixtures/make-sample-pdf.js';

describe('pdf wrapper', () => {
  it('opens a PDF buffer and reports page count', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    expect(getPageCount(doc)).toBe(3);
  });

  it('extracts text containing expected page marker', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    const text = getPageText(doc, 0);
    expect(text).toContain('Page 1');
    expect(text).toContain('Hello buddy 1');
  });

  it('returns text per page independently', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    expect(getPageText(doc, 1)).toContain('Page 2');
    expect(getPageText(doc, 2)).toContain('Page 3');
  });

  it('renders a page to PNG bytes', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    const png = getPageImage(doc, 0, 1.0);
    // PNG magic header: 89 50 4E 47
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
    expect(png.length).toBeGreaterThan(100);
  });

  it('throws on out-of-range page index', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    expect(() => getPageText(doc, 99)).toThrow();
  });
});
