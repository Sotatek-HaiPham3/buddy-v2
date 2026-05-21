import type { GeminiClient, LlmPool } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { titleAtStartPrompt } from '../prompts/title-at-start.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; pool: LlmPool; }

export async function checkTitleAtStart(toc: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  const byNum = new Map(pages.map(p => [p.pageNumber, p]));
  return Promise.all(toc.map(entry => opts.pool(async () => {
    if (entry.physical_index === undefined) return { ...entry };
    const page = byNum.get(entry.physical_index);
    if (!page) return { ...entry };
    const r = await opts.gemini.generate([titleAtStartPrompt(entry.title, page.text)]);
    const parsed = extractJson<{ appear_start: 'yes' | 'no' }>(r.text);
    return { ...entry, appear_start: parsed.appear_start };
  })));
}
