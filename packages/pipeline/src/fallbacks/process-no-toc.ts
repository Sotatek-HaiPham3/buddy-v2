import type { GeminiClient, LlmPool } from '@buddy/shared';
import { chunkPages } from '../hierarchical/chunk.js';
import { hierarchicalExtract } from '../hierarchical/orchestrator.js';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { noTocHeadingsPrompt } from '../prompts/no-toc-headings.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  chunkTokens: number;
  hierarchical: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
}

export async function processNoToc(pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  if (opts.hierarchical) {
    const result = await hierarchicalExtract(pages, '1', {
      gemini: opts.gemini, pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    return result.map(([structure, title, physical_index]) => ({ structure, title, physical_index }));
  }
  const chunks = chunkPages(pages, opts.chunkTokens);
  const all: FlatTocEntry[] = [];
  for (const c of chunks) {
    const tagged = tagPages(c.pages);
    const r = await opts.gemini.generate([noTocHeadingsPrompt(tagged)], { maxOutputTokens: 8192 });
    const parsed = physicalMappingResponseSchema.parse(extractJson(r.text));
    for (const e of parsed) all.push({ structure: e.structure, title: e.title, physical_index: parsePhysicalIndexTag(e.physical_index) });
  }
  return all;
}
