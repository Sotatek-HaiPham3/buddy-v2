import type { GeminiClient, LlmPool } from '@buddy/shared';
import { chunkPages } from './chunk.js';
import { subgroupAgent, type Heading } from './subgroup-agent.js';
import { groupMaster, type StructuredHeading } from './group-master.js';
import { chapterMaster } from './chapter-master.js';
import type { RawPage } from '../types.js';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
  groupSize?: number;
}

export async function hierarchicalExtract(
  pages: RawPage[],
  chapterPrefix: string,
  opts: Opts,
): Promise<StructuredHeading[]> {
  const chunks = chunkPages(pages, opts.subgroupTokenSize);
  const headings = await Promise.all(chunks.map(c => opts.pool(() => subgroupAgent(c, { gemini: opts.gemini }))));
  const groupSize = opts.groupSize ?? 3;
  const groups: { headings: Heading[][]; pages: RawPage[] }[] = [];
  for (let i = 0; i < headings.length; i += groupSize) {
    const slice = headings.slice(i, i + groupSize);
    const groupPages = chunks.slice(i, i + groupSize).flatMap(c => c.pages);
    groups.push({ headings: slice, pages: groupPages });
  }
  const groupTocs = await Promise.all(
    groups.map(g => opts.pool(() => groupMaster(g.headings, g.pages, {
      gemini: opts.gemini, maxRetrievals: opts.maxRetrievalsPerMaster,
    }))),
  );
  return chapterMaster(groupTocs, chapterPrefix, { gemini: opts.gemini });
}
