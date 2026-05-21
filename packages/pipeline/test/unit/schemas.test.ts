import { describe, expect, it } from 'vitest';
import * as S from '../../src/schemas.js';

describe('schemas', () => {
  it('detectTocResponse', () => {
    expect(() => S.detectTocResponseSchema.parse({ toc_detected: 'yes' })).not.toThrow();
    expect(() => S.detectTocResponseSchema.parse({ toc_detected: 'maybe' })).toThrow();
  });
  it('flatTocEntry', () => {
    expect(() => S.flatTocEntrySchema.parse({ structure: '1.1', title: 'Intro', page: 5 })).not.toThrow();
  });
  it('subgroupHeadings', () => {
    expect(() => S.subgroupHeadingsResponseSchema.parse([['Intro', 1], ['Bg', 3]])).not.toThrow();
  });
});
