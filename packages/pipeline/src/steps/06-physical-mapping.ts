import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { physicalMappingPrompt } from '../prompts/physical-mapping.js';
import { physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; searchAfterToc?: number; }

function mostCommon(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = nums[0]!, max = 0;
  for (const [k, v] of counts) if (v > max) { max = v; best = k; }
  return best;
}

export async function mapPhysical(toc: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  const tagged = tagPages(pages);
  const r = await opts.gemini.generate([physicalMappingPrompt(toc, tagged)], { maxOutputTokens: 8192 });
  const found = physicalMappingResponseSchema.parse(extractJson(r.text));
  const byStructure = new Map(found.map(f => [f.structure, parsePhysicalIndexTag(f.physical_index)]));

  const diffs: number[] = [];
  for (const entry of toc) {
    const phys = byStructure.get(entry.structure);
    if (phys !== undefined && entry.page !== undefined) diffs.push(phys - entry.page);
  }
  const offset = mostCommon(diffs);
  if (offset === null) return toc.map(e => ({ ...e }));
  return toc.map(e => e.page !== undefined ? { ...e, physical_index: e.page + offset } : { ...e });
}
