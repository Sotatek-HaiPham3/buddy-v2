import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'vitest';
import { extractPages } from '../../src/steps/01-extract.js';
import { makeTinyPdf } from '../fixtures/make-tiny-pdf.js';

describe('text-extractor helper', () => {
  it('prints extracted page texts for small-with-toc fixture', async () => {
    const buf = await makeTinyPdf([
      'Annual Report 2023',
      '1. Intro: 1\n2. Body: 2',
      'Intro\nThis is the intro section.',
      'Body\nDetailed analysis content.',
    ]);
    const tmp = path.join(process.env.TEMP ?? '/tmp', 'golden-test.pdf');
    await fs.writeFile(tmp, buf);
    const pages = await extractPages(tmp);
    for (const p of pages) {
      console.log(`=== PAGE ${p.pageNumber} ===`);
      console.log(JSON.stringify(p.text));
    }
  });

  it('prints extracted page texts for no-toc fixture', async () => {
    const buf = await makeTinyPdf([
      'Annual Report 2023',
      'Introduction\nThis is the intro section.',
      'Body\nDetailed analysis content.',
    ]);
    const tmp = path.join(process.env.TEMP ?? '/tmp', 'golden-no-toc.pdf');
    await fs.writeFile(tmp, buf);
    const pages = await extractPages(tmp);
    for (const p of pages) {
      console.log(`=== PAGE ${p.pageNumber} ===`);
      console.log(JSON.stringify(p.text));
    }
  });
});
