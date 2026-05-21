import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatRange, groupByDate, truncate } from '../../lib/format.js';

describe('truncate', () => {
  it('truncates with ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
  });
});

describe('formatRange', () => {
  it('formats page range', () => {
    expect(formatRange([3, 7])).toBe('p.3-7');
  });
});

describe('groupByDate', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());

  it('groups into labels', () => {
    const now = Date.UTC(2026, 4, 21, 12, 0);
    const groups = groupByDate(
      [
        { id: 't', t: now },
        { id: 'o', t: now - 30 * 24 * 3600 * 1000 },
      ],
      (x) => x.t,
    );
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Older']);
  });
});
