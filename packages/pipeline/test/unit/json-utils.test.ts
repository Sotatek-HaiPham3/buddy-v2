import { describe, expect, it } from 'vitest';
import { extractJson } from '../../src/json-utils.js';

describe('extractJson', () => {
  it('parses raw JSON object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('strips plain ``` fences', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('truncates trailing garbage at last valid }', () => {
    expect(extractJson('{"a":1,"b":2} blah blah')).toEqual({ a: 1, b: 2 });
  });
  it('parses array', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });
  it('recovers truncated array at last valid ]', () => {
    expect(extractJson('[{"x":1},{"x":2}] trailing')).toEqual([{ x: 1 }, { x: 2 }]);
  });
  it('throws on unparseable', () => {
    expect(() => extractJson('not json at all')).toThrow();
  });
});
