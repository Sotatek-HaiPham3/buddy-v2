import { describe, expect, it } from 'vitest';
import { createLlmClient, resolveVisionModel } from '../../src/llm/client.js';
import type { Config } from '../../src/config.js';

function cfg(overrides: Partial<Config>): Config {
  return {
    llmProvider: 'auto',
    geminiModel: 'gemini-2.5-flash-lite',
    geminiVisionModel: 'gemini-2.5-flash-lite',
    openaiModel: 'gpt-4o-mini',
    openaiVisionModel: 'gpt-4o',
    port: 3000,
    dataDir: './data',
    maxConcurrentLlm: 10,
    maxPagesPerNode: 20,
    maxRetries: 3,
    addSummaries: true,
    imagesEnabled: true,
    tablesEnabled: true,
    hierarchicalProcessing: true,
    subgroupTokenSize: 7000,
    maxRetrievalsPerMaster: 3,
    logLevel: 'info',
    ...overrides,
  };
}

describe('createLlmClient', () => {
  it('returns a GeminiClient when LLM_PROVIDER=gemini and key present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'gemini', geminiApiKey: 'gk' }));
    expect(client).toHaveProperty('generate');
    expect(client).toHaveProperty('generateStream');
  });

  it('throws when LLM_PROVIDER=gemini and no GEMINI_API_KEY', () => {
    expect(() => createLlmClient(cfg({ llmProvider: 'gemini' }))).toThrow(
      'GEMINI_API_KEY required when LLM_PROVIDER=gemini',
    );
  });

  it('returns a client when LLM_PROVIDER=openai and key present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'openai', openaiApiKey: 'ok' }));
    expect(client).toHaveProperty('generate');
    expect(client).toHaveProperty('generateStream');
  });

  it('throws when LLM_PROVIDER=openai and no OPENAI_API_KEY', () => {
    expect(() => createLlmClient(cfg({ llmProvider: 'openai' }))).toThrow(
      'OPENAI_API_KEY required when LLM_PROVIDER=openai',
    );
  });

  it('auto: picks gemini when geminiApiKey present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'auto', geminiApiKey: 'gk' }));
    expect(client).toHaveProperty('generate');
  });

  it('auto: picks openai when only openaiApiKey present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'auto', openaiApiKey: 'ok' }));
    expect(client).toHaveProperty('generate');
  });

  it('auto: throws when neither key present', () => {
    expect(() => createLlmClient(cfg({ llmProvider: 'auto' }))).toThrow(
      'No LLM key configured',
    );
  });
});

describe('resolveVisionModel', () => {
  it('returns geminiVisionModel when provider=gemini', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'gemini', geminiApiKey: 'gk' }))).toBe(
      'gemini-2.5-flash-lite',
    );
  });

  it('returns openaiVisionModel when provider=openai', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'openai', openaiApiKey: 'ok' }))).toBe('gpt-4o');
  });

  it('auto with geminiApiKey returns geminiVisionModel', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'auto', geminiApiKey: 'gk' }))).toBe(
      'gemini-2.5-flash-lite',
    );
  });

  it('auto with only openaiApiKey returns openaiVisionModel', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'auto', openaiApiKey: 'ok' }))).toBe('gpt-4o');
  });

  it('auto with no keys throws', () => {
    expect(() => resolveVisionModel(cfg({ llmProvider: 'auto' }))).toThrow(
      'No LLM key configured',
    );
  });
});
