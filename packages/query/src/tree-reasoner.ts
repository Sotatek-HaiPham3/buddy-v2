import { z } from 'zod';
import type { DocOutput, GeminiClient, Logger } from '@buddy/shared';
import { treeReasonerPrompt } from './prompts/tree-reasoner.js';

const schema = z.object({
  reasoning: z.string(),
  selections: z.array(z.object({ doc_id: z.string(), node_ids: z.array(z.string()) })),
});

export async function reasonTree(opts: {
  gemini: GeminiClient;
  docs: DocOutput[];
  query: string;
  historySummary: string;
  logger?: Logger;
}): Promise<{ reasoning: string; selections: { doc_id: string; node_ids: string[] }[] }> {
  let prompt = treeReasonerPrompt(opts.docs, opts.query, opts.historySummary);
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await opts.gemini.generate([prompt], { temperature: 0 });
    if (opts.logger && (out.cachedTokens !== undefined || out.promptTokens !== undefined)) {
      opts.logger.debug(
        {
          step: 'tree-reasoner',
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
  return { reasoning: 'fallback empty selections', selections: [] };
}
