import { describe, expect, it } from 'vitest';
import { convId, docId, msgId, nodeId, runId } from '../src/ids.js';

describe('ids', () => {
  it('convId returns string with conv_ prefix and 22+ chars', () => {
    const id = convId();
    expect(id).toMatch(/^conv_[A-Za-z0-9_-]{20,}$/);
  });

  it('msgId returns string with msg_ prefix', () => {
    expect(msgId()).toMatch(/^msg_[A-Za-z0-9_-]{20,}$/);
  });

  it('docId returns string with doc_ prefix', () => {
    expect(docId()).toMatch(/^doc_[A-Za-z0-9_-]{20,}$/);
  });

  it('nodeId returns string with node_ prefix', () => {
    expect(nodeId()).toMatch(/^node_[A-Za-z0-9_-]{20,}$/);
  });

  it('runId returns string with run_ prefix', () => {
    expect(runId()).toMatch(/^run_[A-Za-z0-9_-]{20,}$/);
  });

  it('generated ids are unique across many calls', () => {
    const set = new Set(Array.from({ length: 1000 }, () => convId()));
    expect(set.size).toBe(1000);
  });
});
