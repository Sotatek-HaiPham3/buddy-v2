import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tocTransformPrompt } from '../prompts/toc-transform.js';
import { tocTransformResponseSchema } from '../schemas.js';
import type { FlatTocEntry } from '../types.js';

interface Opts { gemini: GeminiClient; }

export async function transformToc(tocText: string, opts: Opts): Promise<FlatTocEntry[]> {
  const r = await opts.gemini.generate([tocTransformPrompt(tocText)], { maxOutputTokens: 8192 });
  const parsed = tocTransformResponseSchema.parse(extractJson(r.text));
  return parsed.table_of_contents.map(e => ({ structure: e.structure, title: e.title, page: e.page ?? undefined }));
}
