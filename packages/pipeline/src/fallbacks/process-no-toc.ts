import type { GeminiClient, LlmPool } from '@buddy/shared';
import { chunkPages } from '../hierarchical/chunk.js';
import { hierarchicalExtract } from '../hierarchical/orchestrator.js';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { noTocHeadingsPrompt } from '../prompts/no-toc-headings.js';
import { noTocHeadingsResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';
import type { StructuredHeading } from '../hierarchical/group-master.js';
import { z } from 'zod';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  chunkTokens: number;
  hierarchical: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
}

type NoTocHeadingRow = z.infer<typeof noTocHeadingsResponseSchema>[number];

function fromStructuredHeading(row: StructuredHeading): FlatTocEntry {
  if (row.length === 4) {
    const [structure, title, logical, physical_index] = row;
    return logical === null
      ? { structure, title, physical_index }
      : { structure, title, page: logical, physical_index };
  }
  const [structure, title, physical_index] = row;
  return { structure, title, physical_index };
}

function fromNoTocHeading(row: NoTocHeadingRow): FlatTocEntry {
  if (Array.isArray(row)) {
    if (row.length === 4) {
      const [structure, title, logical, physical_index] = row;
      return logical === null
        ? { structure, title, physical_index }
        : { structure, title, page: logical, physical_index };
    }
    const [structure, title, physical_index] = row;
    return { structure, title, physical_index };
  }

  const physical_index = parsePhysicalIndexTag(row.physical_index);
  if (row.logical_page === undefined || row.logical_page === null) {
    return { structure: row.structure, title: row.title, physical_index };
  }
  return { structure: row.structure, title: row.title, page: row.logical_page, physical_index };
}

export async function processNoToc(pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  if (opts.hierarchical) {
    const result = await hierarchicalExtract(pages, '1', {
      gemini: opts.gemini, pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    return result.map(fromStructuredHeading);
  }
  const chunks = chunkPages(pages, opts.chunkTokens);
  const all: FlatTocEntry[] = [];
  for (const c of chunks) {
    const tagged = tagPages(c.pages);
    const r = await opts.gemini.generate([noTocHeadingsPrompt(tagged)], { maxOutputTokens: 8192 });
    const parsed = noTocHeadingsResponseSchema.parse(extractJson(r.text));
    for (const e of parsed) all.push(fromNoTocHeading(e));
  }
  return all;
}
