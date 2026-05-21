import type { Config } from '../config.js';
import type { GeminiClient } from './types.js';
import { createRealGemini } from './gemini.js';
import { createRealOpenAI } from './openai.js';

function resolvedProvider(cfg: Config): 'gemini' | 'openai' {
  if (cfg.llmProvider !== 'auto') return cfg.llmProvider;
  if (cfg.geminiApiKey) return 'gemini';
  if (cfg.openaiApiKey) return 'openai';
  return 'gemini'; // will throw below when key is missing
}

export function createLlmClient(cfg: Config): GeminiClient {
  if (cfg.llmProvider === 'gemini') {
    if (!cfg.geminiApiKey) throw new Error('GEMINI_API_KEY required when LLM_PROVIDER=gemini');
    return createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
  }
  if (cfg.llmProvider === 'openai') {
    if (!cfg.openaiApiKey) throw new Error('OPENAI_API_KEY required when LLM_PROVIDER=openai');
    return createRealOpenAI({ apiKey: cfg.openaiApiKey, defaultModel: cfg.openaiModel });
  }
  // auto
  if (cfg.geminiApiKey) {
    return createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
  }
  if (cfg.openaiApiKey) {
    return createRealOpenAI({ apiKey: cfg.openaiApiKey, defaultModel: cfg.openaiModel });
  }
  throw new Error('No LLM key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.');
}

export function resolveVisionModel(cfg: Config): string {
  const provider = resolvedProvider(cfg);
  return provider === 'openai' ? cfg.openaiVisionModel : cfg.geminiVisionModel;
}
