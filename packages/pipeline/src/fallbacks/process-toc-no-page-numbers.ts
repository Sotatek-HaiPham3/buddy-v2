import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { physicalMappingPrompt } from '../prompts/physical-mapping.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; }

export async function processTocNoPageNumbers(toc: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  const tagged = tagPages(pages);
  const r = await opts.gemini.generate([physicalMappingPrompt(toc, tagged)], { maxOutputTokens: 8192 });
  const parsed = physicalMappingResponseSchema.parse(extractJson(r.text));
  const byStruct = new Map(parsed.map(p => [p.structure, parsePhysicalIndexTag(p.physical_index)]));
  return toc.map(e => {
    const physical_index = byStruct.get(e.structure);
    return physical_index !== undefined ? { ...e, physical_index } : { ...e };
  });
}
