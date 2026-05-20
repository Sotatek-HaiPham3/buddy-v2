import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '../../src/llm/stub.js';

describe('stub gemini', () => {
  it('hashPrompt is stable for same input', () => {
    expect(hashPrompt(['hello', 'world'])).toBe(hashPrompt(['hello', 'world']));
    expect(hashPrompt(['hello'])).not.toBe(hashPrompt(['hello', 'world']));
  });

  it('returns canned response for matching prompt', async () => {
    const stub = createStubGemini({
      responses: new Map([[hashPrompt(['ping']), { text: 'pong' }]]),
    });
    const result = await stub.generate(['ping']);
    expect(result.text).toBe('pong');
  });

  it('throws on missing prompt', async () => {
    const stub = createStubGemini({ responses: new Map() });
    await expect(stub.generate(['unknown'])).rejects.toThrow(/no stub response/i);
  });

  it('records calls for inspection', async () => {
    const stub = createStubGemini({
      responses: new Map([[hashPrompt(['x']), { text: 'y' }]]),
    });
    await stub.generate(['x']);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.parts).toEqual(['x']);
  });

  it('streams chunks of canned text', async () => {
    const stub = createStubGemini({
      responses: new Map([[hashPrompt(['stream me']), { text: 'hello world' }]]),
    });
    const chunks: string[] = [];
    for await (const c of stub.generateStream(['stream me'])) {
      chunks.push(c.delta);
    }
    expect(chunks.join('')).toBe('hello world');
  });
});
