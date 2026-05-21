import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { verifyMappingPrompt } from '../prompts/verify-mapping.js';
import { fixMappingPrompt } from '../prompts/fix-mapping.js';
import { verifyMappingResponseSchema, physicalMappingResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; maxFixRetries: number; }

export interface VerifyResult { accuracy: number; entries: FlatTocEntry[]; }

async function verifyOnce(entries: FlatTocEntry[], pages: RawPage[], gemini: GeminiClient) {
  const tagged = tagPages(pages);
  const r = await gemini.generate([verifyMappingPrompt(entries, tagged)], { maxOutputTokens: 4096 });
  const parsed = verifyMappingResponseSchema.parse(extractJson(r.text));
  const correctStructs = new Set(parsed.results.filter(x => x.correct === 'yes').map(x => x.structure));
  return { correctStructs, total: parsed.results.length };
}

export async function verifyAndFix(entries: FlatTocEntry[], pages: RawPage[], opts: Opts): Promise<VerifyResult> {
  let current = entries.filter(e => e.physical_index !== undefined);
  if (current.length === 0) return { accuracy: 0, entries };
  const { correctStructs, total } = await verifyOnce(current, pages, opts.gemini);
  const accuracy = total === 0 ? 0 : correctStructs.size / total;

  let working = entries.map(e => ({ ...e }));
  let pendingWrong = working.filter(e => e.physical_index !== undefined && !correctStructs.has(e.structure));
  for (let attempt = 0; attempt < opts.maxFixRetries && pendingWrong.length > 0; attempt++) {
    const tagged = tagPages(pages);
    const r = await opts.gemini.generate([fixMappingPrompt(pendingWrong, tagged)], { maxOutputTokens: 4096 });
    const fixed = physicalMappingResponseSchema.parse(extractJson(r.text));
    const byStruct = new Map(fixed.map(f => [f.structure, parsePhysicalIndexTag(f.physical_index)]));
    working = working.map(e => byStruct.has(e.structure) ? { ...e, physical_index: byStruct.get(e.structure) } : e);
    const v = await verifyOnce(working.filter(e => e.physical_index !== undefined), pages, opts.gemini);
    pendingWrong = working.filter(e => e.physical_index !== undefined && !v.correctStructs.has(e.structure));
  }

  return { accuracy, entries: working };
}
