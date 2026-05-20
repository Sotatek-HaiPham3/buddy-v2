import { describe, expect, it } from 'vitest';
import { configSchema, loadConfig } from '../src/config.js';

describe('config', () => {
  const baseEnv = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-2.5-flash-lite',
    GEMINI_VISION_MODEL: 'gemini-2.5-flash-lite',
    PORT: '3000',
    DATA_DIR: './data',
    MAX_CONCURRENT_LLM: '10',
    MAX_PAGES_PER_NODE: '20',
    MAX_RETRIES: '3',
    ADD_SUMMARIES: 'true',
    IMAGES_ENABLED: 'true',
    TABLES_ENABLED: 'true',
    HIERARCHICAL_PROCESSING: 'true',
    SUBGROUP_TOKEN_SIZE: '7000',
    MAX_RETRIEVALS_PER_MASTER: '3',
    LOG_LEVEL: 'info',
  };

  it('parses valid env into typed config', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.geminiApiKey).toBe('test-key');
    expect(cfg.port).toBe(3000);
    expect(cfg.maxConcurrentLlm).toBe(10);
    expect(cfg.addSummaries).toBe(true);
    expect(cfg.logLevel).toBe('info');
  });

  it('uses defaults for missing optional vars', () => {
    const cfg = loadConfig({ GEMINI_API_KEY: 'k' });
    expect(cfg.geminiModel).toBe('gemini-2.5-flash-lite');
    expect(cfg.port).toBe(3000);
    expect(cfg.dataDir).toBe('./data');
    expect(cfg.imagesEnabled).toBe(true);
  });

  it('throws on missing GEMINI_API_KEY', () => {
    expect(() => loadConfig({})).toThrow(/GEMINI_API_KEY/);
  });

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ GEMINI_API_KEY: 'k', LOG_LEVEL: 'banana' })).toThrow();
  });

  it('configSchema is exported for reuse', () => {
    expect(configSchema).toBeDefined();
  });
});
