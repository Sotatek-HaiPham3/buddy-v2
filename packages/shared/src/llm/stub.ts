import { createHash } from 'node:crypto';
import type {
  ContentPart,
  GeminiClient,
  GenerateOpts,
  GenerateResult,
  GenerateStreamChunk,
} from './types.js';

export function hashPrompt(parts: ContentPart[]): string {
  const h = createHash('sha256');
  for (const p of parts) {
    if (typeof p === 'string') h.update(`s:${p} `);
    else h.update(`i:${p.inlineData.mimeType}:${p.inlineData.data.length} `);
  }
  return h.digest('hex');
}

export interface StubCall {
  parts: ContentPart[];
  opts: GenerateOpts | undefined;
}

export interface StubGemini extends GeminiClient {
  calls: StubCall[];
}

interface StubOpts {
  responses: Map<string, GenerateResult>;
  chunkSize?: number;
}

export function createStubGemini(opts: StubOpts): StubGemini {
  const calls: StubCall[] = [];
  const chunkSize = opts.chunkSize ?? 4;

  const generate = async (
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): Promise<GenerateResult> => {
    calls.push({ parts, opts: callOpts });
    const key = hashPrompt(parts);
    const r = opts.responses.get(key);
    if (!r) throw new Error(`stub gemini: no stub response for prompt hash ${key.slice(0, 12)}`);
    return r;
  };

  async function* generateStream(
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): AsyncIterable<GenerateStreamChunk> {
    const full = await generate(parts, callOpts);
    for (let i = 0; i < full.text.length; i += chunkSize) {
      yield { delta: full.text.slice(i, i + chunkSize) };
    }
  }

  return { generate, generateStream, calls };
}
