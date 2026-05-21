import { describe, expect, it } from 'vitest';
import { normalizeForMatch, resolvePagesForHeadings } from '../../../src/fallbacks/resolve-pages.js';
import type { RawPage } from '../../../src/types.js';

const pages: RawPage[] = [
  { pageNumber: 1, text: '24\nCHIPPING POTATOES\nDetails about potatoes.', tokenCount: 10 },
  { pageNumber: 2, text: '25\nROUND (DRUMHEAD) CABBAGES\nContent', tokenCount: 5 },
  { pageNumber: 3, text: '26\nCABBAGE DESCRIPTION\nMore content', tokenCount: 5 },
];

describe('resolvePagesForHeadings', () => {
  it('maps each heading to the first physical page whose text contains its title', () => {
    const out = resolvePagesForHeadings(
      [
        { structure: '1.1', title: 'CHIPPING POTATOES' },
        { structure: '1.2', title: 'ROUND (DRUMHEAD) CABBAGES' },
        { structure: '1.3', title: 'CABBAGE DESCRIPTION' },
      ],
      pages,
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ structure: '1.1', title: 'CHIPPING POTATOES', physical_index: 1, page: 24 });
    expect(out[1]).toMatchObject({ structure: '1.2', physical_index: 2, page: 25 });
    expect(out[2]).toMatchObject({ structure: '1.3', physical_index: 3, page: 26 });
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'chipping  potatoes' }],
      pages,
    );
    expect(out[0]?.physical_index).toBe(1);
  });

  it('omits physical_index and page when no page contains the title', () => {
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'NONEXISTENT TITLE' }],
      pages,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.physical_index).toBeUndefined();
    expect(out[0]?.page).toBeUndefined();
    expect(out[0]?.title).toBe('NONEXISTENT TITLE');
  });

  it('omits page (logical) when matched page has no printed number', () => {
    const pagesWithGap: RawPage[] = [
      { pageNumber: 1, text: 'SOME HEADING\nbody text', tokenCount: 5 },
    ];
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'SOME HEADING' }],
      pagesWithGap,
    );
    expect(out[0]?.physical_index).toBe(1);
    expect(out[0]?.page).toBeUndefined();
  });

  it('handles multi-line titles', () => {
    const pagesWithMultiline: RawPage[] = [
      { pageNumber: 1, text: '50\nROUND (DRUMHEAD)\nCABBAGES\nContent', tokenCount: 7 },
    ];
    const out = resolvePagesForHeadings(
      [{ structure: '1.1', title: 'ROUND (DRUMHEAD) CABBAGES' }],
      pagesWithMultiline,
    );
    expect(out[0]?.physical_index).toBe(1);
  });

  it('handles duplicate headings (each maps to first occurrence after previous match)', () => {
    const pagesWithDup: RawPage[] = [
      { pageNumber: 1, text: '1\nCABBAGE\nFirst', tokenCount: 3 },
      { pageNumber: 2, text: '2\nCABBAGE\nSecond', tokenCount: 3 },
    ];
    const out = resolvePagesForHeadings(
      [
        { structure: '1.1', title: 'CABBAGE' },
        { structure: '1.2', title: 'CABBAGE' },
      ],
      pagesWithDup,
    );
    expect(out[0]?.physical_index).toBe(1);
    expect(out[1]?.physical_index).toBe(2);
  });
});

describe('normalizeForMatch', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeForMatch('  Hello   WORLD\n')).toBe('hello world');
  });
});
