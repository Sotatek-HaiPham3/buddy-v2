import { describe, expect, it } from 'vitest';
import { summarizeHistory } from '../src/history.js';

describe('summarizeHistory', () => {
  it('summarizes recent turns', () => {
    const out = summarizeHistory([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ]);
    expect(out).toContain('asked: hello');
    expect(out).toContain('answered: world');
  });
});
