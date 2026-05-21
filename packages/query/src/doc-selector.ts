import { z } from 'zod';
import type { DocOutput, GeminiClient, Logger } from '@buddy/shared';
import { docSelectorPrompt } from './prompts/doc-selector.js';

const schema = z.object({ reasoning: z.string(), doc_ids: z.array(z.string()) });

export async function selectDocs(opts: {
  gemini: GeminiClient;
  docs: DocOutput[];
  query: string;
  historySummary: string;
  logger?: Logger;
}): Promise<{ reasoning: string; doc_ids: string[] }> {
  if (opts.docs.length <= 1) {
    return { reasoning: 'single document topic', doc_ids: opts.docs.map((d) => d.doc_id) };
  }
  let prompt = docSelectorPrompt(opts.docs, opts.query, opts.historySummary);
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await opts.gemini.generate([prompt], { temperature: 0 });
    if (opts.logger && (out.cachedTokens !== undefined || out.promptTokens !== undefined)) {
      opts.logger.debug(
        {
          step: 'doc-selector',
          cachedTokens: out.cachedTokens,
          promptTokens: out.promptTokens,
        },
        'LLM usage',
      );
    }
    try {
      return schema.parse(JSON.parse(out.text));
    } catch {
      prompt = `${prompt}\n\nReturn strictly valid JSON.`;
    }
  }
  return { reasoning: 'fallback empty selection', doc_ids: [] };
}
