import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { chapterMasterPrompt } from '../prompts/chapter-master.js';
import { masterMergeResponseSchema } from '../schemas.js';
import type { StructuredHeading } from './group-master.js';

interface Opts { gemini: GeminiClient; }

export async function chapterMaster(
  groupTocs: StructuredHeading[][],
  chapterPrefix: string,
  opts: Opts,
): Promise<StructuredHeading[]> {
  const r = await opts.gemini.generate([chapterMasterPrompt(groupTocs, chapterPrefix)], { maxOutputTokens: 8192 });
  const parsed = masterMergeResponseSchema.parse(extractJson(r.text));
  return parsed
    .filter((p): p is StructuredHeading => Array.isArray(p))
    .map((p) => [p[0], p[1]]);
}
