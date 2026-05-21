import { describe, expect, it, vi } from 'vitest';
import { createRealGemini } from '../../src/llm/gemini.js';

describe('createRealGemini', () => {
  it('maps usageMetadata.cachedContentTokenCount to cachedTokens', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: {
        text: () => 'ok',
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 5,
          cachedContentTokenCount: 80,
        },
      },
    });

    const client = createRealGemini({
      apiKey: 'x',
      defaultModel: 'gemini-2.5-flash',
      sdkFactory: () =>
        ({
          getGenerativeModel: () => ({ generateContent }),
        }) as never,
    });

    const out = await client.generate(['hello']);
    expect(out).toMatchObject({ text: 'ok', promptTokens: 100, outputTokens: 5, cachedTokens: 80 });
  });
});
