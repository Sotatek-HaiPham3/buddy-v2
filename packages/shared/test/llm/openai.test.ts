import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealOpenAI } from '../../src/llm/openai.js';

const originalFetch = globalThis.fetch;

describe('createRealOpenAI', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses cached_tokens when present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
          usage: {
            prompt_tokens: 1200,
            completion_tokens: 10,
            prompt_tokens_details: { cached_tokens: 1024 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as never;

    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-5.4-nano' });
    const out = await client.generate(['hello']);
    expect(out).toMatchObject({ text: 'ok', promptTokens: 1200, outputTokens: 10, cachedTokens: 1024 });
  });

  it('omits cachedTokens when missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 50, completion_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as never;

    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-5.4-nano' });
    const out = await client.generate(['hello']);
    expect(out.cachedTokens).toBeUndefined();
    expect(out.promptTokens).toBe(50);
    expect(out.outputTokens).toBe(5);
  });
});
