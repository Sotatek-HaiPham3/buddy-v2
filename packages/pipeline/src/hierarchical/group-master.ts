import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { groupMasterPrompt } from '../prompts/group-master.js';
import { masterMergeResponseSchema } from '../schemas.js';
import { tagPages } from '../page-tag.js';
import type { Heading } from './subgroup-agent.js';
import type { RawPage } from '../types.js';

export type StructuredHeading = [string, string, number];

interface Opts { gemini: GeminiClient; maxRetrievals: number; }

export async function groupMaster(
  subgroupResults: Heading[][],
  pages: RawPage[],
  opts: Opts,
): Promise<StructuredHeading[]> {
  let retrieved: string | undefined;
  const byNum = new Map(pages.map(p => [p.pageNumber, p]));
  for (let attempt = 0; attempt <= opts.maxRetrievals; attempt++) {
    const r = await opts.gemini.generate(
      [groupMasterPrompt(subgroupResults, retrieved)],
      { maxOutputTokens: 4096 },
    );
    const raw = extractJson(r.text);
    const normalized = Array.isArray(raw) ? raw : [raw];
    const parsed = masterMergeResponseSchema.parse(normalized);
    const action = parsed.find(p => !Array.isArray(p)) as { action: 'retrieve'; pages: number[] } | undefined;
    if (action && attempt < opts.maxRetrievals) {
      const slice = action.pages.map(n => byNum.get(n)).filter((p): p is RawPage => !!p);
      retrieved = (retrieved ? retrieved + '\n' : '') + tagPages(slice);
      continue;
    }
    return parsed.filter((p): p is StructuredHeading => Array.isArray(p));
  }
  return [];
}
