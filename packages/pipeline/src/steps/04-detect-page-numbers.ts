import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { detectPageNumbersPrompt } from '../prompts/detect-page-numbers.js';
import { detectPageNumbersResponseSchema } from '../schemas.js';

interface Opts { gemini: GeminiClient; }

export async function detectPageNumbers(tocText: string, opts: Opts): Promise<boolean> {
  const r = await opts.gemini.generate([detectPageNumbersPrompt(tocText)]);
  return detectPageNumbersResponseSchema.parse(extractJson(r.text)).page_index_given_in_toc === 'yes';
}
