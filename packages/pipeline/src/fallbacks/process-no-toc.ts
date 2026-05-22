import type { GeminiClient, LlmPool } from '@buddy/shared';
import { chunkPages } from '../hierarchical/chunk.js';
import { hierarchicalExtract } from '../hierarchical/orchestrator.js';
import { extractJson } from '../json-utils.js';
import { tagPages } from '../page-tag.js';
import { noTocHeadingsPrompt } from '../prompts/no-toc-headings.js';
import { noTocHeadingsResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';
import { resolvePagesForHeadings, type HeadingInput } from './resolve-pages.js';
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

function headingFromNoTocRow(row: NoTocHeadingRow): HeadingInput {
  if (Array.isArray(row)) {
    const [structure, title] = row as [string, string, ...unknown[]];
    return { structure, title };
  }
  return { structure: row.structure, title: row.title };
}

function headingFromStructuredRow(row: [string, string] | [string, string, ...unknown[]]): HeadingInput {
  return { structure: row[0], title: row[1] };
}

export async function processNoToc(pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  let headings: HeadingInput[] = [];

  if (opts.hierarchical) {
    const merged = await hierarchicalExtract(pages, '1', {
      gemini: opts.gemini,
      pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    headings = merged.map((row) => headingFromStructuredRow(row));
  } else {
    const chunks = chunkPages(pages, opts.chunkTokens);
    for (const c of chunks) {
      const tagged = tagPages(c.pages, 'annotatedText');
      const r = await opts.gemini.generate([noTocHeadingsPrompt(tagged)], { maxOutputTokens: 8192 });
      const parsed = noTocHeadingsResponseSchema.parse(extractJson(r.text));
      for (const row of parsed) headings.push(headingFromNoTocRow(row));
    }
  }

  return resolvePagesForHeadings(headings, pages);
}
