import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractPages } from '../../../src/steps/01-extract.js';
import { makeTinyPdf } from '../../fixtures/make-tiny-pdf.js';

let pdfPath: string;
beforeEach(async () => {
  const buf = await makeTinyPdf(['Hello world', 'Second page text']);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p01-'));
  pdfPath = path.join(dir, 'a.pdf');
  await fs.writeFile(pdfPath, buf);
});
afterEach(async () => { await fs.rm(path.dirname(pdfPath), { recursive: true, force: true }); });

describe('extractPages', () => {
  it('returns one entry per page with text + tokenCount', async () => {
    const pages = await extractPages(pdfPath);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.pageNumber).toBe(1);
    expect(pages[0]?.text).toContain('Hello world');
    expect(pages[0]?.tokenCount).toBeGreaterThan(0);
    expect(pages[1]?.text).toContain('Second page');
  });
});
