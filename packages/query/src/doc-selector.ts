import { z } from 'zod';
import type { DocOutput, GeminiClient } from '@buddy/shared';
import { docSelectorPrompt } from './prompts/doc-selector.js';

const schema = z.object({ reasoning: z.string(), doc_ids: z.array(z.string()) });

export async function selectDocs(opts: {
  gemini: GeminiClient;
  docs: DocOutput[];
  query: string;
  historySummary: string;
}): Promise<{ reasoning: string; doc_ids: string[] }> {
  if (opts.docs.length <= 1) {
    return { reasoning: 'single document topic', doc_ids: opts.docs.map((d) => d.doc_id) };
  }
  let prompt = docSelectorPrompt(opts.docs, opts.query, opts.historySummary);
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await opts.gemini.generate([prompt], { temperature: 0 });
    try {
      return schema.parse(JSON.parse(out.text));
    } catch {
      prompt = `${prompt}\n\nReturn strictly valid JSON.`;
    }
  }
  return { reasoning: 'fallback empty selection', doc_ids: [] };
}
