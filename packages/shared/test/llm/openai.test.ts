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

  it('sends VisionPart as image_url with base64 data URI', async () => {
    let capturedBody: unknown;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'described' } }], usage: {} }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as never;

    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    const result = await client.generate([
      'describe this image',
      { inlineData: { data: 'abc123', mimeType: 'image/png' } },
    ]);

    expect(result.text).toBe('described');
    const messages = (capturedBody as { messages: unknown[] }).messages;
    const userMsg = messages.find((m: unknown) => (m as { role: string }).role === 'user') as {
      content: Array<{ type: string; image_url?: { url: string }; text?: string }>;
    };
    expect(userMsg.content).toHaveLength(2);
    expect(userMsg.content[0]).toEqual({ type: 'text', text: 'describe this image' });
    expect(userMsg.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc123' },
    });
  });

  it('throws on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('bad request', { status: 400 }),
    ) as never;
    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    await expect(client.generate(['hello'])).rejects.toThrow('OpenAI request failed: 400');
  });

  it('generateStream yields token deltas from SSE response', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
    ].join('\n') + '\n';

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(sseLines, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    ) as never;

    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    const chunks: string[] = [];
    for await (const chunk of client.generateStream(['hi'])) {
      chunks.push(chunk.delta);
    }
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('generateStream throws on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    ) as never;
    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    const gen = client.generateStream(['hi']);
    await expect(gen.next()).rejects.toThrow('OpenAI stream failed: 401');
  });
});
